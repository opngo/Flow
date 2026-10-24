import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, MenuBtn, Modal, Panel, ProgressRing, SectionHead,
  Segmented, Select, Stat, TextInput,
} from '../components/ui';
import { bucketSessions } from '../lib/analytics';
import { download } from '../lib/platform';
import { minsToClock, minsToHM, toCSV, cn } from '../lib/utils';

type Tab = 'countdown' | 'stopwatch' | 'interval' | 'routines' | 'tracker' | 'timesheet';
const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'countdown', label: 'Countdown', icon: 'Hourglass' },
  { id: 'stopwatch', label: 'Stopwatch', icon: 'Watch' },
  { id: 'interval', label: 'Interval', icon: 'Repeat' },
  { id: 'routines', label: 'Routines', icon: 'Workflow' },
  { id: 'tracker', label: 'Tracker', icon: 'Clock' },
  { id: 'timesheet', label: 'Timesheet', icon: 'Table' },
];

const PRESETS = [
  { label: 'Tea', min: 3, icon: 'CupSoda' },
  { label: 'Laundry', min: 45, icon: 'Shirt' },
  { label: 'Stretch', min: 5, icon: 'PersonStanding' },
  { label: 'Presentation', min: 10, icon: 'Presentation' },
  { label: 'Power nap', min: 20, icon: 'Moon' },
  { label: 'Oven', min: 25, icon: 'ChefHat' },
];

export default function Timers() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get('tab') as Tab) ?? 'countdown';
  const setTab = (v: Tab) => { params.set('tab', v); setParams(params, { replace: true }); };
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const timers = db.timers;
  const toast = useUI((s) => s.toast);
  const [newOpen, setNewOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [kind, setKind] = useState<'countdown' | 'stopwatch' | 'interval'>('countdown');
  const [rounds, setRounds] = useState(4);
  const [rest, setRest] = useState(30);
  const [attach, setAttach] = useState('');
  const [exam, setExam] = useState({ open: false, minutes: 90, sections: 3, subjectId: '' });

  const bucket = useMemo(() => bucketSessions(db.focusSessions), [db.focusSessions]);
  const todayMin = bucket[format(new Date(), 'yyyy-MM-dd')]?.minutes ?? 0;
  const weekMin = Object.entries(bucket).filter(([d]) => new Date(`${d}T12:00:00`) >= startOfWeek(new Date(), { weekStartsOn: 1 })).reduce((a, [, v]) => a + v.minutes, 0);

  const start = () => {
    flow.startTimer({
      kind, label: label || (kind === 'stopwatch' ? 'Stopwatch' : `${minutes} min`),
      plannedMin: kind === 'stopwatch' ? 0 : minutes, rounds, restSec: rest,
      endsAt: kind === 'stopwatch' ? undefined : new Date(Date.now() + minutes * 60000).toISOString(),
      todoId: attach || undefined,
    });
    setNewOpen(false);
    setLabel('');
    toast({ title: 'Timer started', body: `${label || minutes + ' min'} — it keeps running while you work`, tone: 'success' });
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Timers</h1>
          <div className="mt-0.5 text-[12px] text-muted">{timers.filter((t) => t.running).length} running · owned by the clock, never drifts</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="AudioLines" onClick={() => navigate('/sound')} tip="Sound Studio">Sound</Btn>
          <Btn variant="soft" icon="Presentation" onClick={() => setExam((e) => ({ ...e, open: true }))}>Exam mode</Btn>
          <Btn variant="primary" icon="Plus" onClick={() => setNewOpen(true)}>New timer</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Today" value={minsToHM(todayMin)} icon="Timer" />
        <Stat label="This week" value={minsToHM(weekMin)} icon="CalendarDays" />
        <Stat label="Active timers" value={timers.filter((t) => t.running).length} icon="AlarmClock" tone="accent" />
        <Stat label="Sessions logged" value={db.focusSessions.length} sub="pomodoros, timers, stopwatch" icon="Database" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))} />
      </div>

      {tab === 'timesheet' ? <Timesheet /> : tab === 'tracker' ? <Tracker /> : tab === 'routines' ? <Routines /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {timers.filter((t) => (tab === 'stopwatch' ? t.kind === 'stopwatch' : tab === 'interval' ? t.kind === 'interval' : t.kind === 'countdown' || t.kind === 'exam'))
            .map((t) => {
              const elapsed = t.accumulatedMs + (t.startedAt ? Date.now() - new Date(t.startedAt).getTime() : 0);
              const remaining = t.kind === 'stopwatch'
                ? Math.max(0, elapsed / 60000)
                : Math.max(0, ((t.endsAt ? new Date(t.endsAt).getTime() : Date.now()) - Date.now()) / 60000);
              const totalMin = t.kind === 'stopwatch' ? Math.max(elapsed / 60000, 1) : t.plannedMin || 1;
              // A stopwatch has no end, so the ring shows progress through the
              // current minute rather than pretending there is a fixed total.
              const pct = t.kind === 'stopwatch'
                ? ((elapsed / 1000) % 60) / 60 * 100
                : Math.min(100, Math.max(0, (1 - remaining / totalMin) * 100));
              return (
                <Panel key={t.id} className="flex flex-col p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-s2">
                      <Icon name={t.kind === 'stopwatch' ? 'Watch' : t.kind === 'interval' ? 'Repeat' : t.kind === 'exam' ? 'Presentation' : 'Hourglass'} size={14} className="text-accent" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.label}</span>
                    {t.finished ? <Badge tone="success">done</Badge> : t.running ? <Badge tone="accent">running</Badge> : <Badge>paused</Badge>}
                    <MenuBtn trigger={<IconBtn icon="MoreHorizontal" label="Timer actions" />} items={[
                      { label: 'Attach next task', icon: 'CheckSquare', onClick: () => { const next = db.todos.find((x) => x.status !== 'done'); if (next) flow.patch('timers', t.id, { todoId: next.id }); } },
                      { label: 'Log and stop', icon: 'Check', onClick: () => flow.finishTimer(t.id) },
                      { label: 'Remove', icon: 'Trash2', danger: true, onClick: () => flow.removeTimer(t.id) },
                    ]} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressRing value={pct} size={54} stroke={5} color={t.kind === 'stopwatch' ? 'var(--success)' : 'var(--accent)'}>
                      <Icon name={t.running ? 'Activity' : 'Pause'} size={13} className="text-muted" />
                    </ProgressRing>
                    <div>
                      <div className="num text-[24px] font-semibold leading-none">
                        {t.kind === 'stopwatch' ? minsToClock(elapsed / 60000) : minsToClock(remaining)}
                      </div>
                      <div className="mt-1 text-[10.5px] text-faint">
                        {t.kind === 'interval' ? `${t.rounds} rounds · ${t.restSec}s rest` : t.kind === 'stopwatch' ? `${t.laps.length} laps` : `of ${t.plannedMin} min`}
                      </div>
                    </div>
                  </div>
                  {t.laps.length > 0 && (
                    <div className="mt-2 max-h-16 space-y-0.5 overflow-y-auto">
                      {t.laps.map((l, i) => (
                        <div key={i} className="num flex justify-between text-[10.5px] text-faint">
                          <span>Lap {i + 1}</span><span>{minsToClock(l / 60000)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-1.5">
                    {t.running ? <Btn size="sm" variant="soft" icon="Pause" onClick={() => flow.pauseTimer(t.id)}>Pause</Btn>
                      : t.finished ? <Btn size="sm" variant="primary" icon="RotateCcw" onClick={() => flow.resumeTimer(t.id)}>Restart</Btn>
                        : <Btn size="sm" variant="primary" icon="Play" onClick={() => flow.resumeTimer(t.id)}>Resume</Btn>}
                    {t.kind === 'stopwatch' && <Btn size="sm" variant="soft" icon="Flag" onClick={() => flow.addLap(t.id)}>Lap</Btn>}
                    <Btn size="sm" variant="tonal" icon="Check" onClick={() => flow.finishTimer(t.id)}>Log</Btn>
                  </div>
                </Panel>
              );
            })}
          {!timers.filter((t) => (tab === 'stopwatch' ? t.kind === 'stopwatch' : tab === 'interval' ? t.kind === 'interval' : t.kind === 'countdown' || t.kind === 'exam')).length && (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState icon="AlarmClock" title="No timers here" body="Start one from a preset below or create a custom timer."
                action={<Btn variant="primary" icon="Plus" onClick={() => setNewOpen(true)}>New timer</Btn>} />
            </div>
          )}
        </div>
      )}

      <Panel className="p-3">
        <SectionHead title="Presets" subtitle="One click to start" />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => flow.startTimer({ label: p.label, plannedMin: p.min, kind: 'countdown', endsAt: new Date(Date.now() + p.min * 60000).toISOString() })}
              className="focusable flex items-center gap-2 rounded-[12px] bg-s1 px-3 py-2 text-[12px] hover:bg-s2">
              <Icon name={p.icon} size={14} className="text-accent" />
              {p.label}
              <span className="num text-[10.5px] text-faint">{p.min}m</span>
            </button>
          ))}
        </div>
      </Panel>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New timer" subtitle="Countdown, stopwatch or interval"
        footer={<><Btn variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Btn><Btn variant="primary" icon="Play" onClick={start}>Start timer</Btn></>}>
        <div className="space-y-3">
          <Field label="Kind">
            <Segmented value={kind} onChange={setKind} options={[{ value: 'countdown', label: 'Countdown' }, { value: 'stopwatch', label: 'Stopwatch' }, { value: 'interval', label: 'Interval' }]} />
          </Field>
          <Field label="Label"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Deep work, tea, HIIT" /></Field>
          {kind !== 'stopwatch' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutes"><TextInput type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
              {kind === 'interval' && <Field label="Rounds"><TextInput type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></Field>}
            </div>
          )}
          {kind === 'interval' && (
            <Field label="Rest between rounds (seconds)"><TextInput type="number" min={5} step={5} value={rest} onChange={(e) => setRest(Number(e.target.value))} /></Field>
          )}
          <Field label="Attach to task">
            <Select value={attach} onChange={setAttach} options={[{ value: '', label: 'No task' }, ...db.todos.filter((t) => t.status !== 'done').map((t) => ({ value: t.id, label: t.title }))]} />
          </Field>
        </div>
      </Modal>

      <Modal open={exam.open} onClose={() => setExam((e) => ({ ...e, open: false }))} title="Exam mode"
        subtitle="Section timers with last-10 and last-minute warnings"
        footer={<><Btn variant="ghost" onClick={() => setExam((e) => ({ ...e, open: false }))}>Cancel</Btn>
          <Btn variant="primary" icon="Play" onClick={() => {
            flow.startTimer({ kind: 'exam', label: `Exam — ${exam.sections} sections`, plannedMin: exam.minutes, subjectId: exam.subjectId || undefined, endsAt: new Date(Date.now() + exam.minutes * 60000).toISOString(), notifKind: 'exam' });
            setExam((e) => ({ ...e, open: false }));
            toast({ title: 'Exam mode started', body: `${exam.minutes} minutes across ${exam.sections} sections` });
          }}>Start exam</Btn></>}>
        <div className="space-y-3">
          <Field label="Subject">
            <Select value={exam.subjectId} onChange={(v) => setExam((e) => ({ ...e, subjectId: v }))}
              options={[{ value: '', label: 'Choose a subject' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total minutes"><TextInput type="number" value={exam.minutes} onChange={(e) => setExam((x) => ({ ...x, minutes: Number(e.target.value) }))} /></Field>
            <Field label="Sections"><TextInput type="number" min={1} value={exam.sections} onChange={(e) => setExam((x) => ({ ...x, sections: Number(e.target.value) }))} /></Field>
          </div>
          <div className="rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
            Warnings fire at 10 minutes and 1 minute remaining. When it ends you can enter the mark straight into the gradebook.
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Tracker() {
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const [label, setLabel] = useState('');
  const [tag, setTag] = useState('');
  const running = db.timers.find((t) => t.kind === 'stopwatch' && t.running);
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <SectionHead title="Time tracker" subtitle="Start, stop, and every entry lands in your timesheet" />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="What are you doing" className="flex-1"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reading biology notes" /></Field>
          <Field label="Tag"><TextInput value={tag} onChange={(e) => setTag(e.target.value)} placeholder="bio" /></Field>
          {running ? (
            <Btn variant="primary" icon="Square" onClick={() => flow.finishTimer(running.id)}>Stop &amp; log</Btn>
          ) : (
            <Btn variant="primary" icon="Play" onClick={() => flow.startTimer({ kind: 'stopwatch', label: label || 'Tracking', plannedMin: 0 })}>Start</Btn>
          )}
        </div>
        {running && (
          <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-s1 p-3">
            <ProgressRing value={100} size={44} stroke={4} color="var(--success)"><Icon name="Activity" size={13} /></ProgressRing>
            <div>
              <div className="text-[13px]">{running.label}</div>
              <div className="num text-[11.5px] text-muted">
                {minsToClock((running.accumulatedMs + (running.startedAt ? Date.now() - new Date(running.startedAt).getTime() : 0)) / 60000)}
              </div>
            </div>
            <Btn size="sm" variant="soft" icon="Flag" className="ml-auto" onClick={() => flow.addLap(running.id)}>Lap</Btn>
          </div>
        )}
        <div className="mt-4">
          <div className="label mb-1.5">Recent manual entries</div>
          <div className="space-y-1">
            {db.focusSessions.filter((s) => s.kind === 'stopwatch' || s.kind === 'timer').slice(-8).reverse().map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5 text-[12px]">
                <Icon name="Clock" size={12} className="text-muted" />
                <span className="num text-[10.5px] text-faint">{format(new Date(s.startedAt), 'MMM d, h:mm a')}</span>
                <span className="flex-1 truncate">{s.label || db.subjects.find((x) => x.id === s.subjectId)?.name || 'Session'}</span>
                <span className="num">{minsToHM(s.actualMin)}</span>
                <IconBtn icon="Trash2" label="Delete entry" className="h-6 w-6" onClick={() => flow.deleteSession(s.id)} />
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel className="p-3">
        <SectionHead title="Daily totals" subtitle="Last 7 days" />
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(Date.now() - (6 - i) * 86400000);
          const key = format(d, 'yyyy-MM-dd');
          const mins = db.focusSessions.filter((s) => format(new Date(s.startedAt), 'yyyy-MM-dd') === key).reduce((a, b) => a + b.actualMin, 0);
          return (
            <div key={key} className="flex items-center gap-2 py-1">
              <span className="w-16 text-[11px] text-faint">{format(d, 'EEE d')}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s2">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (mins / 240) * 100)}%`, background: 'var(--accent)' }} />
              </div>
              <span className="num w-12 text-right text-[11px]">{minsToHM(mins)}</span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Timesheet() {
  const db = useFlow((s) => s.db);
  const rows = useMemo(() => db.focusSessions.map((s) => ({
    date: format(new Date(s.startedAt), 'yyyy-MM-dd'),
    start: format(new Date(s.startedAt), 'HH:mm'),
    kind: s.kind,
    subject: db.subjects.find((x) => x.id === s.subjectId)?.name ?? '',
    task: db.todos.find((t) => t.id === s.todoId)?.title ?? '',
    minutes: s.actualMin,
    label: s.label,
  })), [db.focusSessions, db.subjects, db.todos]);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.date, (m.get(r.date) ?? 0) + r.minutes));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
  }, [rows]);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <Panel className="p-3">
        <SectionHead title="Timesheet" subtitle={`${rows.length} entries`}
          right={<Btn size="sm" variant="soft" icon="Download" onClick={() => download('flow-timesheet.csv', toCSV(rows), 'text/csv')}>CSV</Btn>} />
        <div className="max-h-[440px] overflow-y-auto">
          {byDay.map(([date, mins]) => (
            <div key={date} className="border-0 py-1">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[12px] font-medium">{format(new Date(`${date}T12:00:00`), 'EEE, MMM d')}</span>
                <span className="num ml-auto text-[11px] text-accent">{minsToHM(mins)}</span>
              </div>
              {rows.filter((r) => r.date === date).map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-[8px] px-2 py-1 text-[11.5px] text-muted hover:bg-s1">
                  <span className="num w-11 text-faint">{r.start}</span>
                  <span className="flex-1 truncate">{r.task || r.label || r.kind}</span>
                  <span className="w-24 truncate text-[10.5px] text-faint">{r.subject}</span>
                  <span className="num w-10 text-right">{minsToHM(r.minutes)}</span>
                </div>
              ))}
            </div>
          ))}
          {!rows.length && <EmptyState icon="Table" title="No entries yet" />}
        </div>
      </Panel>
      <Panel className="p-3">
        <SectionHead title="Weekly totals" subtitle="Focus minutes per week" />
        <WeeklyBars rows={rows} />
      </Panel>
    </div>
  );
}

function WeeklyBars({ rows }: { rows: Array<{ date: string; minutes: number }> }) {
  const weeks = new Map<string, number>();
  rows.forEach((r) => {
    const wk = format(startOfWeek(new Date(`${r.date}T12:00:00`), { weekStartsOn: 1 }), 'MMM d');
    weeks.set(wk, (weeks.get(wk) ?? 0) + r.minutes);
  });
  const entries = Array.from(weeks.entries()).slice(-10);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height: 180 }}>
      {entries.map(([wk, mins]) => (
        <div key={wk} className="flex flex-1 flex-col items-center gap-1">
          <span className="num text-[10px] text-faint">{Math.round(mins / 60)}h</span>
          <div className="w-full rounded-t-[6px]" style={{ height: `${(mins / max) * 120}px`, background: 'color-mix(in srgb, var(--accent) 60%, transparent)' }} />
          <span className="text-[9px] text-faint">{wk}</span>
        </div>
      ))}
    </div>
  );
}

function Routines() {
  const flow = useFlow.getState();
  const db = useFlow((s) => s.db);
  const toast = useUI((s) => s.toast);
  const [steps, setSteps] = useState<Array<{ label: string; min: number }>>([
    { label: 'Warm up', min: 5 }, { label: 'Deep work', min: 25 }, { label: 'Break', min: 5 },
  ]);
  const [label, setLabel] = useState('');
  const [min, setMin] = useState(10);

  const run = () => {
    steps.forEach((s) => flow.startTimer({ label: s.label, plannedMin: s.min, kind: 'countdown', endsAt: new Date(Date.now() + s.min * 60000).toISOString() }));
    toast({ title: 'Routine started', body: `${steps.length} timers chained`, tone: 'success' });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <Panel className="p-3">
        <SectionHead title="Routine chains" subtitle="Run several timers back to back" />
        <div className="flex gap-1.5">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Step label" />
          <TextInput type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} className="w-24" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (label.trim()) { setSteps([...steps, { label, min }]); setLabel(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5 text-[12px]">
              <span className="num text-faint">{i + 1}</span>
              <span className="flex-1">{s.label}</span>
              <span className="num text-[11px] text-muted">{s.min}m</span>
              <IconBtn icon="X" label="Remove step" className="h-6 w-6" onClick={() => setSteps(steps.filter((_, x) => x !== i))} />
            </div>
          ))}
        </div>
        <Btn variant="primary" icon="Workflow" className="mt-3" onClick={run}>Run routine</Btn>
      </Panel>
      <Panel className="p-3">
        <SectionHead title="Saved routines" subtitle="Coming from your presets library" />
        <div className="space-y-2">
          {[
            { name: 'Morning study', steps: [{ label: 'Review notes', min: 10 }, { label: 'Focus', min: 25 }, { label: 'Break', min: 5 }] },
            { name: 'Evening wind-down', steps: [{ label: 'Tidy', min: 10 }, { label: 'Read', min: 30 }, { label: 'Plan tomorrow', min: 5 }] },
          ].map((r) => (
            <div key={r.name} className="rounded-[12px] bg-s1 p-2.5">
              <div className="flex items-center gap-2">
                <Icon name="Workflow" size={13} className="text-accent" />
                <span className="text-[12.5px]">{r.name}</span>
                <Btn size="sm" variant="ghost" icon="Play" className="ml-auto" onClick={() => {
                  r.steps.forEach((s) => flow.startTimer({ label: s.label, plannedMin: s.min, kind: 'countdown', endsAt: new Date(Date.now() + s.min * 60000).toISOString() }));
                  toast({ title: `${r.name} started` });
                }}>Run</Btn>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.steps.map((s) => <Chip key={s.label}>{s.label} {s.min}m</Chip>)}
              </div>
            </div>
          ))}
          {!db.timers.length && <div className="text-[11.5px] text-faint">Routines start every timer at once.</div>}
        </div>
      </Panel>
    </div>
  );
}
