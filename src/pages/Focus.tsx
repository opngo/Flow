import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, Field, Icon, IconBtn, Modal, Panel, ProgressRing, SectionHead, Segmented, Select,
  Stat, TextArea, Toggle,
} from '../components/ui';
import { bucketSessions } from '../lib/analytics';
import { minsToClock, minsToHM, cn } from '../lib/utils';
import { computeSubjectGrade } from '../lib/grades';

const RATINGS = [
  { value: 1, icon: 'CloudRain', label: 'Scattered' },
  { value: 2, icon: 'Cloud', label: 'Distracted' },
  { value: 3, icon: 'CloudSun', label: 'Okay' },
  { value: 4, icon: 'Sun', label: 'Locked in' },
  { value: 5, icon: 'Sparkles', label: 'Flow state' },
];

export default function Focus() {
  const db = useFlow((s) => s.db);
  // Actions are stable references in the store, so individual selectors never
  // re-render this page just because the database object changed.
  const startFocus = useFlow((s) => s.startFocus);
  const pauseFocus = useFlow((s) => s.pauseFocus);
  const resumeFocus = useFlow((s) => s.resumeFocus);
  const resetFocus = useFlow((s) => s.resetFocus);
  const skipPhase = useFlow((s) => s.skipPhase);
  const extendFocus = useFlow((s) => s.extendFocus);
  const finishPhase = useFlow((s) => s.finishPhase);
  const bumpDistraction = useFlow((s) => s.bumpDistraction);
  const patchFocus = useFlow((s) => s.patchFocus);
  const updateSettings = useFlow((s) => s.updateSettings);
  const focusMode = useUI((s) => s.focusMode);
  const setFocusMode = useUI((s) => s.setFocusMode);
  const setImmersive = useUI((s) => s.setImmersive);
  const navigate = useNavigate();
  const [promptOpen, setPromptOpen] = useState(false);
  const [rating, setRating] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const [attachTask, setAttachTask] = useState<string>('');

  const f = db.focus;
  const profile = db.settings.timerProfiles.find((p) => p.id === (f?.profileId ?? db.settings.activeProfileId)) ?? db.settings.timerProfiles[0];
  const phase = f?.phase ?? 'focus';
  const total = phase === 'focus' ? profile?.focus ?? 25 : phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;
  const remainingMs = f?.running && f.endsAt ? new Date(f.endsAt).getTime() - Date.now() : f?.remainingMs ?? total * 60000;
  const pct = Math.min(100, Math.max(0, 100 - (remainingMs / (total * 60000)) * 100));
  const running = !!f?.running;

  const bucket = useMemo(() => bucketSessions(db.focusSessions), [db.focusSessions]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayMinutes = bucket[today]?.minutes ?? 0;
  const todaySessions = db.focusSessions.filter((s) => format(new Date(s.startedAt), 'yyyy-MM-dd') === today && s.kind === 'focus');
  const weekMinutes = Object.entries(bucket)
    .filter(([d]) => (Date.now() - new Date(`${d}T12:00:00`).getTime()) < 7 * 86400000)
    .reduce((a, [, v]) => a + v.minutes, 0);

  const task = db.todos.find((t) => t.id === f?.todoId);
  const subject = db.subjects.find((s) => s.id === f?.subjectId);
  const queue = db.todos.filter((t) => t.status !== 'done' && t.status !== 'archived').slice(0, 6);

  const phaseColor = phase === 'focus' ? 'var(--accent)' : 'var(--success)';

  const onFinish = () => {
    if (phase === 'focus') setPromptOpen(true);
    else finishPhase();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Focus</h1>
          <div className="mt-0.5 text-[12px] text-muted">
            {profile?.name} · {profile?.focus}/{profile?.shortBreak}/{profile?.longBreak} · long break every {profile?.sessionsBeforeLong}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={db.settings.activeProfileId}
            onChange={(v) => { updateSettings((s) => ({ ...s, activeProfileId: v })); startFocus({ profileId: v, subjectId: f?.subjectId, todoId: f?.todoId }); }}
            options={db.settings.timerProfiles.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Btn variant="primary" icon="Maximize" onClick={() => setImmersive(true)}>Immersive</Btn>
          <Btn variant="soft" icon={focusMode ? 'Minimize2' : 'Crosshair'} onClick={() => setFocusMode(!focusMode)}>
            {focusMode ? 'Exit focus mode' : 'Focus mode'}
          </Btn>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="relative overflow-hidden p-5">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              {(['focus', 'short-break', 'long-break'] as const).map((p) => (
                <button key={p} onClick={() => skipPhase()} className={cn('focusable chip capitalize', phase === p && 'text-accent')}
                  style={phase === p ? { background: 'var(--accent-soft)' } : undefined}>
                  {p.replace('-', ' ')}
                </button>
              ))}
              <span className="ml-2 flex items-center gap-1">
                {Array.from({ length: profile?.sessionsBeforeLong ?? 4 }, (_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < (f?.sessionsDone ?? 0) % (profile?.sessionsBeforeLong ?? 4) ? 'var(--accent)' : 'var(--surface-3)' }} />
                ))}
              </span>
            </div>

            <div className="relative flex h-[248px] w-[248px] items-center justify-center">
              <svg width={248} height={248} className="absolute -rotate-90">
                <circle cx={124} cy={124} r={112} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
                <motion.circle
                  cx={124} cy={124} r={112} fill="none" stroke={phaseColor} strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 112}
                  animate={{ strokeDashoffset: 2 * Math.PI * 112 * (1 - pct / 100) }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </svg>
              {/* liquid fill */}
              <div className="absolute inset-[26px] overflow-hidden rounded-full">
                <motion.div
                  className="absolute inset-x-0 bottom-0"
                  animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${phaseColor} 35%, transparent), color-mix(in srgb, ${phaseColor} 12%, transparent))` }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="num text-[42px] font-semibold leading-none tracking-tight">{minsToClock(remainingMs / 60000)}</div>
                  <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-muted">{running ? 'running' : 'paused'}</div>
                  <div className="mt-1 text-[10px] text-faint">{(f?.sessionsDone ?? 0) + (running ? 1 : 0)} of {profile?.sessionsBeforeLong ?? 4} to a long break</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {running ? (
                <Btn variant="primary" size="lg" icon="Pause" onClick={pauseFocus}>Pause</Btn>
              ) : (
                <Btn variant="primary" size="lg" icon="Play" onClick={() => (f?.remainingMs && f.phase ? resumeFocus() : startFocus({ todoId: attachTask || undefined, subjectId: subject?.id, mixId: profile?.mixId }))}>
                  {f?.remainingMs ? 'Resume' : 'Start focus'}
                </Btn>
              )}
              <Btn variant="soft" icon="SkipForward" onClick={skipPhase}>Skip</Btn>
              <Btn variant="soft" icon="Plus" onClick={() => extendFocus(5)}>+5 min</Btn>
              <Btn variant="soft" icon="RotateCcw" onClick={resetFocus}>Reset</Btn>
              <Btn variant="tonal" icon="Check" onClick={onFinish}>Finish &amp; log</Btn>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Chip icon="CircleAlert" onClick={bumpDistraction}>Distractions: {f?.distractions ?? 0}</Chip>
              {task && <Chip icon="CheckSquare" onClick={() => navigate('/todos')}>{task.title}</Chip>}
              {subject && <Chip icon={subject.icon} color={subject.color}>{subject.name}</Chip>}
              {profile?.strict && <Badge tone="warning">strict mode</Badge>}
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel className="p-3">
            <SectionHead title="Attach" subtitle="Sessions log against whatever is linked here" />
            <div className="space-y-2">
              <Field label="Task">
                <Select
                  value={f?.todoId ?? ''}
                  onChange={(v) => {
                    const t = db.todos.find((x) => x.id === v);
                    useFlow.getState().patchFocus({ todoId: v || undefined, subjectId: t?.subjectId, categoryId: t?.categoryId });
                    setAttachTask(v);
                  }}
                  options={[{ value: '', label: 'No task' }, ...queue.map((t) => ({ value: t.id, label: t.title }))]}
                />
              </Field>
              <Field label="Subject">
                <Select
                  value={f?.subjectId ?? ''}
                  onChange={(v) => patchFocus({ subjectId: v || undefined })}
                  options={[{ value: '', label: 'No subject' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]}
                />
              </Field>
              <Field label="Sound mix">
                <Select
                  value={f?.mixId ?? ''}
                  onChange={(v) => patchFocus({ mixId: v || undefined })}
                  options={[{ value: '', label: 'None' }, ...db.mixes.map((m) => ({ value: m.id, label: m.name }))]}
                />
              </Field>
              <div className="rounded-[12px] bg-s1 p-2.5">
                <Toggle
                  label="Strict mode"
                  description="Pause is disabled during focus"
                  checked={!!profile?.strict}
                  onChange={(v) => updateSettings((s) => ({
                    ...s,
                    timerProfiles: s.timerProfiles.map((p) => (p.id === profile?.id ? { ...p, strict: v } : p)),
                  }))}
                />
                <Toggle
                  label="Auto-start breaks"
                  checked={!!profile?.autoStartBreaks}
                  onChange={(v) => updateSettings((s) => ({
                    ...s,
                    timerProfiles: s.timerProfiles.map((p) => (p.id === profile?.id ? { ...p, autoStartBreaks: v } : p)),
                  }))}
                />
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Today" value={minsToHM(todayMinutes)} sub={`${todaySessions.length} sessions`} icon="Timer" />
            <Stat label="This week" value={minsToHM(weekMinutes)} icon="CalendarDays" />
            <Stat label="Streak" value={`${(f?.sessionsDone ?? 0)}`} sub="sessions in cycle" icon="Flame" tone="warning" />
          </div>

          <Panel className="p-3">
            <SectionHead title="Queue" subtitle="Next in line — click to attach" />
            <div className="space-y-1">
              {queue.map((t) => (
                <button key={t.id} onClick={() => { setAttachTask(t.id); patchFocus({ todoId: t.id, subjectId: t.subjectId, categoryId: t.categoryId }); }}
                  className="focusable flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[12px] hover:bg-s1">
                  <Icon name="CheckSquare" size={13} className="text-faint" />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.estimateMin ? <span className="num text-[10.5px] text-faint">{t.estimateMin}m</span> : null}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-3">
          <SectionHead title="Today's sessions" subtitle="Logged automatically when a block completes" />
          <div className="space-y-1">
            {todaySessions.slice(-6).reverse().map((s) => {
              const subj = db.subjects.find((x) => x.id === s.subjectId);
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5 text-[12px]">
                  <Icon name={s.kind === 'focus' ? 'Timer' : 'Coffee'} size={12} className="text-muted" />
                  <span className="num text-[11px] text-faint">{format(new Date(s.startedAt), 'h:mm a')}</span>
                  <span className="flex-1 truncate">{subj?.name ?? s.label ?? 'Focus'}</span>
                  {s.rating && <span className="text-[10.5px] text-faint">{RATINGS[s.rating - 1]?.label}</span>}
                  <span className="num text-[11px]" style={{ color: subj?.color }}>{s.actualMin}m</span>
                </div>
              );
            })}
            {!todaySessions.length && <div className="py-6 text-center text-[12px] text-faint">No sessions logged yet today.</div>}
          </div>
        </Panel>

        <Panel className="p-3">
          <SectionHead title="Subject load" subtitle="Focus minutes by subject this month" />
          <div className="space-y-1.5">
            {db.subjects.map((s) => {
              const mins = db.focusSessions.filter((x) => x.subjectId === s.id).reduce((a, b) => a + b.actualMin, 0);
              const grade = computeSubjectGrade(s, db.marks);
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <Icon name={s.icon} size={13} style={{ color: s.color }} />
                  <span className="w-32 truncate text-[12px]">{s.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s2">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (mins / 600) * 100)}%`, background: s.color }} />
                  </div>
                  <span className="num w-12 text-right text-[10.5px] text-faint">{minsToHM(mins)}</span>
                  <span className="num w-10 text-right text-[10.5px]" style={{ color: s.color }}>{grade.pct?.toFixed(0) ?? '—'}%</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Modal open={promptOpen} onClose={() => setPromptOpen(false)} title="How did that feel?"
        subtitle="Rate the block, note distractions, then log it to your study time"
        footer={<>
          <Btn variant="ghost" onClick={() => { setPromptOpen(false); finishPhase(); }}>Skip rating</Btn>
          <Btn variant="primary" icon="Check" onClick={() => { finishPhase({ rating, note }); setPromptOpen(false); setNote(''); setRating(undefined); }}>Log session</Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <div className="label mb-1.5">Focus rating</div>
            <div className="flex gap-1.5">
              {RATINGS.map((r) => (
                <button key={r.value} onClick={() => setRating(r.value)}
                  className="focusable flex flex-1 flex-col items-center gap-1 rounded-[12px] py-2.5"
                  style={{ background: rating === r.value ? 'var(--accent-soft)' : 'var(--surface-2)', color: rating === r.value ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <Icon name={r.icon} size={17} />
                  <span className="text-[10px]">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label={`Distractions — ${f?.distractions ?? 0}`}>
            <div className="flex gap-1.5">
              <Btn size="sm" variant="soft" icon="Minus" onClick={() => patchFocus({ distractions: Math.max(0, (f?.distractions ?? 0) - 1) })} />
              <Btn size="sm" variant="soft" icon="Plus" onClick={bumpDistraction} />
            </div>
          </Field>
          <Field label="Note">
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What worked, what pulled you away" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
