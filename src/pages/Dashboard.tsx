import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { TaskRow } from '../components/TaskRow';
import { TodoDialog } from '../components/TodoDialog';
import { Heatmap, HeatLegend } from '../components/Heatmap';
import { Badge, Btn, Chip, EmptyState, Icon, Panel, ProgressRing, SectionHead, Sparkline, Stat } from '../components/ui';
import { bucketSessions, buildRollingGrid, summaryStats, thresholds } from '../lib/analytics';
import { computeSubjectGrade, termGPA } from '../lib/grades';
import { habitStats, isHabitScheduled } from '../lib/habits';
import { dueState, fmtDateTime, fmtTime, minsToHM, minsToClock, relDay, cn } from '../lib/utils';
import type { Todo } from '../lib/types';

type WidgetId = 'focus' | 'today' | 'habits' | 'heatmap' | 'grades' | 'goals' | 'upcoming' | 'notes' | 'quickstats';

const WIDGETS: Array<{ id: WidgetId; label: string; icon: string }> = [
  { id: 'quickstats', label: 'Quick stats', icon: 'Gauge' },
  { id: 'focus', label: 'Focus engine', icon: 'Timer' },
  { id: 'today', label: "Today's tasks", icon: 'Sun' },
  { id: 'habits', label: 'Habit week', icon: 'Flame' },
  { id: 'heatmap', label: 'Study heatmap', icon: 'LayoutGrid' },
  { id: 'grades', label: 'Grades', icon: 'GraduationCap' },
  { id: 'goals', label: 'Goals', icon: 'Target' },
  { id: 'upcoming', label: 'Upcoming assessments', icon: 'CalendarClock' },
  { id: 'notes', label: 'Recent notes', icon: 'NotebookPen' },
];

export default function Dashboard() {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const { openPalette, toast } = useUI();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const settings = db.settings;
  const weekStart = settings.behavior.weekStart;
  const widgets = settings.dashboardWidgets.length ? (settings.dashboardWidgets as WidgetId[]) : WIDGETS.map((w) => w.id);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const open = db.todos.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const todayTasks = open.filter((t) => (t.dueAt && isSameDay(new Date(t.dueAt), now)) || (t.startAt && isSameDay(new Date(t.startAt), now)));
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < now && !isSameDay(new Date(t.dueAt), now));

  const bucket = useMemo(() => bucketSessions(db.focusSessions), [db.focusSessions]);
  const stats = useMemo(() => summaryStats(bucket), [bucket]);
  const th = useMemo(() => thresholds(Object.values(bucket).map((b) => b.minutes)), [bucket]);
  const strip = useMemo(() => buildRollingGrid(18, weekStart), [weekStart]);
  const stripValues = useMemo(() => Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, v.minutes])), [bucket]);

  const todayFocus = bucket[format(now, 'yyyy-MM-dd')]?.minutes ?? 0;
  const focus = db.focus!;
  const profile = settings.timerProfiles.find((p) => p.id === focus?.profileId);
  const total = (focus?.phase === 'focus' ? profile?.focus ?? 25 : focus?.phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15) ?? 25;
  const remainingMs = focus?.running && focus.endsAt ? new Date(focus.endsAt).getTime() - Date.now() : focus?.remainingMs ?? total * 60000;
  const focusPct = 100 - (remainingMs / (total * 60000)) * 100;

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

  return (
    <div className="space-y-4 pb-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <div className="text-[11.5px] uppercase tracking-[0.09em] text-faint">{format(now, 'EEEE, MMMM d')}</div>
          <h1 className="h1 mt-0.5">{greeting}, here is your day</h1>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-muted">
            <span className="num">{todayTasks.length} due today</span>
            {overdue.length > 0 && <span className="text-danger">· {overdue.length} overdue</span>}
            <span>·</span>
            <span className="num">{minsToHM(todayFocus)} focused today</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-[12px] bg-s1 px-3 py-2 md:flex">
            <span className="text-[11px] text-faint">Day</span>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-s2">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${dayProgress}%`, background: 'var(--accent)' }} />
            </div>
            <span className="num text-[11px] text-muted">{Math.round(dayProgress)}%</span>
          </div>
          <Btn variant="soft" icon="Command" onClick={() => openPalette()}>Command</Btn>
          <Btn variant="primary" icon="Plus" onClick={() => { setEditing(null); setDialogOpen(true); }}>New task</Btn>
        </div>
      </div>

      {has('quickstats') && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Stat label="Focus today" value={minsToHM(todayFocus)} sub={`${bucket[format(now, 'yyyy-MM-dd')]?.sessions ?? 0} sessions`} icon="Timer" />
          <Stat label="Study streak" value={`${stats.streaks.current}d`} sub={`best ${stats.streaks.longest} days`} icon="Flame" tone="warning" />
          <Stat label="Open tasks" value={open.length} sub={`${overdue.length} overdue`} icon="CheckSquare" />
          <Stat label="Term GPA" value={gpa.toFixed(2)} sub={best[0] ? `best: ${best[0].subject.name}` : 'no marks yet'} icon="GraduationCap" tone="success" />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {has('focus') && (
          <Panel className="lg:col-span-2 flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <ProgressRing value={focusPct} size={96} stroke={7} color="var(--accent)">
              <div className="text-center">
                <div className="num text-[15px] font-semibold leading-none">{minsToClock(remainingMs / 60000)}</div>
                <div className="mt-0.5 text-[9.5px] uppercase tracking-wide text-faint">{focus?.phase?.replace('-', ' ') ?? 'focus'}</div>
              </div>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="h2">Focus engine</span>
                {focus?.running ? <Badge tone="accent">running</Badge> : <Badge>idle</Badge>}
                <span className="num ml-auto text-[11px] text-faint">{focus?.sessionsDone ?? 0} sessions today</span>
              </div>
              <div className="mt-1 text-[12.5px] text-muted">
                {focus?.todoId ? db.todos.find((t) => t.id === focus.todoId)?.title : 'Attach a task to log time against it.'}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Btn size="sm" variant="primary" icon={focus?.running ? 'Pause' : 'Play'}
                  onClick={() => (focus?.running ? useFlow.getState().pauseFocus() : focus?.remainingMs && focus.phase ? useFlow.getState().resumeFocus() : startFocus())}>
                  {focus?.running ? 'Pause' : 'Start focus'}
                </Btn>
                <Btn size="sm" variant="soft" icon="SkipForward" onClick={() => useFlow.getState().skipPhase()}>Skip</Btn>
                <Btn size="sm" variant="ghost" icon="Maximize2" onClick={() => navigate('/focus')}>Open</Btn>
                <span className="ml-auto flex items-center gap-1">
                  {(profile ? [profile.focus, profile.shortBreak, profile.longBreak] : [25, 5, 15]).map((m, i) => (
                    <span key={i} className="chip m-0 text-[10px]">{m}m</span>
                  ))}
                </span>
              </div>
            </div>
          </Panel>
        )}

        {has('today') && (
          <Panel className="p-3">
            <SectionHead title="Today" subtitle={overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'}
              right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/todos')}>All</Btn>} />
            <div className="space-y-0.5">
              {[...overdue, ...todayTasks].slice(0, 6).map((t) => (
                <TaskRow key={t.id} todo={t} compact onEdit={(x) => { setEditing(x); setDialogOpen(true); }} />
              ))}
              {!overdue.length && !todayTasks.length && (
                <div className="py-6 text-center text-[12px] text-faint">Nothing due today. Pull something forward from the week.</div>
              )}
            </div>
          </Panel>
        )}

        {has('habits') && (
          <Panel className="p-3">
            <SectionHead title="Habits this week" subtitle={`${todayHabits.length} scheduled today`}
              right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/habits')}>All</Btn>} />
            <div className="space-y-1.5">
              {todayHabits.map((h) => {
                const st = habitStats(h, db.habitLogs, weekStart);
                const doneToday = db.habitLogs.some((l) => l.habitId === h.id && l.date === format(now, 'yyyy-MM-dd') && !l.skipped);
                return (
                  <div key={h.id} className="flex items-center gap-2 rounded-[10px] px-1 py-1">
                    <button
                      onClick={() => (doneToday ? uncheckIn(h.id, format(now, 'yyyy-MM-dd')) : checkIn(h.id, format(now, 'yyyy-MM-dd'), h.target.type === 'boolean' ? 1 : h.target.value))}
                      className="focusable flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ background: doneToday ? h.color : `color-mix(in srgb, ${h.color} 15%, transparent)` }}
                      aria-label={doneToday ? `Undo ${h.name}` : `Check in ${h.name}`}
                    >
                      <Icon name={doneToday ? 'Check' : h.icon} size={12} style={{ color: doneToday ? '#fff' : h.color }} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px]">{h.name}</div>
                      <div className="text-[10.5px] text-faint">{st.current} day streak · {st.weekDone}/{st.weekTarget} this week</div>
                    </div>
                    <ProgressRing value={(st.weekDone / st.weekTarget) * 100} size={26} stroke={3} color={h.color} />
                  </div>
                );
              })}
              {!todayHabits.length && <div className="py-6 text-center text-[12px] text-faint">No habits scheduled today.</div>}
            </div>
          </Panel>
        )}

        {has('heatmap') && (
          <Panel className="p-3 lg:col-span-2">
            <SectionHead
              title="Study time"
              subtitle={`${minsToHM(stats.totalMin)} this year · ${stats.streaks.current} day streak`}
              right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/analytics')}>Analytics</Btn>}
            />
            <div className="overflow-x-auto pb-1">
              <Heatmap
                weeks={strip} values={stripValues} thresholds={th} cell={12} weekStart={weekStart}
                formatTooltip={(date, value) => (
                  <>
                    <div className="font-medium">{format(new Date(`${date}T12:00:00`), 'EEE, MMM d')}</div>
                    <div className="text-muted">{value ? `${minsToHM(value)} focused` : 'No sessions'}</div>
                  </>
                )}
                onDayClick={() => navigate('/analytics')}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <HeatLegend thresholds={th} />
              <div className="flex items-center gap-2 text-[11px] text-faint">
                <Icon name="Flame" size={11} /> best day {stats.bestDay ? `${minsToHM(stats.bestDay.minutes)}` : '—'}
              </div>
            </div>
          </Panel>
        )}

        {has('grades') && (
          <Panel className="p-3">
            <SectionHead title="Grades" subtitle={`Term GPA ${gpa.toFixed(2)}`}
              right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/grades')}>All</Btn>} />
            <div className="space-y-1.5">
              {grades.slice(0, 5).map(({ subject, grade }) => (
                <button key={subject.id} onClick={() => navigate(`/grades/${subject.id}`)} className="focusable flex w-full items-center gap-2 rounded-[10px] px-1 py-1.5 text-left hover:bg-s1">
                  <Icon name={subject.icon} size={14} style={{ color: subject.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{subject.name}</span>
                  <Sparkline data={db.marks.filter((m) => m.subjectId === subject.id && m.status === 'graded').slice(-6).map((m) => (m.score ?? 0) / m.max * 100)} width={40} height={16} color={subject.color} />
                  <span className="num text-[12px] font-medium" style={{ color: subject.color }}>{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</span>
                  <span className="num w-7 text-right text-[11px] text-faint">{grade.letter}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {has('upcoming') && (
          <Panel className="p-3">
            <SectionHead title="Coming up" subtitle="Assessments and deadlines" />
            <div className="space-y-1.5">
              {upcoming.map((m) => {
                const subject = db.subjects.find((s) => s.id === m.subjectId);
                return (
                  <button key={m.id} onClick={() => navigate(`/grades/${m.subjectId}`)} className="focusable flex w-full items-start gap-2 rounded-[10px] p-1.5 text-left hover:bg-s1">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-[8px] bg-s2">
                      <span className="num text-[11px] font-semibold leading-none">{format(new Date(m.date), 'd')}</span>
                      <span className="text-[8px] uppercase text-faint">{format(new Date(m.date), 'MMM')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{m.title}</span>
                      <span className="block text-[10.5px]" style={{ color: subject?.color }}>{subject?.name}</span>
                    </span>
                    <span className="text-[10.5px] text-faint">{relDay(m.date)}</span>
                  </button>
                );
              })}
              {!upcoming.length && <div className="py-6 text-center text-[12px] text-faint">No upcoming assessments.</div>}
            </div>
          </Panel>
        )}

        {has('goals') && (
          <Panel className="p-3">
            <SectionHead title="Goals" subtitle={`${db.goals.length} active`}
              right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/goals')}>All</Btn>} />
            <div className="space-y-2">
              {db.goals.slice(0, 3).map((g) => {
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
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: g.color }} />
                    </div>
                  </div>
                );
              })}
              {!db.goals.length && <div className="py-4 text-center text-[12px] text-faint">No goals yet.</div>}
            </div>
          </Panel>
        )}

        {has('notes') && (
          <Panel className="p-3">
            <SectionHead title="Recent notes" right={<Btn size="sm" variant="ghost" iconRight="ArrowRight" onClick={() => navigate('/notes')}>All</Btn>} />
            <div className="space-y-1">
              {[...db.notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 4).map((n) => (
                <button key={n.id} onClick={() => navigate(`/notes?open=${n.id}`)} className="focusable block w-full rounded-[10px] px-2 py-1.5 text-left hover:bg-s1">
                  <div className="truncate text-[12.5px]">{n.title}</div>
                  <div className="truncate text-[10.5px] text-faint">{n.folder} · {format(new Date(n.updatedAt), 'MMM d')}</div>
                </button>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* widget gallery */}
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-s1/50 p-2.5">
        <span className="label flex items-center gap-1.5 px-1"><Icon name="LayoutGrid" size={12} /> Widgets</span>
        {WIDGETS.map((w) => (
          <button key={w.id} onClick={() => toggleWidget(w.id)}
            className={cn('focusable chip transition-colors', has(w.id) ? 'text-accent' : 'text-faint hover:text-muted')}
            style={has(w.id) ? { background: 'var(--accent-soft)' } : undefined}>
            <Icon name={has(w.id) ? 'Check' : w.icon} size={11} />{w.label}
          </button>
        ))}
        <Btn size="sm" variant="ghost" icon="GalleryVerticalEnd" className="ml-auto" onClick={() => navigate('/tools/widgets')}>Gallery</Btn>
      </div>

      <TodoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} todo={editing} />
    </div>
  );
}
