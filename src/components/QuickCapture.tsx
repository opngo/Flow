import { useEffect, useState } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Icon, TextArea } from './ui';
import { parseQuickAdd } from '../lib/nlp';
import { describeRecurrence } from '../lib/recur';
import { fmtDateTime } from '../lib/utils';

/** Global quick capture: one hotkey, one line, triage later (spec §5). */
export function QuickCapture() {
  const { quickAddOpen, setQuickAdd, toast } = useUI();
  const [text, setText] = useState('');
  const db = useFlow((s) => s.db);
  const quickAdd = useFlow((s) => s.quickAdd);
  const addNote = useFlow((s) => s.addNote);

  const parsed = text.trim() ? parseQuickAdd(text, { categories: db.categories, subjects: db.subjects }) : null;

  useEffect(() => { if (!quickAddOpen) setText(''); }, [quickAddOpen]);

  const submit = (mode: 'inbox' | 'todo' | 'note') => {
    if (!text.trim()) return;
    if (mode === 'note') {
      addNote({ title: text.trim().slice(0, 60), body: text.trim(), folder: 'Inbox' });
      toast({ title: 'Captured to notes', tone: 'success' });
    } else {
      quickAdd(text, { status: mode === 'inbox' ? 'inbox' : 'todo' });
      toast({ title: mode === 'inbox' ? 'Captured to inbox' : 'Task created', body: parsed?.title, tone: 'success' });
    }
    setText('');
    setQuickAdd(false);
  };

  return (
    <Dialog open={quickAddOpen} onClose={() => setQuickAdd(false)} className="relative z-[95]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 top-[18vh] mx-auto w-full max-w-xl px-4">
        <DialogPanel className="panel-raised p-3">
          <div className="flex items-start gap-2.5">
            <Icon name="Zap" size={16} className="mt-2.5 text-accent" />
            <TextArea
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit('todo'); }
              }}
              placeholder="Read every monday at 18:00 — or Chem lab friday 5pm #school !high ~2h"
              className="bg-transparent text-[14px] placeholder:text-faint"
            />
          </div>
          {parsed && parsed.title && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11.5px] text-muted">
              <span className="chip"><Icon name="Type" size={11} />{parsed.title}</span>
              {parsed.dueAt && <span className="chip"><Icon name="CalendarClock" size={11} />{fmtDateTime(parsed.dueAt)}</span>}
              {parsed.rrule && (
                <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon name="Repeat" size={11} />
                  {describeRecurrence({ rrule: parsed.rrule, matched: parsed.repeats ?? '', auto: false })}
                </span>
              )}
              {parsed.subjectId && <span className="chip" style={{ color: db.subjects.find((s) => s.id === parsed.subjectId)?.color }}><Icon name="GraduationCap" size={11} />{db.subjects.find((s) => s.id === parsed.subjectId)?.name}</span>}
              {parsed.categoryId && <span className="chip"><Icon name="Folder" size={11} />{db.categories.find((c) => c.id === parsed.categoryId)?.name}</span>}
              {parsed.priority > 0 && <span className="chip"><Icon name="Flag" size={11} />P{4 - parsed.priority}</span>}
              {parsed.estimateMin && <span className="chip"><Icon name="Hourglass" size={11} />{parsed.estimateMin}m</span>}
              {parsed.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 px-1">
            <button onClick={() => submit('inbox')} className="focusable chip hover:bg-s3">Enter to add to inbox</button>
            <kbd className="num chip">SHIFT ENTER for note</kbd>
            <button onClick={() => submit('note')} className="focusable chip ml-auto hover:bg-s3"><Icon name="NotebookPen" size={11} /> Save as note</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
