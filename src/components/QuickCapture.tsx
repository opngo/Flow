import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { addDays, format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Icon, TextArea } from './ui';
import { parseQuickAdd } from '../lib/nlp';
import { describeRecurrence } from '../lib/recur';
import { fmtDateTime, minsToHM, uuid } from '../lib/utils';
import { activeToken, applySuggestion, parseCommands, suggestionsFor, type ParsedCommand } from '../lib/commands';
import { cn } from '../lib/utils';

const PRIORITY: Record<string, number> = { low: 1, medium: 2, med: 2, high: 3, urgent: 3, top: 3 };

/** `30m`, `2h`, `1h 30m` → minutes. */
function readMinutes(raw?: string): number | undefined {
  if (!raw) return undefined;
  const text = raw.trim().toLowerCase();
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const mins = text.match(/(\d+)\s*m/);
  const bare = /^\d+$/.test(text) ? Number(text) : undefined;
  if (!hours && !mins) return bare;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0)) || undefined;
}

const TARGET_COPY: Record<ParsedCommand['target'], { verb: string; icon: string; hint: string }> = {
  task: { verb: 'Add a task', icon: 'CheckSquare', hint: 'It lands in your inbox, ready to triage.' },
  habit: { verb: 'Create a habit', icon: 'Flame', hint: 'Tracking starts today.' },
  note: { verb: 'Write a note', icon: 'NotebookPen', hint: 'Saved to the folder you named.' },
  event: { verb: 'Schedule an event', icon: 'CalendarDays', hint: 'It appears on the calendar.' },
  mark: { verb: 'Record a mark', icon: 'Percent', hint: 'Added to the gradebook.' },
  focus: { verb: 'Start a focus block', icon: 'Timer', hint: 'The clock starts as soon as you press Enter.' },
  timer: { verb: 'Start a timer', icon: 'Hourglass', hint: 'It keeps running while you work.' },
};

/** Global capture: one line, natural language or braced commands (spec §5). */
export function QuickCapture() {
  const { quickAddOpen, quickAddSeed, setQuickAdd, toast } = useUI();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [hovered, setHovered] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const db = useFlow((s) => s.db);
  const quickAdd = useFlow((s) => s.quickAdd);
  const addNote = useFlow((s) => s.addNote);
  const addHabit = useFlow((s) => s.addHabit);
  const addEvent = useFlow((s) => s.addEvent);
  const addMark = useFlow((s) => s.addMark);
  const startFocus = useFlow((s) => s.startFocus);
  const startTimer = useFlow((s) => s.startTimer);

  const ctx = useMemo(() => ({ categories: db.categories, subjects: db.subjects, habits: db.habits, projects: db.projects, decks: db.decks }), [db]);
  const parsed = useMemo(() => parseCommands(text, ctx), [text, ctx]);
  const natural = useMemo(() => (parsed.text.trim() ? parseQuickAdd(parsed.text, { categories: db.categories, subjects: db.subjects }) : null), [parsed.text, db.categories, db.subjects]);
  const suggestions = useMemo(() => suggestionsFor(text, ctx, caret), [text, ctx, caret]);

  // A command can open the box pre-filled, with the caret already inside the
  // braces, so `{type:habit} ` drops you straight into naming the habit.
  useEffect(() => {
    if (!quickAddOpen) { setText(''); setCaret(0); return; }
    if (!quickAddSeed) return;
    setText(quickAddSeed);
    setCaret(quickAddSeed.length);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(quickAddSeed.length, quickAddSeed.length);
    });
  }, [quickAddOpen, quickAddSeed]);
  useEffect(() => { setHovered(0); }, [suggestions.length, text]);

  /* Everything the preview shows and the commit writes comes from one place,
     so the line cannot say one thing and save another. */
  const derive = useMemo(() => (p: ParsedCommand, nat: ReturnType<typeof parseQuickAdd> | null) => {
    const subj = db.subjects.find((s) => s.id === nat?.subjectId)
      ?? db.subjects.find((s) => p.fields.subject && s.name.toLowerCase().startsWith(p.fields.subject.toLowerCase()));
    const cat = db.categories.find((c) => c.id === nat?.categoryId)
      ?? db.categories.find((c) => p.fields.category && c.name.toLowerCase() === p.fields.category.toLowerCase());
    return {
      subject: subj,
      category: cat,
      target: p.target,
      title: p.name ?? p.text,
      minutes: readMinutes(p.fields.for),
      // `for` is the duration key; on a task that is the estimate.
      estimate: readMinutes(p.fields.estimate) ?? readMinutes(p.fields.for) ?? nat?.estimateMin,
      priority: PRIORITY[(p.fields.priority ?? '').toLowerCase()] ?? nat?.priority ?? 0,
      tags: [...new Set([...(nat?.tags ?? []), ...(p.fields.tag ? [p.fields.tag.toLowerCase()] : [])])],
      dueAt: p.dueAt ?? nat?.dueAt,
      fields: p.fields,
    };
  }, [db.subjects, db.categories]);

  const view = useMemo(() => derive(parsed, natural), [derive, parsed, natural]);
  const { subject, category, target, title, minutes, estimate, priority, tags, dueAt } = view;

  const commit = (mode: 'inbox' | 'todo' | 'note') => {
    const raw = text.trim();
    if (!raw) return;
    /* An unfinished `{repeat:daily` is closed for you rather than dropped into
       the title: the line you meant is the line that gets saved. */
    const source = activeToken(raw, raw.length) ? `${raw}}` : raw;
    const p = source === raw ? parsed : parseCommands(source, ctx);
    const nat = source === raw ? natural : parseQuickAdd(p.text, { categories: db.categories, subjects: db.subjects });
    const d = derive(p, nat);
    const fields = d.fields;
    const summary = d.title || raw;
    const at = d.dueAt ?? new Date().toISOString();

    if (d.target === 'habit') {
      const targetValue = Number(fields.target ?? 1) || 1;
      addHabit({
        name: summary,
        description: fields.body ?? '',
        color: fields.colour ?? '#57c9a0',
        target: targetValue > 1 ? { type: 'duration', value: targetValue } : { type: 'boolean', value: 1 },
        schedule: fields.repeat
          ? { type: 'rrule', days: [1, 2, 3, 4, 5, 6, 0], times: 7, rrule: rruleFromWord(fields.repeat) }
          : { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 7 },
        startDate: at,
      });
      toast({ title: 'Habit created', body: summary, tone: 'success' });
    } else if (d.target === 'note') {
      addNote({
        title: (fields.name ?? p.text ?? raw).slice(0, 80),
        body: fields.body ?? p.text ?? raw,
        folder: fields.folder ?? 'Inbox',
        tags: d.tags,
      });
      toast({ title: 'Note saved', tone: 'success' });
    } else if (d.target === 'event') {
      const start = new Date(at);
      addEvent({
        title: summary,
        start: start.toISOString(),
        end: new Date(start.getTime() + (d.minutes ?? 60) * 60000).toISOString(),
        location: fields.place ?? '',
        notes: fields.body ?? '',
        color: fields.colour ?? d.subject?.color ?? '#7c8cff',
        subjectId: d.subject?.id,
      });
      toast({ title: 'Event scheduled', body: `${summary} · ${fmtDateTime(start.toISOString())}`, tone: 'success' });
    } else if (d.target === 'mark') {
      const score = Number(fields.score ?? 0);
      const max = Number(fields['out-of'] ?? 100) || 100;
      addMark({
        title: summary, score, max, subjectId: d.subject?.id, categoryId: d.category?.id,
        kind: 'assignment', status: 'graded', date: at,
      });
      toast({ title: 'Mark added', body: `${summary} ${score}/${max}`, tone: 'success' });
    } else if (d.target === 'focus') {
      startFocus({ subjectId: d.subject?.id });
      toast({ title: 'Focus started', body: d.minutes ? `${minsToHM(d.minutes)} block` : summary, tone: 'success' });
    } else if (d.target === 'timer') {
      startTimer({
        kind: 'countdown', label: fields.label ?? summary, plannedMin: d.minutes ?? 5,
        endsAt: new Date(Date.now() + (d.minutes ?? 5) * 60000).toISOString(),
      });
      toast({ title: 'Timer started', body: `${d.minutes ?? 5} minutes`, tone: 'success' });
    } else if (mode === 'note') {
      addNote({ title: raw.slice(0, 60), body: raw, folder: 'Inbox' });
      toast({ title: 'Captured to notes', tone: 'success' });
    } else {
      const todo = quickAdd(p.text || raw, { status: mode === 'inbox' ? 'inbox' : 'todo' });
      // Token values win over whatever the loose parse guessed.
      useFlow.getState().updateTodo(todo.id, {
        title: d.title || todo.title,
        dueAt: d.dueAt ?? todo.dueAt,
        priority: d.priority,
        tags: d.tags.length ? d.tags : todo.tags,
        estimateMin: d.estimate ?? todo.estimateMin,
        subjectId: d.subject?.id ?? todo.subjectId,
        categoryId: d.category?.id ?? todo.categoryId,
        projectId: db.projects.find((proj) => fields.project && proj.name.toLowerCase() === fields.project.toLowerCase())?.id ?? todo.projectId,
      });
      toast({ title: mode === 'inbox' ? 'Captured to inbox' : 'Task created', body: d.title, tone: 'success' });
    }
    setText('');
    setQuickAdd(false);
  };

  const pickSuggestion = (insert: string) => {
    const next = applySuggestion(text, insert, caret);
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const copy = TARGET_COPY[target];

  return (
    <Dialog open={quickAddOpen} onClose={() => setQuickAdd(false)} className="relative z-[95]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 top-[14vh] mx-auto w-full max-w-2xl px-4">
        <DialogPanel className="panel-raised overflow-hidden">
          <div className="flex items-start gap-2.5 p-3">
            <span className="mt-2 flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ background: 'var(--accent-soft)' }}>
              <Icon name={copy.icon} size={13} className="text-accent" />
            </span>
            <TextArea
              ref={areaRef}
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
              onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onKeyDown={(e) => {
                /* If the one suggestion on screen is already what the token
                   says, Enter should commit the line rather than re-pick it. */
                const typed = activeToken(text, caret)?.value?.trim().toLowerCase();
                const settled = suggestions.length === 1 && !!typed && suggestions[0].label.toLowerCase() === typed;
                if (suggestions.length && !settled) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHovered((i) => (i + 1) % suggestions.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHovered((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    pickSuggestion(suggestions[Math.min(hovered, suggestions.length - 1)].insert);
                    return;
                  }
                  if (e.key === 'Escape') { e.preventDefault(); setText(`${text.slice(0, text.lastIndexOf('{'))}`); return; }
                }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit('todo'); }
                if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); commit('note'); }
              }}
              placeholder="Read every monday at 18:00 — or { for commands: {type:habit} {name:Read} {repeat:daily}"
              className="bg-transparent text-[14px] placeholder:text-faint"
            />
          </div>

          {/* Suggestions: keys first, then the values that key accepts, each
              labelled with where the value ends up. */}
          {suggestions.length > 0 && (
            <div className="border-t px-2 py-2" style={{ borderColor: 'color-mix(in srgb, var(--text-faint) 10%, transparent)' }}>
              <div className="label px-1.5 pb-1" data-label="meta">Where it lands</div>
              <div className="max-h-[240px] overflow-y-auto">
                {suggestions.slice(0, 12).map((s, i) => (
                  <button
                    key={`${s.insert}-${i}`}
                    onMouseEnter={() => setHovered(i)}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s.insert); }}
                    className={cn('flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12.5px]',
                      i === hovered ? 'bg-s2 text-ink' : 'text-muted')}
                  >
                    <Icon name={s.icon} size={12} className="shrink-0 text-faint" />
                    <span className="num shrink-0">{s.label}</span>
                    <span className="truncate text-[11px] text-faint">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What the line will become, field by field. */}
          {(parsed.tokens.length > 0 || natural?.title) && (
            <div className="space-y-2 border-t px-3 py-2.5" style={{ borderColor: 'color-mix(in srgb, var(--text-faint) 10%, transparent)' }}>
              <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <Icon name={copy.icon} size={12} className="text-accent" />
                <span className="font-medium text-ink" data-label="minor">{copy.verb}</span>
                <span className="truncate text-faint" data-label="minor">· {copy.hint}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                {title && <Slot label="Name" value={title} icon="Type" />}
                {dueAt && <Slot label="When" value={fmtDateTime(dueAt)} icon="CalendarClock" />}
                {parsed.fields.repeat && <Slot label="Repeat" value={describeRecurrence({ rrule: rruleFromWord(parsed.fields.repeat), matched: '', auto: false })} icon="Repeat" />}
                {natural?.rrule && !parsed.fields.repeat && (
                  <Slot label="Repeat" value={describeRecurrence({ rrule: natural.rrule, matched: natural.repeats ?? '', auto: false })} icon="Repeat" />
                )}
                {subject && <Slot label="Subject" value={subject.name} icon="GraduationCap" tint={subject.color} />}
                {category && <Slot label="Category" value={category.name} icon="Folder" />}
                {priority > 0 && <Slot label="Priority" value={['', 'Low', 'Medium', 'High'][priority]} icon="Flag" />}
                {estimate && <Slot label="Estimate" value={minsToHM(estimate)} icon="Hourglass" />}
                {parsed.fields.target && <Slot label="Target" value={parsed.fields.target} icon="Target" />}
                {parsed.fields.score && <Slot label="Score" value={`${parsed.fields.score}${parsed.fields['out-of'] ? ` / ${parsed.fields['out-of']}` : ''}`} icon="Percent" />}
                {parsed.fields.place && <Slot label="Place" value={parsed.fields.place} icon="MapPin" />}
                {parsed.fields.folder && <Slot label="Folder" value={parsed.fields.folder} icon="FolderTree" />}
                {readMinutes(parsed.fields.for) && <Slot label="For" value={minsToHM(readMinutes(parsed.fields.for)!)} icon="Timer" />}
                {tags.map((t) => <Slot key={t} label="Tag" value={`#${t}`} icon="Tag" />)}
                {parsed.tokens.filter((t) => ['colour', 'remind', 'label', 'deck'].includes(t.key)).map((t) => (
                  <Slot key={t.key} label={t.label} value={t.value} icon={t.icon} />
                ))}
              </div>
            </div>
          )}

          {/* Placement: the keys that decide where the line lands, one tap
              each. Picking one drops `{key:}` at the caret with the caret
              inside, so the suggestion list is already open. */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
            {PLACEMENT.filter((pl) => !parsed.fields[pl.key]).map((pl) => (
              <button
                key={pl.key}
                onClick={() => pickSuggestion(`{${pl.key}:}`)}
                className="focusable chip hover:bg-s3"
                data-tip={`${pl.label} — ${pl.lands}`}
              >
                <Icon name={pl.icon} size={10} />
                <span className="text-faint">{pl.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <button onClick={() => commit('inbox')} className="focusable chip hover:bg-s3">
              <Icon name="Inbox" size={11} /> Enter to add to inbox
            </button>
            <span className="chip">
              <Icon name="Braces" size={11} /> {'{'} commands
            </span>
            <kbd className="num chip">SHIFT ENTER for note</kbd>
            <button onClick={() => commit('note')} className="focusable chip ml-auto hover:bg-s3">
              <Icon name="NotebookPen" size={11} /> Save as note
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

/** The placement keys offered as one-tap chips under the box. */
const PLACEMENT = [
  { key: 'when', label: 'When', icon: 'CalendarClock', lands: 'date and time' },
  { key: 'date', label: 'Date', icon: 'CalendarDays', lands: 'the day' },
  { key: 'time', label: 'Time', icon: 'Clock', lands: 'the clock' },
  { key: 'repeat', label: 'Repeat', icon: 'Repeat', lands: 'the repeat rule' },
  { key: 'priority', label: 'Priority', icon: 'Flag', lands: 'the priority flag' },
  { key: 'estimate', label: 'Estimate', icon: 'Hourglass', lands: 'the time estimate' },
  { key: 'subject', label: 'Subject', icon: 'GraduationCap', lands: 'the subject' },
  { key: 'category', label: 'Category', icon: 'Folder', lands: 'the category' },
  { key: 'tag', label: 'Tag', icon: 'Tag', lands: 'a tag' },
  { key: 'place', label: 'Place', icon: 'MapPin', lands: 'the location' },
  { key: 'folder', label: 'Folder', icon: 'FolderTree', lands: 'the notebook folder' },
  { key: 'score', label: 'Score', icon: 'Percent', lands: 'the mark' },
  { key: 'for', label: 'For', icon: 'Timer', lands: 'the duration' },
] as const;

/** One destination chip: what the value is, and where it goes. */
function Slot({ label, value, icon, tint }: { label: string; value: string; icon: string; tint?: string }) {
  return (
    <span className="chip" data-tip={`${label} → ${value}`}>
      <Icon name={icon} size={11} style={tint ? { color: tint } : undefined} />
      <span className="text-faint">{label}</span>
      <span className="max-w-[180px] truncate">{value}</span>
    </span>
  );
}

/** `daily`, `every other wednesday`, `weekdays` → an RRULE. */
function rruleFromWord(raw: string): string {
  const text = raw.trim().toLowerCase();
  const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  if (text === 'daily' || text === 'every day') return 'FREQ=DAILY';
  if (text === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (text === 'weekly' || text === 'every week') return 'FREQ=WEEKLY';
  if (text === 'monthly' || text === 'every month') return 'FREQ=MONTHLY';
  if (text === 'yearly' || text === 'every year') return 'FREQ=YEARLY';
  const other = /every other|biweekly|every 2 weeks/.test(text);
  const day = names.findIndex((n) => text.includes(n) || text.includes(n.slice(0, 3)));
  if (day >= 0) return `FREQ=WEEKLY${other ? ';INTERVAL=2' : ''};BYDAY=${days[day]}`;
  return 'FREQ=DAILY';
}
