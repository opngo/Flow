import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, differenceInDays, format } from 'date-fns';
import { useFlow } from '../store';
import {
  Badge, Btn, ColorPicker, EmptyState, Field, Icon, IconBtn, IconPicker, Modal, Panel, ProgressRing, SectionHead, Segmented, Select, Slider, Stat, TextInput, Toggle,
} from '../components/ui';
import { bucketSessions } from '../lib/analytics';
import { computeSubjectGrade } from '../lib/grades';
import { habitStats } from '../lib/habits';
import { minsToHM, uuid, cn } from '../lib/utils';
import type { Goal } from '../lib/types';

type GoalView = 'board' | 'milestones' | 'timeline';

export default function Goals() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as GoalView) ?? 'board';
  const setView = (v: GoalView) => { params.set('view', v); setParams(params, { replace: true }); };
  const db = useFlow((s) => s.db);
  const updateGoal = useFlow((s) => s.updateGoal);
  const deleteGoal = useFlow((s) => s.deleteGoal);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [open, setOpen] = useState(false);

  const studyMinutes = useMemo(() => Object.values(bucketSessions(db.focusSessions)).reduce((a, b) => a + b.minutes, 0), [db.focusSessions]);

  const autoProgress = (g: Goal): { value: number; detail: string } => {
    if (g.progressMode === 'manual' || !g.link) {
      if (g.type === 'milestones' && g.milestones.length) {
        const done = g.milestones.filter((m) => m.done).length;
        return { value: (done / g.milestones.length) * 100, detail: `${done} of ${g.milestones.length} milestones` };
      }
      return { value: g.manualProgress, detail: 'manual progress' };
    }
    if (g.link.kind === 'subject') {
      const subject = db.subjects.find((s) => s.id === g.link!.id);
      if (!subject) return { value: g.manualProgress, detail: 'subject missing' };
      const grade = computeSubjectGrade(subject, db.marks);
      const target = subject.targetPct ?? 90;
      return { value: Math.min(100, ((grade.pct ?? 0) / target) * 100), detail: `${grade.pct?.toFixed(1) ?? '—'}% of ${target}% target` };
    }
    if (g.link.kind === 'habit') {
      const habit = db.habits.find((h) => h.id === g.link!.id);
      if (!habit) return { value: g.manualProgress, detail: 'habit missing' };
      const weeks = habitStats(habit, db.habitLogs, db.settings.behavior.weekStart).weeklyStreak;
      const target = g.targetValue ?? 8;
      return { value: Math.min(100, (weeks / target) * 100), detail: `${weeks} of ${target} weekly streaks` };
    }
    if (g.link.kind === 'project') {
      const tasks = db.todos.filter((t) => t.projectId === g.link!.id);
      const done = tasks.filter((t) => t.status === 'done').length;
      return { value: tasks.length ? (done / tasks.length) * 100 : 0, detail: `${done}/${tasks.length} tasks` };
    }
    if (g.type === 'numeric') {
      const target = g.targetValue ?? 1000;
      return { value: Math.min(100, (studyMinutes / target) * 100), detail: `${minsToHM(studyMinutes)} of ${minsToHM(target)}` };
    }
    return { value: g.manualProgress, detail: 'no link' };
  };

  const deadlineTone = (g: Goal) => {
    if (!g.deadline) return 'default' as const;
    const days = differenceInDays(new Date(g.deadline), new Date());
    if (days < 0) return 'danger' as const;
    if (days < 7) return 'warning' as const;
    return 'success' as const;
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Goals</h1>
          <div className="mt-0.5 text-[12px] text-muted">{db.goals.filter((g) => g.status !== 'achieved').length} in flight · {db.goals.filter((g) => g.status === 'achieved').length} achieved</div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={view} onChange={setView} options={[
            { value: 'board', label: 'Board', icon: 'LayoutGrid' },
            { value: 'milestones', label: 'Milestones', icon: 'ListChecks' },
            { value: 'timeline', label: 'Timeline', icon: 'GanttChartSquare' },
          ]} />
          <Btn variant="primary" icon="Plus" onClick={() => { setEditing(null); setOpen(true); }}>New goal</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Active goals" value={db.goals.filter((g) => g.status === 'on-track' || g.status === 'at-risk').length} icon="Target" />
        <Stat label="At risk" value={db.goals.filter((g) => g.status === 'at-risk').length} icon="CircleAlert" tone="warning" />
        <Stat label="Milestones done" value={db.goals.reduce((a, g) => a + g.milestones.filter((m) => m.done).length, 0)} icon="CheckCircle2" tone="success" />
        <Stat label="Study logged" value={minsToHM(studyMinutes)} sub="feeds numeric goals" icon="Clock" />
      </div>

      {view === 'board' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {db.goals.map((g) => {
            const prog = autoProgress(g);
            const days = g.deadline ? differenceInDays(new Date(g.deadline), new Date()) : null;
            return (
              <Panel key={g.id} className="flex flex-col p-3.5">
                <div className="flex items-start gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: `color-mix(in srgb, ${g.color} 17%, transparent)` }}>
                    <Icon name={g.icon} size={16} style={{ color: g.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => { setEditing(g); setOpen(true); }} className="focusable block truncate text-left text-[13.5px] font-medium">{g.title}</button>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone={g.status === 'achieved' ? 'success' : g.status === 'at-risk' ? 'warning' : 'accent'}>{g.status.replace('-', ' ')}</Badge>
                      {days != null && <Badge tone={deadlineTone(g)}>{days < 0 ? `${Math.abs(days)}d late` : `${days}d left`}</Badge>}
                    </div>
                  </div>
                  <ProgressRing value={prog.value} size={40} stroke={4} color={g.color} />
                </div>
                <div className="mt-3 text-[11.5px] text-muted">{prog.detail}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-s2">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${prog.value}%`, background: g.color }} />
                </div>
                {g.milestones.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {g.milestones.slice(0, 3).map((m) => (
                      <button key={m.id}
                        onClick={() => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
                        className="focusable flex w-full items-center gap-2 rounded-[8px] px-1 py-0.5 text-left text-[11.5px] hover:bg-s1">
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px]" style={{ background: m.done ? g.color : 'var(--surface-3)' }}>
                          {m.done && <Icon name="Check" size={9} className="text-white" />}
                        </span>
                        <span className={cn('flex-1 truncate', m.done && 'text-faint line-through')}>{m.title}</span>
                        {m.date && <span className="text-[10px] text-faint">{format(new Date(m.date), 'MMM d')}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1">
                  <Btn size="sm" variant="ghost" icon="Plus" onClick={() => { setEditing(g); setOpen(true); }}>Milestone</Btn>
                  <Select
                    value={g.status}
                    onChange={(v) => updateGoal(g.id, { status: v as Goal['status'] })}
                    className="ml-auto w-32"
                    options={[
                      { value: 'on-track', label: 'On track' }, { value: 'at-risk', label: 'At risk' },
                      { value: 'achieved', label: 'Achieved' }, { value: 'abandoned', label: 'Abandoned' },
                    ]}
                  />
                  <IconBtn icon="Trash2" label="Delete goal" onClick={() => deleteGoal(g.id)} />
                </div>
              </Panel>
            );
          })}
          {!db.goals.length && <EmptyState icon="Target" title="No goals yet" body="A goal can be a grade target, a study-hour count, a habit streak or a checklist of milestones." action={<Btn variant="primary" onClick={() => setOpen(true)}>Create your first goal</Btn>} />}
        </div>
      )}

      {view === 'milestones' && (
        <div className="grid gap-3 md:grid-cols-2">
          {db.goals.filter((g) => g.milestones.length).map((g) => (
            <Panel key={g.id} className="p-3">
              <SectionHead title={g.title} subtitle={`${g.milestones.filter((m) => m.done).length}/${g.milestones.length} complete`} />
              <div className="space-y-1">
                {[...g.milestones].sort((a, b) => +new Date(a.date ?? 0) - +new Date(b.date ?? 0)).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5">
                    <button onClick={() => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
                      className="focusable flex h-4 w-4 items-center justify-center rounded-[5px]" style={{ background: m.done ? g.color : 'var(--surface-3)' }}>
                      {m.done && <Icon name="Check" size={10} className="text-white" />}
                    </button>
                    <span className={cn('flex-1 text-[12px]', m.done && 'text-faint line-through')}>{m.title}</span>
                    <span className="text-[10.5px] text-faint">{m.date ? format(new Date(m.date), 'MMM d') : 'no date'}</span>
                    <IconBtn icon="X" label="Remove milestone" className="h-6 w-6" onClick={() => updateGoal(g.id, { milestones: g.milestones.filter((x) => x.id !== m.id) })} />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
          {!db.goals.some((g) => g.milestones.length) && <EmptyState icon="ListChecks" title="No milestones" body="Add milestones inside a goal to see them here." />}
        </div>
      )}

      {view === 'timeline' && (
        <Panel className="p-4">
          <SectionHead title="Progress timeline" subtitle="Deadline position of every goal" />
          <div className="space-y-3">
            {db.goals.map((g) => {
              const created = new Date(g.createdAt);
              const deadline = g.deadline ? new Date(g.deadline) : addDays(new Date(), 30);
              const total = Math.max(1, differenceInDays(deadline, created));
              const elapsed = Math.min(total, Math.max(0, differenceInDays(new Date(), created)));
              const prog = autoProgress(g);
              return (
                <div key={g.id}>
                  <div className="mb-1 flex items-center gap-2 text-[12px]">
                    <Icon name={g.icon} size={13} style={{ color: g.color }} />
                    <span className="flex-1 truncate">{g.title}</span>
                    <span className="text-[10.5px] text-faint">{format(created, 'MMM d')} → {format(deadline, 'MMM d')}</span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-s2">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${prog.value}%`, background: g.color }} />
                    <div className="absolute inset-y-0 w-[2px] bg-ink/60" style={{ left: `${(elapsed / total) * 100}%` }} title="today" />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[10px] text-faint">
                    <span>{Math.round(prog.value)}% complete</span>
                    <span>{Math.round((elapsed / total) * 100)}% of time used</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <GoalDialog open={open} onClose={() => setOpen(false)} goal={editing} />
    </div>
  );
}

function GoalDialog({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: Goal | null }) {
  const db = useFlow((s) => s.db);
  const addGoal = useFlow((s) => s.addGoal);
  const updateGoal = useFlow((s) => s.updateGoal);
  const [form, setForm] = useState<Partial<Goal>>({});
  const [milestone, setMilestone] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(goal ?? { title: '', icon: 'Target', color: '#7c8cff', type: 'outcome', progressMode: 'manual', milestones: [], status: 'on-track' });
  }, [open, goal]);

  const set = (patch: Partial<Goal>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (!form.title?.trim()) return;
    if (goal) updateGoal(goal.id, form);
    else addGoal(form);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} subtitle="Progress can be manual or pulled from real data"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="Check" onClick={save}>{goal ? 'Save' : 'Create goal'}</Btn></>}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <TextInput autoFocus value={form.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Goal title" className="text-[15px] font-medium" />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, ${form.color ?? '#7c8cff'} 18%, transparent)` }}>
            <Icon name={form.icon ?? 'Target'} size={16} style={{ color: form.color }} />
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Icon"><IconPicker value={form.icon ?? 'Target'} onChange={(v) => set({ icon: v })} color={form.color} /></Field>
          <Field label="Colour"><ColorPicker value={form.color ?? '#7c8cff'} onChange={(v) => set({ color: v })} /></Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Type">
            <Select value={form.type ?? 'outcome'} onChange={(v) => set({ type: v as Goal['type'] })}
              options={[{ value: 'outcome', label: 'Outcome (reach a grade)' }, { value: 'numeric', label: 'Numeric target' }, { value: 'habit', label: 'Habit streak' }, { value: 'milestones', label: 'Milestone checklist' }]} />
          </Field>
          <Field label="Deadline">
            <TextInput type="date" value={form.deadline ? form.deadline.slice(0, 10) : ''} onChange={(e) => set({ deadline: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Progress source">
            <Select value={form.progressMode ?? 'manual'} onChange={(v) => set({ progressMode: v as 'manual' | 'auto' })}
              options={[{ value: 'manual', label: 'Manual slider' }, { value: 'auto', label: 'Automatic from linked data' }]} />
          </Field>
          <Field label="Link">
            <Select
              value={form.link ? `${form.link.kind}:${form.link.id}` : 'none'}
              onChange={(v) => {
                if (v === 'none') { set({ link: undefined }); return; }
                const [kind, id] = v.split(':');
                set({ link: { kind: kind as 'subject' | 'habit' | 'project', id } });
              }}
              options={[
                { value: 'none', label: 'No link' },
                ...db.subjects.map((s) => ({ value: `subject:${s.id}`, label: `Subject · ${s.name}`, icon: s.icon })),
                ...db.habits.map((h) => ({ value: `habit:${h.id}`, label: `Habit · ${h.name}`, icon: h.icon })),
                ...db.projects.map((p) => ({ value: `project:${p.id}`, label: `Project · ${p.name}`, icon: p.icon })),
              ]}
            />
          </Field>
        </div>

        {form.progressMode === 'manual' && form.type !== 'milestones' && (
          <Field label="Manual progress">
            <Slider value={form.manualProgress ?? 0} min={0} max={100} step={1} label="Manual progress"
              format={(v) => `${v}%`} showValue onChange={(v) => set({ manualProgress: v })} />
          </Field>
        )}

        {(form.type === 'numeric' || form.type === 'habit') && (
          <Field label={form.type === 'numeric' ? 'Target minutes' : 'Target weekly streaks'}>
            <TextInput type="number" value={form.targetValue ?? ''} onChange={(e) => set({ targetValue: Number(e.target.value) })} />
          </Field>
        )}

        <div>
          <div className="label mb-1.5">Milestones</div>
          <div className="space-y-1">
            {(form.milestones ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5">
                <span className="flex-1 text-[12px]">{m.title}</span>
                <IconBtn icon="X" label="Remove" className="h-6 w-6" onClick={() => set({ milestones: (form.milestones ?? []).filter((x) => x.id !== m.id) })} />
              </div>
            ))}
            <div className="flex gap-1.5">
              <TextInput value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="Add a milestone"
                onKeyDown={(e) => { if (e.key === 'Enter' && milestone.trim()) { set({ milestones: [...(form.milestones ?? []), { id: uuid(), title: milestone.trim(), done: false }] }); setMilestone(''); } }} />
              <Btn variant="soft" icon="Plus" onClick={() => { if (milestone.trim()) { set({ milestones: [...(form.milestones ?? []), { id: uuid(), title: milestone.trim(), done: false }] }); setMilestone(''); } }} />
            </div>
          </div>
        </div>

        <div className="rounded-[12px] bg-s1 p-3">
          <Toggle label="Mark as achieved" checked={form.status === 'achieved'} onChange={(v) => set({ status: v ? 'achieved' : 'on-track' })} />
        </div>
      </div>
    </Modal>
  );
}
