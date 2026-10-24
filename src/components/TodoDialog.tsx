import { useEffect, useMemo, useState } from 'react';
import { useFlow } from '../store';
import { Btn, Chip, Field, Icon, IconBtn, Modal, Select, TextArea, TextInput } from './ui';
import type { Todo } from '../lib/types';
import { fmtDateTime, toLocalInput, parseLocalInput, uuid, minsToHM } from '../lib/utils';
import { RRULE_PRESETS, describeRRule } from '../lib/habits';

const PRIORITY_OPTS = [
  { value: 0, label: 'None', icon: 'Flag' },
  { value: 1, label: 'Low', icon: 'Flag' },
  { value: 2, label: 'Medium', icon: 'Flag' },
  { value: 3, label: 'High', icon: 'Flag' },
];

export function PriorityFlag({ priority, size = 13 }: { priority: number; size?: number }) {
  const color = priority >= 3 ? 'var(--danger)' : priority === 2 ? 'var(--warning)' : priority === 1 ? 'var(--accent)' : 'var(--text-faint)';
  return <Icon name="Flag" size={size} style={{ color }} className={priority >= 3 ? 'fill-current' : ''} />;
}

export function TodoDialog({ open, onClose, todo, defaults }: {
  open: boolean; onClose: () => void; todo?: Todo | null; defaults?: Partial<Todo>;
}) {
  const db = useFlow((s) => s.db);
  const addTodo = useFlow((s) => s.addTodo);
  const updateTodo = useFlow((s) => s.updateTodo);
  const deleteTodo = useFlow((s) => s.deleteTodo);
  const addReminder = useFlow((s) => s.addReminder);
  type TodoForm = Partial<Todo> & { reminderOffsets?: number[] };
  const [form, setForm] = useState<TodoForm>({});
  const [tagInput, setTagInput] = useState('');
  const [checkInput, setCheckInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(todo ?? { title: '', priority: 0, status: 'todo', tags: [], checklist: [], reminders: [], ...defaults });
    setTagInput('');
    setCheckInput('');
  }, [open, todo, defaults]);

  const set = (patch: TodoForm) => setForm((f) => ({ ...f, ...patch }));
  const subjectMarks = useMemo(() => db.subjects.filter((s) => !s.archived), [db.subjects]);

  const save = () => {
    if (!form.title?.trim()) return;
    if (todo) updateTodo(todo.id, form);
    else {
      const created = addTodo(form);
      for (const offset of form.reminderOffsets ?? []) {
        if (!form.dueAt) break;
        addReminder({
          targetKind: 'todo', targetId: created.id, title: form.title ?? 'Task',
          body: `Due ${fmtDateTime(form.dueAt)}`,
          fireAt: new Date(new Date(form.dueAt).getTime() - Number(offset) * 60000).toISOString(),
          actions: ['complete', 'snooze10', 'open'], route: '/todos',
        });
      }
    }
    onClose();
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    set({ tags: Array.from(new Set([...(form.tags ?? []), t])) });
    setTagInput('');
  };

  const addCheck = () => {
    if (!checkInput.trim()) return;
    set({ checklist: [...(form.checklist ?? []), { id: uuid(), text: checkInput.trim(), done: false }] });
    setCheckInput('');
  };

  const parents = db.todos.filter((t) => t.id !== todo?.id && !t.parentId && t.status !== 'done');

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={todo ? 'Edit task' : 'New task'}
      subtitle={todo ? `Created ${fmtDateTime(todo.createdAt)}` : 'Dates, times, reminders and links — all optional'}
      footer={
        <>
          {todo && (
            <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={() => { deleteTodo(todo.id); onClose(); }}>Delete</Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="Check" onClick={save}>{todo ? 'Save changes' : 'Create task'}</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput
          autoFocus
          value={form.title ?? ''}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
          placeholder="What needs doing?"
          className="text-[15px] font-medium"
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Category">
            <Select
              value={form.categoryId ?? ''}
              onChange={(v) => set({ categoryId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))]}
            />
          </Field>
          <Field label="Subject">
            <Select
              value={form.subjectId ?? ''}
              onChange={(v) => set({ subjectId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...subjectMarks.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]}
            />
          </Field>
          <Field label="Priority">
            <Select value={form.priority ?? 0} onChange={(v) => set({ priority: Number(v) })} options={PRIORITY_OPTS} />
          </Field>
          <Field label="Status">
            <Select
              value={form.status ?? 'todo'}
              onChange={(v) => set({ status: v as Todo['status'] })}
              options={[
                { value: 'inbox', label: 'Inbox' }, { value: 'todo', label: 'Todo' }, { value: 'doing', label: 'Doing' },
                { value: 'blocked', label: 'Blocked' }, { value: 'done', label: 'Done' },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Field label="Start">
            <TextInput type="datetime-local" value={toLocalInput(form.startAt)} onChange={(e) => set({ startAt: parseLocalInput(e.target.value) })} />
          </Field>
          <Field label="Do by">
            <TextInput type="datetime-local" value={toLocalInput(form.dueAt)} onChange={(e) => set({ dueAt: parseLocalInput(e.target.value) })} />
          </Field>
          <Field label="Estimate (minutes)">
            <TextInput type="number" min={0} step={5} value={form.estimateMin ?? ''} onChange={(e) => set({ estimateMin: e.target.value ? Number(e.target.value) : undefined })} placeholder="45" />
          </Field>
        </div>

        <Field label="Notes (markdown)">
          <TextArea rows={4} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Context, links, the plan of attack" />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="label mb-1.5">Checklist</div>
            <div className="space-y-1">
              {(form.checklist ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-[10px] bg-s2 px-2 py-1.5">
                  <button
                    onClick={() => set({ checklist: (form.checklist ?? []).map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
                    className="focusable flex h-4 w-4 items-center justify-center rounded-[5px]"
                    style={{ background: c.done ? 'var(--accent)' : 'var(--surface-3)' }}
                    aria-label={c.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {c.done && <Icon name="Check" size={10} className="text-white" />}
                  </button>
                  <span className={`flex-1 text-[12.5px] ${c.done ? 'text-faint line-through' : ''}`}>{c.text}</span>
                  <IconBtn icon="X" label="Remove" onClick={() => set({ checklist: (form.checklist ?? []).filter((x) => x.id !== c.id) })} />
                </div>
              ))}
              <div className="flex gap-1.5">
                <TextInput value={checkInput} onChange={(e) => setCheckInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCheck())} placeholder="Add step" />
                <Btn variant="soft" icon="Plus" onClick={addCheck} aria-label="Add checklist item" />
              </div>
            </div>
          </div>

          <div>
            <div className="label mb-1.5">Tags</div>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {(form.tags ?? []).map((t) => (
                <Chip key={t} onClick={() => set({ tags: (form.tags ?? []).filter((x) => x !== t) })}>#{t} <Icon name="X" size={10} /></Chip>
              ))}
            </div>
            <div className="flex gap-1.5">
              <TextInput value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="deep-work" />
              <Btn variant="soft" icon="Plus" onClick={addTag} aria-label="Add tag" />
            </div>

            <div className="label mb-1.5 mt-3">Repeat</div>
            <Select
              value={form.rrule ?? ''}
              onChange={(v) => set({ rrule: v || undefined })}
              options={[{ value: '', label: 'Does not repeat' }, ...RRULE_PRESETS.map((r) => ({ value: r.value, label: r.label }))]}
            />
            {form.rrule && <div className="mt-1 text-[11px] text-faint">{describeRRule(form.rrule)} — next instance is created when you complete this one.</div>}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="label mb-1.5">Reminders before due</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { v: 1440, l: '1 day' }, { v: 120, l: '2 hours' }, { v: 60, l: '1 hour' }, { v: 10, l: '10 min' }, { v: 0, l: 'At due time' },
              ].map((o) => {
                const active = (form.reminderOffsets ?? []).includes(o.v);
                return (
                  <button key={o.v}
                    onClick={() => set({ reminderOffsets: active ? (form.reminderOffsets ?? []).filter((x) => x !== o.v) : [...(form.reminderOffsets ?? []), o.v] })}
                    className="focusable chip hover:bg-s3"
                    style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}>
                    <Icon name={active ? 'Check' : 'Bell'} size={11} />{o.l}
                  </button>
                );
              })}
            </div>
            {!form.dueAt && <div className="mt-1 text-[11px] text-faint">Set a due date to arm reminders.</div>}
          </div>

          <div>
            <div className="label mb-1.5">Subtask of</div>
            <Select
              value={form.parentId ?? ''}
              onChange={(v) => set({ parentId: v || undefined })}
              options={[{ value: '', label: 'Top level' }, ...parents.map((p) => ({ value: p.id, label: p.title }))]}
            />
            {todo && (
              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
                <Icon name="Clock" size={12} />
                Tracked time: <span className="num">{minsToHM(todo.loggedMin ?? 0)}</span>
                {form.estimateMin ? <span className="text-faint">of {minsToHM(form.estimateMin)} estimated</span> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
