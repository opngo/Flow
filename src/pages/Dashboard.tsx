import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import { useFlow } from '../store';
import { useClock } from '../hooks/useClock';
import { useUI } from '../ui';
import { TaskRow } from '../components/TaskRow';
import { TodoDialog } from '../components/TodoDialog';
import { Heatmap, HeatLegend } from '../components/Heatmap';
import { Badge, Btn, Icon, IconBtn, Panel, ProgressRing, Sparkline, PlusBtn } from '../components/ui';
import { bucketSessions, buildRollingGrid, summaryStats, thresholds } from '../lib/analytics';
import { computeSubjectGrade, termGPA } from '../lib/grades';
import { habitStats, isHabitScheduled } from '../lib/habits';
import { minsToHM, minsToClock, relDay, cn } from '../lib/utils';
import type { Todo } from '../lib/types';

type WidgetId = 'focus' | 'today' | 'habits' | 'heatmap' | 'grades' | 'goals' | 'upcoming' | 'notes' | 'quickstats';

const WIDGETS: Array<{ id: WidgetId; label: string; icon: string; span: number }> = [
  { id: 'quickstats', label: 'Quick stats', icon: 'Gauge', span: 12 },
  { id: 'focus', label: 'Focus engine', icon: 'Timer', span: 7 },
  { id: 'today', label: "Today's tasks", icon: 'Sun', span: 5 },
  { id: 'habits', label: 'Habit week', icon: 'Flame', span: 4 },
  { id: 'heatmap', label: 'Study heatmap', icon: 'LayoutGrid', span: 8 },
  { id: 'grades', label: 'Grades', icon: 'GraduationCap', span: 6 },
  { id: 'upcoming', label: 'Upcoming assessments', icon: 'CalendarClock', span: 6 },
  { id: 'goals', label: 'Goals', icon: 'Target', span: 4 },
  { id: 'notes', label: 'Recent notes', icon: 'NotebookPen', span: 8 },
];

const COLUMNS = 12;

/**
 * Pack the visible widgets into rows of twelve.
 *
 * Fixed spans leave a hole the moment a widget is switched off, and a hole in
 * a bento is the one thing that reads as broken. So the row is closed when the
 * next card would overflow, the last card in that row takes whatever is left,
 * and the final row stretches to the edge. Every row always sums to twelve.
 */
function packRows(ids: WidgetId[]): Record<string, number> {
  const out: Record<string, number> = {};
  let row: WidgetId[] = [];
  let used = 0;
  const close = () => {
    if (!row.length) return;
    out[row[row.length - 1]] += COLUMNS - used;
    row = [];
    used = 0;
  };
  for (const id of ids) {
    const preferred = Math.min(COLUMNS, WIDGETS.find((w) => w.id === id)?.span ?? 4);
    if (used + preferred > COLUMNS) close();
    row.push(id);
    used += preferred;
    out[id] = preferred;
    if (used === COLUMNS) close();
  }
  close();
  return out;
}

/**
 * The dashboard is a bento: twelve columns, one grid, dense flow, so hiding a
 * widget never leaves a hole where it used to be. Every card is built from the
 * same three pieces — a head, a body that fills the remaining height, and an
 * optional foot — which is what keeps the columns level instead of ragged.
 */
export default function Dashboard() {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const { openPalette } = useUI();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const reduce = useReducedMotion();

  const settings = db.settings;
  const weekStart = settings.behavior.weekStart;
  const widgets = settings.dashboardWidgets.length ? (settings.dashboardWidgets as WidgetId[]) : WIDGETS.map((w) => w.id);

  const now = new Date();
  /* The focus card's clock is live too: one tick per second while a block runs. */
  const tick = useClock(!!db.focus?.running);
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const open = db.todos.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const todayTasks = open.filter((t) => (t.dueAt && isSameDay(new Date(t.dueAt), now)) || (t.startAt && isSameDay(new Date(t.startAt), now)));
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < now && !isSameDay(new Date(t.dueAt), now));

  const bucket = useMemo(() => bucketSessions(db.focusSessions), [db.focusSessions]);
  const stats = useMemo(() => summaryStats(bucket), [bucket]);
  const th = useMemo(() => thresholds(Object.values(bucket).map((b) => b.minutes)), [bucket]);
  const strip = useMemo(() => buildRollingGrid(34, weekStart), [weekStart]);
  const stripValues = useMemo(() => Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, v.minutes])), [bucket]);

  const todayFocus = bucket[format(now, 'yyyy-MM-dd')]?.minutes ?? 0;
  const focus = db.focus!;
  const profile = settings.timerProfiles.find((p) => p.id === focus?.profileId);
  const total = (focus?.phase === 'focus' ? profile?.focus ?? 25 : focus?.phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15) ?? 25;
  const remainingMs = focus?.running && focus.endsAt ? new Date(focus.endsAt).getTime() - tick : focus?.remainingMs ?? total * 60000;
  const focusPct = 100 - (remainingMs / (total * 60000)) * 100;

  /** Last seven days, oldest first: the strip at the bottom of the focus card. */
  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const key = format(d, 'yyyy-MM-dd');
      return { key, day: format(d, 'EEEEE'), minutes: bucket[key]?.minutes ?? 0, isToday: isSameDay(d, now) };
    }),
    [bucket],
  );
  const weekPeak = Math.max(30, ...week.map((d) => d.minutes));

  /** The three open tasks most worth starting on: overdue first, then due
   *  soonest, then anything with an estimate. */
  const quickStart = useMemo(
    () => [...open]
      .filter((t) => t.status !== 'done')
      .sort((a, b) => {
        const at = a.dueAt ? +new Date(a.dueAt) : Infinity;
        const bt = b.dueAt ? +new Date(b.dueAt) : Infinity;
        return at - bt;
      })
      .slice(0, 3),
    [open],
  );

  /** Blocks already logged today, newest first. */
  const sessionsToday = useMemo(
    () => db.focusSessions
      .filter((s) => isSameDay(new Date(s.startedAt), now))
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
      .slice(0, 4),
    [db.focusSessions],
  );

  /** Habits across this week, for the footer strip: done over due, per day. */
  const weekHabits = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const key = format(d, 'yyyy-MM-dd');
      const due = db.habits.filter((h) => isHabitScheduled(h, d) && !h.pausedUntil).length;
      const done = db.habitLogs.filter((l) => l.date === key && !l.skipped).length;
      return { key, day: format(d, 'EEEEE'), due, done: Math.min(done, due), isToday: isSameDay(d, now) };
    });
    const due = days.reduce((a, d) => a + d.due, 0);
    const done = days.reduce((a, d) => a + d.done, 0);
    return { days, due, done };
  }, [db.habits, db.habitLogs]);
  const pct = weekHabits.due ? Math.round((weekHabits.done / weekHabits.due) * 100) : 0;

  const gpa = termGPA(db.subjects, db.marks);
  const grades = db.subjects.filter((s) => !s.archived).map((s) => ({ subject: s, grade: computeSubjectGrade(s, db.marks) }));
  const best = [...grades].filter((g) => g.grade.pct != null).sort((a, b) => (b.grade.pct ?? 0) - (a.grade.pct ?? 0));

  const upcoming = db.marks
    .filter((m) => m.status === 'pending' && new Date(m.date) >= startOfDay(now))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 4);

  const dayStart = startOfDay(now).getTime();
  const dayProgress = Math.min(100, Math.max(0, ((now.getTime() - dayStart) / 86400000) * 100));

  const todayHabits = db.habits.filter((h) => isHabitScheduled(h, now) && !h.pausedUntil);
  const checkIn = useFlow((s) => s.checkIn);
  const uncheckIn = useFlow((s) => s.uncheckIn);
  const startFocus = useFlow((s) => s.startFocus);
  const updateSettings = useFlow((s) => s.updateSettings);

  const toggleWidget = (id: WidgetId) => {
    const next = widgets.includes(id) ? widgets.filter((w) => w !== id) : [...widgets, id];
    updateSettings((s) => ({ ...s, dashboardWidgets: next }));
  };

  const has = (id: WidgetId) => widgets.includes(id);
  const spans = useMemo(() => packRows(widgets.filter((id) => WIDGETS.some((w) => w.id === id))), [widgets]);
  const spanOf = (id: WidgetId) => spans[id] ?? 4;
  const doneToday = db.todos.filter((t) => t.status === 'done' && t.completedAt && isSameDay(new Date(t.completedAt), now)).length;

  /* Entrance: one stagger for the whole page, a short spring per card, and
     nothing at all when the machine asks for less motion. */
  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.045, delayChildren: reduce ? 0 : 0.03 } } };  // reduced motion: everything lands at once

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="pb-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <div className="text-[11.5px] uppercase tracking-[0.09em] text-faint">{format(now, 'EEEE, MMMM d')}</div>
          <h1 className="h1 mt-0.5">{greeting}, here is your day</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-[12px] bg-s1 px-3 py-2 md:flex">
            <span className="text-[11px] text-faint">Day</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-s2">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${dayProgress}%` }}
                transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 0.61, 0.36, 1], delay: reduce ? 0 : 0.2 }}
                style={{ background: 'var(--accent)' }}
              />
            </div>
            <span className="num text-[11px] text-muted">{Math.round(dayProgress)}%</span>
          </div>
          {/* The capture affordance lives here rather than in the titlebar:
              the dashboard is where you start, so the command icon sits with
              the day's numbers. It opens the same palette as the shortcut. */}
          <IconBtn icon="Command" label="Commands" size={17} onClick={() => openPalette()} className="h-9 w-9 rounded-[12px] bg-s1" />
          <PlusBtn label="New task" onClick={() => { setEditing(null); setDialogOpen(true); }} />
        </div>
      </div>

      <div className="mt-3 grid grid-flow-row-dense grid-cols-1 gap-3 lg:grid-cols-12">
        {has('quickstats') && (
          <Card span={spanOf('quickstats')}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Tile label="Focus today" value={minsToHM(todayFocus)} sub={`${bucket[format(now, 'yyyy-MM-dd')]?.sessions ?? 0} sessions`} icon="Timer"
                trailing={<Sparkline data={week.map((d) => d.minutes)} width={52} height={18} color="var(--accent)" />} />
              <Tile label="Study streak" value={`${stats.streaks.current}d`} sub={`best ${stats.streaks.longest} days`} icon="Flame" tone="warning" />
              <Tile label="Open tasks" value={String(open.length)} sub={`${doneToday} done today`} icon="CheckSquare" />
              <Tile label="Term GPA" value={gpa.toFixed(2)} sub={best[0] ? `best: ${best[0].subject.name}` : 'no marks yet'} icon="GraduationCap" tone="success" />
            </div>
          </Card>
        )}

        {has('focus') && (
          <Card span={spanOf('focus')} className="relative overflow-hidden">
            <CardHead
              icon="Timer"
              title="Focus engine"
              meta={focus?.running ? 'running' : 'idle'}
              tone={focus?.running ? 'accent' : undefined}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/focus')}>Open</Btn>}
            />
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch">
              <div className="flex items-center gap-3.5 md:flex-col md:items-start md:justify-between">
                <ProgressRing value={focusPct} size={104} stroke={7} color="var(--accent)"
                  pace={focus?.running ? 1.05 : 0.45} easing={focus?.running ? 'linear' : 'easeOut'}>
                  <div className="text-center">
                    <div className="num text-[17px] font-semibold leading-none">{minsToClock(remainingMs / 60000)}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-faint">{focus?.phase?.replace('-', ' ') ?? 'focus'}</div>
                  </div>
                </ProgressRing>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Btn size="sm" variant="primary" icon={focus?.running ? 'Pause' : 'Play'}
                      onClick={() => (focus?.running ? useFlow.getState().pauseFocus() : focus?.remainingMs && focus.phase ? useFlow.getState().resumeFocus() : startFocus())}>
                      {focus?.running ? 'Pause' : 'Start'}
                    </Btn>
                    <IconBtn icon="SkipForward" label="Skip phase" onClick={() => useFlow.getState().skipPhase()} className="h-8 w-8 bg-s1" />
                    <IconBtn icon="Maximize2" label="Full-screen clock" onClick={() => useUI.getState().setImmersive(true)} className="h-8 w-8 bg-s1" />
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {(profile ? [profile.focus, profile.shortBreak, profile.longBreak] : [25, 5, 15]).map((m, i) => (
                      <span key={i} className="num rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10px] text-muted">{m}m</span>
                    ))}
                  </div>
                </div>

                {/* Totals close the clock column, so it is never half empty
                    on a tall card. */}
                <div className="flex flex-col gap-0.5 rounded-[10px] bg-s1/60 px-2.5 py-2">
                  <span className="num text-[15px] font-semibold leading-none">{minsToHM(todayFocus)}</span>
                  <span className="text-[10.5px] leading-tight text-faint">{focus?.sessionsDone ?? 0} blocks today</span>
                </div>
              </div>

              <div className="hidden w-px self-stretch md:block" style={{ background: 'color-mix(in srgb, var(--text-faint) 12%, transparent)' }} />

              {/* The right half used to be empty. It now holds what the card
                  is for: what you are focusing on, the week around today, and
                  the count that the clock alone does not tell you. */}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  onClick={() => navigate(focus?.todoId ? `/todos?task=${focus.todoId}` : '/todos')}
                  className="focusable flex items-center gap-2 rounded-[10px] bg-s1/70 px-2.5 py-2 text-left hover:bg-s2"
                  data-tip={focus?.todoId ? 'Open the attached task' : 'Pick a task to log time against'}
                >
                  <Icon name={focus?.todoId ? 'Crosshair' : 'Link2'} size={13} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">
                    {focus?.todoId ? db.todos.find((t) => t.id === focus.todoId)?.title : 'Nothing attached — pick something to focus on'}
                  </span>
                  <Icon name="ChevronRight" size={12} className="shrink-0 text-faint" />
                </button>

                <div className="flex h-[50px] shrink-0 flex-col justify-end">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-faint">
                    <span>Last 7 days</span>
                    <span className="num">{minsToHM(week.reduce((a, d) => a + d.minutes, 0))}</span>
                  </div>
                  <div className="flex flex-1 items-end gap-1">
                    {week.map((d) => (
                      <div key={d.key} className="flex h-full flex-1 flex-col justify-end" data-tip={`${d.minutes ? minsToHM(d.minutes) : 'No focus'} · ${format(new Date(`${d.key}T12:00:00`), 'EEE d MMM')}`}>
                        <motion.span
                          className="w-full rounded-[3px]"
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(3, (d.minutes / weekPeak) * 100)}%` }}
                          transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.25, ease: [0.22, 0.61, 0.36, 1] }}
                          style={{ background: d.minutes ? (d.isToday ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 40%, transparent)') : 'color-mix(in srgb, var(--text-faint) 18%, transparent)' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1 text-center text-[9px] text-faint">
                    {week.map((d) => <span key={d.key} data-label="meta" className={cn('flex-1', d.isToday && 'text-accent')}>{d.day}</span>)}
                  </div>
                </div>

                {/* What the clock alone does not say: the blocks already
                    logged today, or — if there are none yet — the three
                    things worth starting. This is the part that takes the
                    slack when the card is tall, so the column never ends in
                    empty glass. */}
                <div className="flex-1 space-y-0.5">
                  {!sessionsToday.length && quickStart.length === 0 && (
                    <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-faint">
                      <Icon name="History" size={11} /> Nothing logged yet today
                    </div>
                  )}
                  {sessionsToday.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[11.5px] hover:bg-s1">
                      <Icon name={s.kind === 'focus' ? 'Timer' : 'Coffee'} size={11} className="shrink-0 text-muted" />
                      <span className="num shrink-0 text-[10.5px] text-faint">{format(new Date(s.startedAt), 'h:mm a')}</span>
                      <span className="min-w-0 flex-1 truncate">{db.subjects.find((x) => x.id === s.subjectId)?.name ?? s.label ?? 'Focus'}</span>
                      <span className="num shrink-0 text-[10.5px]" style={{ color: db.subjects.find((x) => x.id === s.subjectId)?.color }}>{s.actualMin}m</span>
                    </div>
                  ))}
                </div>

                {/* Quick start: the three things most worth starting on,
                    one press each. Fills the card with a verb instead of
                    empty glass. */}
                {quickStart.length > 0 && !sessionsToday.length && (
                  <div className="flex-1">
                    <div className="mb-1 text-[10px] text-faint">Start with</div>
                    <div className="space-y-0.5">
                      {quickStart.map((t) => (
                        <div key={t.id} className="group flex items-center gap-2 rounded-[8px] px-1.5 py-[3px] hover:bg-s1">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: db.categories.find((c) => c.id === t.categoryId)?.color ?? 'var(--text-faint)' }} />
                          <span className="min-w-0 flex-1 truncate text-[11.5px]">{t.title}</span>
                          {t.estimateMin ? <span className="num shrink-0 text-[10px] text-faint">{t.estimateMin}m</span> : null}
                          <button
                            onClick={() => { startFocus({ todoId: t.id, subjectId: t.subjectId, categoryId: t.categoryId }); navigate('/focus'); }}
                            className="focusable flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-s2/60 text-muted transition-colors hover:bg-s2 hover:text-accent"
                            aria-label={`Start focus on ${t.title}`}
                            data-tip={`Start focus on ${t.title}`}
                          >
                            <Icon name="Play" size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!focus?.distractions && (
                  <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    <span className="num rounded-[6px] px-1.5 py-0.5 text-[10px] text-warning" style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)' }}>{focus.distractions} distractions this block</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {has('today') && (
          <Card span={spanOf('today')}>
            <CardHead
              icon="Sun"
              title="Today"
              meta={overdue.length ? `${overdue.length} overdue` : 'on track'}
              tone={overdue.length ? 'danger' : undefined}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/todos')}>All</Btn>}
            />
            <div className="flex-1 space-y-0.5">
              {[...overdue, ...todayTasks].slice(0, 6).map((t) => (
                <TaskRow key={t.id} todo={t} compact onEdit={(x) => { setEditing(x); setDialogOpen(true); }} />
              ))}
              {!overdue.length && !todayTasks.length && (
                <Empty icon="Coffee" label="Nothing due today. Pull something forward from the week." />
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t pt-2" style={{ borderColor: 'color-mix(in srgb, var(--text-faint) 10%, transparent)' }}>
              <span className="num rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10px] text-muted">{todayTasks.length} due</span>
              <span className="num rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10px] text-muted">{doneToday} done</span>
              {overdue.length > 0 && <span className="num rounded-[6px] px-1.5 py-0.5 text-[10px] text-danger" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}>{overdue.length} late</span>}
            </div>
          </Card>
        )}

        {has('habits') && (
          <Card span={spanOf('habits')}>
            <CardHead
              icon="Flame"
              title="Habits"
              meta={`${todayHabits.filter((h) => db.habitLogs.some((l) => l.habitId === h.id && l.date === format(now, 'yyyy-MM-dd') && !l.skipped)).length}/${todayHabits.length} today`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/habits')}>All</Btn>}
            />
            <div className="flex-1 space-y-1.5">
              {todayHabits.map((h) => {
                const st = habitStats(h, db.habitLogs, weekStart);
                const doneToday = db.habitLogs.some((l) => l.habitId === h.id && l.date === format(now, 'yyyy-MM-dd') && !l.skipped);
                return (
                  <div key={h.id} className="flex items-center gap-2 rounded-[10px] px-1 py-1 transition-colors hover:bg-s1">
                    <button
                      onClick={() => (doneToday ? uncheckIn(h.id, format(now, 'yyyy-MM-dd')) : checkIn(h.id, format(now, 'yyyy-MM-dd'), h.target.type === 'boolean' ? 1 : h.target.value))}
                      className="focusable flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: doneToday ? h.color : `color-mix(in srgb, ${h.color} 15%, transparent)` }}
                      aria-label={doneToday ? `Undo ${h.name}` : `Check in ${h.name}`}
                      data-tip={doneToday ? `Undo ${h.name}` : `Check in ${h.name}`}
                    >
                      <Icon name={doneToday ? 'Check' : h.icon} size={12} style={{ color: doneToday ? '#fff' : h.color }} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px]">{h.name}</div>
                      <div className="text-[10.5px] text-faint">{st.current} day streak</div>
                    </div>
                    {/* The week, one square per day, instead of a ring that only
                        showed a ratio and left the row's width unused. */}
                    <div className="flex shrink-0 gap-[3px]">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = subDays(now, 6 - i);
                        const key = format(d, 'yyyy-MM-dd');
                        const log = db.habitLogs.find((l) => l.habitId === h.id && l.date === key);
                        const future = d > now;
                        return (
                          <span key={key} className="h-[9px] w-[9px] rounded-[2.5px]" style={{
                            background: log && !log.skipped ? h.color
                              : log?.skipped ? 'color-mix(in srgb, var(--text-faint) 30%, transparent)'
                              : future ? 'transparent'
                              : `color-mix(in srgb, ${h.color} 16%, transparent)`,
                          }} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!todayHabits.length && <Empty icon="Flame" label="No habits scheduled today." />}
            </div>
            {todayHabits.length > 0 && (
              <div className="mt-2.5 border-t pt-2" style={{ borderColor: 'color-mix(in srgb, var(--text-faint) 10%, transparent)' }}>
                <div className="mb-1 flex items-center justify-between text-[10px] text-faint">
                  <span>This week</span>
                  <span className="num">{weekHabits.done}/{weekHabits.due} · {pct}%</span>
                </div>
                <div className="flex items-end gap-1">
                  {weekHabits.days.map((d) => (
                    <div key={d.key} className="flex flex-1 flex-col items-center gap-1" data-tip={`${d.done} of ${d.due} done · ${format(new Date(`${d.key}T12:00:00`), 'EEE d MMM')}`}>
                      <div className="flex h-[26px] w-full items-end overflow-hidden rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--text-faint) 14%, transparent)' }}>
                        <motion.span className="w-full"
                          initial={{ height: 0 }}
                          animate={{ height: `${d.due ? (d.done / d.due) * 100 : 0}%` }}
                          transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.25, ease: [0.22, 0.61, 0.36, 1] }}
                          style={{ background: d.isToday ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)' }} />
                      </div>
                      <span data-label="meta" className={cn('text-[9px]', d.isToday ? 'text-accent' : 'text-faint')}>{d.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {has('heatmap') && (
          <Card span={spanOf('heatmap')}>
            <CardHead
              icon="LayoutGrid"
              title="Study time"
              meta={`${minsToHM(stats.totalMin)} this year`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/analytics')}>Analytics</Btn>}
            />
            <div className="min-w-0 flex-1 overflow-x-auto pb-1">
              <Heatmap
                weeks={strip} values={stripValues} thresholds={th} cell={14} gap={4} weekStart={weekStart}
                formatTooltip={(date, value) => (
                  <>
                    <div className="font-medium">{format(new Date(`${date}T12:00:00`), 'EEE, MMM d')}</div>
                    <div className="text-muted">{value ? `${minsToHM(value)} focused` : 'No sessions'}</div>
                  </>
                )}
                onDayClick={() => navigate('/analytics')}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <HeatLegend thresholds={th} />
              <span className="ml-auto flex items-center gap-1.5">
                <MiniStat label="Streak" value={`${stats.streaks.current}d`} icon="Flame" />
                <MiniStat label="Best day" value={stats.bestDay ? minsToHM(stats.bestDay.minutes) : '—'} icon="Trophy" />
                <MiniStat label="Avg/day" value={minsToHM(Math.round(stats.totalMin / Math.max(1, Object.values(bucket).filter((b) => b.minutes > 0).length)))} icon="Gauge" />
              </span>
            </div>
          </Card>
        )}

        {has('grades') && (
          <Card span={spanOf('grades')}>
            <CardHead
              icon="GraduationCap"
              title="Grades"
              meta={`GPA ${gpa.toFixed(2)}`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/grades')}>All</Btn>}
            />
            <div className="flex-1 space-y-1">
              {grades.slice(0, 5).map(({ subject, grade }) => (
                <button key={subject.id} onClick={() => navigate(`/grades/${subject.id}`)} className="focusable flex w-full items-center gap-2 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-s1">
                  <Icon name={subject.icon} size={14} style={{ color: subject.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{subject.name}</span>
                  <Sparkline data={db.marks.filter((m) => m.subjectId === subject.id && m.status === 'graded').slice(-6).map((m) => (m.score ?? 0) / m.max * 100)} width={44} height={16} color={subject.color} />
                  <span className="num text-[12px] font-medium" style={{ color: subject.color }}>{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</span>
                  <span className="num w-7 text-right text-[11px] text-faint">{grade.letter}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {has('upcoming') && (
          <Card span={spanOf('upcoming')}>
            <CardHead
              icon="CalendarClock"
              title="Coming up"
              meta={`${upcoming.length} ahead`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/calendar')}>Calendar</Btn>}
            />
            <div className="flex-1 space-y-1">
              {upcoming.map((m) => {
                const subject = db.subjects.find((s) => s.id === m.subjectId);
                return (
                  <button key={m.id} onClick={() => navigate(`/grades/${m.subjectId}`)} className="focusable flex w-full items-center gap-2 rounded-[10px] p-1.5 text-left hover:bg-s1">
                    <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-[9px] bg-s2">
                      <span className="num text-[11.5px] font-semibold leading-none">{format(new Date(m.date), 'd')}</span>
                      <span className="text-[8px] uppercase tracking-wide text-faint">{format(new Date(m.date), 'MMM')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{m.title}</span>
                      <span className="block truncate text-[10.5px]" style={{ color: subject?.color }}>{subject?.name}</span>
                    </span>
                    <span className="shrink-0 rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10px] text-faint">{relDay(m.date)}</span>
                  </button>
                );
              })}
              {!upcoming.length && <Empty icon="CalendarCheck" label="No upcoming assessments." />}
            </div>
          </Card>
        )}

        {has('goals') && (
          <Card span={spanOf('goals')}>
            <CardHead
              icon="Target"
              title="Goals"
              meta={`${db.goals.length} active`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/goals')}>All</Btn>}
            />
            <div className="flex-1 space-y-2.5">
              {db.goals.slice(0, 4).map((g) => {
                const progress = g.type === 'milestones' && g.milestones.length
                  ? (g.milestones.filter((m) => m.done).length / g.milestones.length) * 100
                  : g.manualProgress;
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <Icon name={g.icon} size={13} style={{ color: g.color }} />
                      <span className="flex-1 truncate">{g.title}</span>
                      <span className="num text-[11px] text-faint">{Math.round(progress)}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-s2">
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                        transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 0.61, 0.36, 1], delay: reduce ? 0 : 0.2 }}
                        style={{ background: g.color }} />
                    </div>
                  </div>
                );
              })}
              {!db.goals.length && <Empty icon="Target" label="No goals yet." />}
            </div>
          </Card>
        )}

        {has('notes') && (
          <Card span={spanOf('notes')}>
            <CardHead
              icon="NotebookPen"
              title="Recent notes"
              meta={`${db.notes.length} total`}
              action={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/notes')}>All</Btn>}
            />
            <div className="grid flex-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              {[...db.notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 4).map((n) => (
                <button key={n.id} onClick={() => navigate(`/notes?open=${n.id}`)}
                  className="focusable flex flex-col rounded-[11px] bg-s1/70 p-2.5 text-left hover:bg-s2">
                  <span className="flex items-center gap-1.5">
                    <Icon name={n.journal ? 'Sun' : 'Notebook'} size={11} className="shrink-0 text-muted" />
                    <span className="truncate text-[12px]">{n.title}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-faint">{n.body.replace(/[#*`>_\-]/g, '').trim().slice(0, 90) || 'Empty note'}</span>
                  <span className="mt-auto pt-1.5 text-[10px] text-faint">{n.folder} · {format(new Date(n.updatedAt), 'MMM d')}</span>
                </button>
              ))}
              {!db.notes.length && <Empty icon="NotebookPen" label="No notes yet." />}
            </div>
          </Card>
        )}
      </div>

      {/* widget gallery */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-[var(--radius)] bg-s1/50 px-2.5 py-2">
        <span className="label flex items-center gap-1.5 px-1"><Icon name="LayoutGrid" size={12} /> Widgets</span>
        {WIDGETS.map((w) => (
          <button key={w.id} onClick={() => toggleWidget(w.id)} data-tip={`${has(w.id) ? 'Hide' : 'Show'} ${w.label}`}
            className={cn('focusable chip transition-colors', has(w.id) ? 'text-accent' : 'text-faint hover:text-muted')}
            style={has(w.id) ? { background: 'var(--accent-soft)' } : undefined}>
            <Icon name={has(w.id) ? 'Check' : w.icon} size={11} />{w.label}
          </button>
        ))}
        <Btn size="sm" variant="ghost" icon="GalleryVerticalEnd" className="ml-auto" onClick={() => navigate('/tools/widgets')}>Gallery</Btn>
      </div>

      <TodoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} todo={editing} />
    </motion.div>
  );
}

/* Building blocks -------------------------------------------------------- */

/** One card in the bento. Fills its cell so a row never ends ragged. */
function Card({ span, className, children }: { span: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="bento-card min-w-0"
      style={{ '--col-span': span } as React.CSSProperties}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: reduce
            ? { duration: 0 }
            : { type: 'spring', stiffness: 380, damping: 32, mass: 0.7 },
        },
      }}
    >
      <Panel className={cn('dash-card flex h-full flex-col p-3.5', className)}>{children}</Panel>
    </motion.div>
  );
}

/** Consistent card head: glyph, title, one meta word, one action. */
function CardHead({ icon, title, meta, action, tone }: {
  icon: string; title: string; meta?: string; action?: React.ReactNode; tone?: 'accent' | 'danger';
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]" style={{ background: 'var(--surface-2)' }}>
        <Icon name={icon} size={12} className="text-muted" />
      </span>
      <span className="h2 shrink-0 text-[13.5px]">{title}</span>
      {meta && (tone
        ? <Badge tone={tone}>{meta}</Badge>
        : <span className="truncate text-[11px] text-faint">{meta}</span>)}
      <span className="ml-auto shrink-0">{action}</span>
    </div>
  );
}

/** Quick-stat tile: value, one line of context, and an optional micro-chart. */
function Tile({ label, value, sub, icon, tone, trailing }: {
  label: string; value: React.ReactNode; sub?: string; icon: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger'; trailing?: React.ReactNode;
}) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : 'var(--accent)';
  return (
    <div className="flex flex-col justify-between rounded-[11px] bg-s1/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">
        <Icon name={icon} size={11} style={{ color }} />
        <span className="truncate">{label}</span>
        {trailing && <span className="ml-auto shrink-0 opacity-80">{trailing}</span>}
      </div>
      <div className="num mt-1 text-[20px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-[7px] bg-s1/70 px-1.5 py-1">
      <Icon name={icon} size={11} className="shrink-0 text-faint" />
      <span className="truncate text-[10.5px] text-faint">{label}</span>
      <span className="num ml-auto shrink-0 text-[11px] text-muted">{value}</span>
    </div>
  );
}

/** An empty widget still shows its glyph, so the card never reads as broken. */
function Empty({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-5 text-center text-[11.5px] text-faint" data-tip={label}>
      <Icon name={icon} size={16} />
      <span data-label="meta">{label}</span>
    </div>
  );
}
