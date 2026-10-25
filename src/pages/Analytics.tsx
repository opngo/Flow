import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Heatmap, HeatLegend, HourHeatmap } from '../components/Heatmap';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, Modal, Panel, SectionHead, Segmented, Select,
  Stat, TextInput, Toggle,
} from '../components/ui';
import {
  bucketSessions, buildYearGrid, hourWeekdayMatrix, levelFor, summaryStats, tasksPerDay, thresholds,
} from '../lib/analytics';
import { habitDayMap } from '../lib/analytics';
import { download, downloadBlob } from '../lib/platform';
import { fmtDateTime, minsToHM, cn } from '../lib/utils';
import type { FocusSession } from '../lib/types';

/** Session sources are keyed by the FocusSession.kind values they include. */
type Source = 'focus' | 'stopwatch' | 'timer' | 'exam';
const SOURCE_LABELS: Record<Source, string> = {
  focus: 'pomodoro', stopwatch: 'stopwatch', timer: 'tracker', exam: 'exam mode',
};

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'heatmap';
  const setView = (v: string) => { params.set('view', v); setParams(params, { replace: true }); };
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const weekStart = db.settings.behavior.weekStart;

  const [year, setYear] = useState(new Date().getFullYear());
  const [subjectId, setSubjectId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [sources, setSources] = useState<Record<Source, boolean>>({ focus: true, stopwatch: true, timer: true, exam: true });
  const [custom, setCustom] = useState<string>('');
  const [dayPanel, setDayPanel] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newSession, setNewSession] = useState({ date: format(new Date(), 'yyyy-MM-dd'), minutes: 45, subjectId: '' });
  type Tab = 'heatmap' | 'subjects' | 'habits' | 'tasks' | 'hours';
  const TABS: Tab[] = ['heatmap', 'subjects', 'habits', 'tasks', 'hours'];
  // The URL is the single source of truth for the tab so catalog links like
  // /analytics?view=subjects land on the right panel and stay shareable.
  const tab = (TABS.includes(view as Tab) ? view : 'heatmap') as Tab;
  const setTab = (v: Tab) => setView(v);

  const filtered = useMemo(() => db.focusSessions.filter((s) => {
    if (subjectId !== 'all' && s.subjectId !== subjectId) return false;
    if (categoryId !== 'all' && s.categoryId !== categoryId) return false;
    if (projectId !== 'all' && s.projectId !== projectId) return false;
    if (s.kind in sources && !sources[s.kind as Source]) return false;
    return true;
  }), [db.focusSessions, subjectId, categoryId, projectId, sources]);

  const bucket = useMemo(() => bucketSessions(filtered), [filtered]);
  const values = useMemo(() => Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, v.minutes])), [bucket]);
  const th = useMemo(() => (custom ? custom.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) : thresholds(Object.values(values))), [values, custom]);
  const stats = useMemo(() => summaryStats(bucket), [bucket]);

  /* Two panels under the calendar, where the page used to just stop: how the
     year is running by month, and what the sessions are spent on. Both follow
     the same filters as the heatmap above, so the page never contradicts
     itself. */
  const months = useMemo(() => {
    const out = Array.from({ length: 12 }, (_, m) => {
      const minutes = Object.entries(bucket)
        .filter(([d]) => Number(d.slice(0, 4)) === year && Number(d.slice(5, 7)) === m + 1)
        .reduce((a, [, v]) => a + v.minutes, 0);
      return { month: m, minutes };
    });
    return { out, max: Math.max(1, ...out.map((o) => o.minutes)) };
  }, [bucket, year]);

  const bySubject = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of filtered) {
      const key = s.subjectId ?? '__none';
      totals.set(key, (totals.get(key) ?? 0) + s.actualMin);
    }
    const rows = [...totals.entries()]
      .map(([id, minutes]) => ({
        id,
        minutes,
        name: db.subjects.find((x) => x.id === id)?.name ?? 'Unassigned',
        color: db.subjects.find((x) => x.id === id)?.color ?? 'var(--text-faint)',
      }))
      .sort((a, b) => b.minutes - a.minutes);
    const total = Math.max(1, rows.reduce((a, r) => a + r.minutes, 0));
    return { rows, total };
  }, [filtered, db.subjects]);

  const topSessions = useMemo(
    () => [...filtered].sort((a, b) => b.actualMin - a.actualMin).slice(0, 5),
    [filtered],
  );
  const grid = useMemo(() => buildYearGrid(year, weekStart), [year, weekStart]);

  const exportSVG = () => {
    const { weeks } = grid;
    const cell = 11;
    const gap = 3;
    const width = weeks.length * (cell + gap) + 30;
    const height = 7 * (cell + gap) + 20;
    const shade = (v: number) => {
      const lvl = levelFor(v, th);
      if (lvl === 0) return 'rgba(140,148,162,0.16)';
      const alpha = [0, 0.28, 0.5, 0.72, 1][lvl];
      return `rgba(124,140,255,${alpha})`;
    };
    const rects = weeks.map((week, wi) => week.map((day, di) => {
      const key = format(day, 'yyyy-MM-dd');
      return `<rect x="${30 + wi * (cell + gap)}" y="${10 + di * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${shade(values[key] ?? 0)}"/>`;
    }).join('')).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="transparent"/>${rects}</svg>`;
    download(`flow-heatmap-${year}.svg`, svg, 'image/svg+xml');
  };

  const exportPNG = async () => {
    const { weeks } = grid;
    const cell = 12;
    const gap = 3;
    const width = weeks.length * (cell + gap) + 40;
    const height = 7 * (cell + gap) + 40;
    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#0b0d12';
    ctx.fillRect(0, 0, width, height);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c8cff';
    weeks.forEach((week, wi) => {
      week.forEach((day, di) => {
        const key = format(day, 'yyyy-MM-dd');
        const lvl = levelFor(values[key] ?? 0, th);
        ctx.fillStyle = lvl === 0 ? 'rgba(140,148,162,0.16)' : accent;
        ctx.globalAlpha = lvl === 0 ? 1 : [0, 0.28, 0.5, 0.72, 1][lvl];
        const x = 20 + wi * (cell + gap);
        const y = 20 + di * (cell + gap);
        const r = 3;
        ctx.beginPath();
        ctx.roundRect(x, y, cell, cell, r);
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (blob) downloadBlob(`flow-heatmap-${year}.png`, blob);
  };

  const daySessions = dayPanel ? filtered.filter((s) => format(new Date(s.startedAt), 'yyyy-MM-dd') === dayPanel) : [];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Analytics</h1>
          <div className="mt-0.5 text-[12px] text-muted">
            {minsToHM(stats.totalMin)} across {stats.activeDays} active days · {stats.streaks.current} day streak
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconBtn icon="ChevronLeft" label="Previous year" onClick={() => setYear(year - 1)} />
          <span className="num text-[13px]">{year}</span>
          <IconBtn icon="ChevronRight" label="Next year" onClick={() => setYear(year + 1)} disabled={year >= new Date().getFullYear()} />
          <Btn variant="soft" icon="Image" onClick={exportPNG}>PNG</Btn>
          <Btn variant="soft" icon="Download" onClick={exportSVG}>SVG</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="This year" value={`${(stats.totalMin / 60).toFixed(1)}h`} sub={`${stats.activeDays} active days`} icon="Clock" />
        <Stat label="Streak" value={`${stats.streaks.current}d`} sub={`best ${stats.streaks.longest}d`} icon="Flame" tone="warning" />
        <Stat label="Avg active day" value={minsToHM(stats.avg)} icon="Gauge" />
        <Stat label="Best day" value={stats.bestDay ? minsToHM(stats.bestDay.minutes) : '—'} sub={stats.bestDay?.date} icon="TrendingUp" tone="success" />
        <Stat label="Best week" value={stats.bestWeek ? minsToHM(stats.bestWeek.minutes) : '—'} sub={stats.bestWeek?.week} icon="CalendarDays" />
        <Stat label="Top subject" value={db.subjects.find((s) => s.id === stats.topSubjectId)?.name.split(' ')[0] ?? '—'} sub={minsToHM(stats.topSubjectMin)} icon="GraduationCap" tone="accent" />
      </div>

      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'heatmap', label: 'Study', icon: 'LayoutGrid' },
            { value: 'subjects', label: 'Subjects', icon: 'PieChart' },
            { value: 'habits', label: 'Habits', icon: 'Flame' },
            { value: 'tasks', label: 'Tasks', icon: 'CheckSquare' },
            { value: 'hours', label: 'Best hours', icon: 'Clock' },
          ]} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Select value={subjectId} onChange={setSubjectId} options={[{ value: 'all', label: 'All subjects' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
            <Select value={categoryId} onChange={setCategoryId} options={[{ value: 'all', label: 'All categories' }, ...db.categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))]} />
            <Select value={projectId} onChange={setProjectId} options={[{ value: 'all', label: 'All projects' }, ...db.projects.map((p) => ({ value: p.id, label: p.name, icon: p.icon }))]} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(Object.keys(sources) as Source[]).map((s) => (
            <button key={s} onClick={() => setSources((x) => ({ ...x, [s]: !x[s] }))}
              className={cn('focusable chip capitalize', sources[s] ? 'text-accent' : 'text-faint')}
              style={sources[s] ? { background: 'var(--accent-soft)' } : undefined}>
              <Icon name={sources[s] ? 'Check' : 'Circle'} size={10} />{SOURCE_LABELS[s]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-faint">Thresholds</span>
            <TextInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={th.map((t) => Math.round(t)).join(',')} className="w-36 py-1 text-[11.5px]" />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto pb-2">
          {tab === 'heatmap' && (
            <>
              <Heatmap
                weeks={grid.weeks} values={values} thresholds={th} cell={11} weekStart={weekStart}
                onDayClick={(date) => setDayPanel(date)}
                formatTooltip={(date, value) => {
                  const b = bucket[date];
                  const topId = b ? Object.entries(b.bySubject).sort((x, y) => y[1] - x[1])[0]?.[0] : undefined;
                  const top = db.subjects.find((s) => s.id === topId);
                  return (
                    <>
                      <div className="font-medium">{format(new Date(`${date}T12:00:00`), 'EEEE, MMM d, yyyy')}</div>
                      <div className="text-muted">{value ? `${minsToHM(value)} · ${b?.sessions ?? 0} sessions` : 'No study time'}</div>
                      {top && <div className="mt-0.5" style={{ color: top.color }}>{top.name}</div>}
                    </>
                  );
                }}
              />
            </>
          )}
          {tab === 'subjects' && <SubjectBreakdown bucket={bucket} />}
          {tab === 'habits' && <HabitHeatmaps />}
          {tab === 'tasks' && <TaskHeatmap year={year} weekStart={weekStart} />}
          {tab === 'hours' && <HoursPanel sessions={filtered} />}
        </div>
        {tab === 'heatmap' && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <HeatLegend thresholds={th} />
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="ghost" icon="Plus" onClick={() => setAddOpen(true)}>Log study time</Btn>
              <span className="text-[10.5px] text-faint">Click any day for the session list</span>
            </div>
          </div>
        )}
      </Panel>

      {tab === 'heatmap' && (
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Panel className="p-3.5">
            <SectionHead title="Month by month" subtitle={`${minsToHM(months.out.reduce((a, m) => a + m.minutes, 0))} across ${year}`} />
            <div className="flex items-end gap-1.5">
              {months.out.map((m) => {
                const active = m.minutes > 0;
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1" data-tip={`${format(new Date(year, m.month, 1), 'MMMM')} · ${minsToHM(m.minutes)}`}>
                    <span className="num text-[9.5px] text-faint">{active ? `${Math.round(m.minutes / 60)}h` : ''}</span>
                    <span
                      className="w-full rounded-[4px]"
                      style={{
                        height: `${Math.max(4, (m.minutes / months.max) * 70)}px`,
                        background: m.month === new Date().getMonth() && year === new Date().getFullYear()
                          ? 'var(--accent)'
                          : active ? 'color-mix(in srgb, var(--accent) 42%, transparent)' : 'color-mix(in srgb, var(--text-faint) 13%, transparent)',
                      }}
                    />
                    {/* Three letters, not one: a single letter gives three Ts and two Ss. */}
                    <span data-label="meta" className="text-[9px] text-faint">{format(new Date(year, m.month, 1), 'MMM')}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-3.5">
            <SectionHead title="Where the time goes" subtitle="Every filtered session, by subject" />
            <div className="mb-2 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              {bySubject.rows.map((r) => (
                <span key={r.id} style={{ width: `${(r.minutes / bySubject.total) * 100}%`, background: r.color }} />
              ))}
            </div>
            <div className="space-y-1">
              {bySubject.rows.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[11.5px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-muted" data-label="meta">{r.name}</span>
                  <span className="num shrink-0 text-faint">{Math.round((r.minutes / bySubject.total) * 100)}%</span>
                  <span className="num w-14 shrink-0 text-right">{minsToHM(r.minutes)}</span>
                </div>
              ))}
              {!bySubject.rows.length && (
                <div className="px-1 py-2 text-[11.5px] text-faint" data-label="meta">Nothing logged for these filters</div>
              )}
            </div>
            {topSessions.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'color-mix(in srgb, var(--text-faint) 12%, transparent)' }}>
                <div className="mb-1 text-[10px] uppercase tracking-[0.07em] text-faint" data-label="meta">Longest blocks</div>
                {topSessions.slice(0, 3).map((x) => (
                  <div key={x.id} className="flex items-center gap-2 py-0.5 text-[11px]">
                    <Icon name="Flame" size={10} className="text-warning" />
                    <span className="truncate text-muted">{x.label?.trim() || db.subjects.find((sub) => sub.id === x.subjectId)?.name || 'Focus'}</span>
                    <span className="num ml-auto shrink-0 text-faint">{format(new Date(x.startedAt), 'MMM d')}</span>
                    <span className="num w-10 shrink-0 text-right">{x.actualMin}m</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* day detail */}
      <Modal open={!!dayPanel} onClose={() => setDayPanel(null)} title={dayPanel ? format(new Date(`${dayPanel}T12:00:00`), 'EEEE, MMMM d') : ''} wide
        subtitle={`${minsToHM(daySessions.reduce((a, b) => a + b.actualMin, 0))} across ${daySessions.length} sessions`}
        footer={<>
          <Btn variant="ghost" onClick={() => setDayPanel(null)}>Close</Btn>
          <Btn variant="soft" icon="Plus" onClick={() => { setNewSession((s) => ({ ...s, date: dayPanel ?? s.date })); setAddOpen(true); }}>Add entry</Btn>
        </>}>
        <div className="space-y-1">
          {daySessions.map((s) => <SessionRow key={s.id} session={s} />)}
          {!daySessions.length && <EmptyState icon="Clock" title="Nothing logged" body="Add a manual entry to fill this day." />}
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Log study time" subtitle="Manual entries count toward the heatmap and stats"
        footer={<><Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="Check" onClick={() => {
            flow.logSession({
              startedAt: new Date(`${newSession.date}T10:00:00`).toISOString(),
              endedAt: new Date(`${newSession.date}T${String(10 + Math.floor(newSession.minutes / 60)).padStart(2, '0')}:${String(newSession.minutes % 60).padStart(2, '0')}:00`).toISOString(),
              kind: 'timer', subjectId: newSession.subjectId || undefined, plannedMin: newSession.minutes,
              actualMin: newSession.minutes, label: 'Manual entry',
            });
            setAddOpen(false);
            useUI.getState().toast({ title: 'Study time logged', tone: 'success' });
          }}>Log</Btn></>}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Date"><TextInput type="date" value={newSession.date} onChange={(e) => setNewSession({ ...newSession, date: e.target.value })} /></Field>
          <Field label="Minutes"><TextInput type="number" min={1} value={newSession.minutes} onChange={(e) => setNewSession({ ...newSession, minutes: Number(e.target.value) })} /></Field>
          <Field label="Subject">
            <Select value={newSession.subjectId} onChange={(v) => setNewSession({ ...newSession, subjectId: v })}
              options={[{ value: '', label: 'No subject' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
          </Field>
        </div>
      </Modal>
      <span className="hidden" onClick={() => setView('heatmap')}>{view}</span>
    </div>
  );
}

function SessionRow({ session }: { session: FocusSession }) {
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const [edit, setEdit] = useState(false);
  const [minutes, setMinutes] = useState(session.actualMin);
  const subject = db.subjects.find((s) => s.id === session.subjectId);
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2">
      <Icon name={session.kind === 'focus' ? 'Timer' : session.kind === 'stopwatch' ? 'Watch' : 'Clock'} size={13} className="text-muted" />
      <span className="num text-[11px] text-faint">{format(new Date(session.startedAt), 'h:mm a')}</span>
      <span className="flex-1 truncate text-[12px]">{db.todos.find((t) => t.id === session.todoId)?.title ?? subject?.name ?? session.label ?? session.kind}</span>
      {subject && <Chip color={subject.color}>{subject.name}</Chip>}
      {edit ? (
        <div className="flex items-center gap-1">
          <TextInput type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-16 py-1 text-[11.5px]" />
          <Btn size="sm" variant="tonal" onClick={() => { flow.updateSession(session.id, { actualMin: minutes }); setEdit(false); }}>Save</Btn>
        </div>
      ) : (
        <button onClick={() => setEdit(true)} className="focusable num rounded-[6px] px-1.5 text-[11.5px] hover:bg-s2">{minsToHM(session.actualMin)}</button>
      )}
      <IconBtn icon="Trash2" label="Delete session" className="h-6 w-6" onClick={() => flow.deleteSession(session.id)} />
    </div>
  );
}

function SubjectBreakdown({ bucket }: { bucket: ReturnType<typeof bucketSessions> }) {
  const db = useFlow((s) => s.db);
  const totals = Object.entries(bucket).reduce<Record<string, number>>((acc, [, v]) => {
    for (const [k, m] of Object.entries(v.bySubject)) acc[k] = (acc[k] ?? 0) + m;
    return acc;
  }, {});
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        {rows.map(([id, mins]) => {
          const subj = db.subjects.find((s) => s.id === id);
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: subj?.color ?? 'var(--text-faint)' }} />
              <span className="w-32 truncate text-[12px]">{subj?.name ?? 'Unassigned'}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-s2">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(mins / total) * 100}%`, background: subj?.color ?? 'var(--text-faint)' }} />
              </div>
              <span className="num w-14 text-right text-[11px] text-muted">{Math.round((mins / total) * 100)}%</span>
              <span className="num w-14 text-right text-[11px]">{minsToHM(mins)}</span>
            </div>
          );
        })}
      </div>
      <div className="rounded-[12px] bg-s1 p-3">
        <div className="label mb-2">Study time vs grade</div>
        <div className="relative h-40">
          {db.subjects.map((s) => {
            const mins = totals[s.id] ?? 0;
            const maxMins = Math.max(1, ...Object.values(totals));
            const x = (mins / maxMins) * 100;
            const y = 100 - Math.min(100, ((db.marks.filter((m) => m.subjectId === s.id && m.status === 'graded').reduce((a, b) => a + ((b.score ?? 0) / b.max) * 100, 0) / Math.max(1, db.marks.filter((m) => m.subjectId === s.id && m.status === 'graded').length))));
            return (
              <span key={s.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }} title={`${s.name}: ${minsToHM(mins)}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="mt-1 whitespace-nowrap text-[9.5px] text-faint">{s.name.split(' ')[0]}</span>
              </span>
            );
          })}
          <div className="absolute inset-x-0 bottom-0 h-px bg-s3" />
          <div className="absolute inset-y-0 left-0 w-px bg-s3" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-faint"><span>less study</span><span>more study</span></div>
      </div>
    </div>
  );
}

function HabitHeatmaps() {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;
  const grid = useMemo(() => buildYearGrid(new Date().getFullYear(), weekStart), [weekStart]);
  return (
    <div className="space-y-3">
      {db.habits.map((h) => {
        const map = habitDayMap(h, db.habitLogs);
        return (
          <div key={h.id} className="rounded-[12px] bg-s1/50 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon name={h.icon} size={13} style={{ color: h.color }} />
              <span className="text-[12.5px]">{h.name}</span>
              <span className="num ml-auto text-[10.5px] text-faint">{Object.values(map).filter(Boolean).length} days</span>
            </div>
            <div className="overflow-x-auto">
              <Heatmap weeks={grid.weeks} values={map} thresholds={[1, 1, 1, 1]} cell={8} gap={2} color={h.color}
                showMonthLabels={false} showWeekdayLabels={false}
                formatTooltip={(date, v) => <div>{format(new Date(`${date}T12:00:00`), 'MMM d')} — {v ? 'done' : 'missed'}</div>} />
            </div>
          </div>
        );
      })}
      {!db.habits.length && <EmptyState icon="Flame" title="No habits to chart" />}
    </div>
  );
}

function TaskHeatmap({ year, weekStart }: { year: number; weekStart: number }) {
  const db = useFlow((s) => s.db);
  const grid = useMemo(() => buildYearGrid(year, weekStart), [year, weekStart]);
  const values = useMemo(() => tasksPerDay(db.todos), [db.todos]);
  return (
    <div className="overflow-x-auto">
      <Heatmap weeks={grid.weeks} values={values} thresholds={[1, 2, 4, 6]} cell={11} weekStart={weekStart} color="var(--success)"
        formatTooltip={(date, v) => <div>{format(new Date(`${date}T12:00:00`), 'MMM d')} — {v} tasks completed</div>} />
    </div>
  );
}

function HoursPanel({ sessions }: { sessions: FocusSession[] }) {
  const matrix = useMemo(() => hourWeekdayMatrix(sessions), [sessions]);
  const best = useMemo(() => {
    let bestH = 0; let bestVal = 0;
    matrix.forEach((row) => row.forEach((v, h) => { if (v > bestVal) { bestVal = v; bestH = h; } }));
    return { hour: bestH, minutes: bestVal };
  }, [matrix]);
  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="overflow-x-auto"><HourHeatmap matrix={matrix} /></div>
      <div className="space-y-2">
        <Stat label="Peak hour" value={`${String(best.hour).padStart(2, '0')}:00`} sub={`${minsToHM(best.minutes)} logged in that hour`} icon="Sun" />
        <div className="rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
          Every session start is bucketed by weekday and hour. Schedule your hardest work into the darkest cells.
        </div>
      </div>
    </div>
  );
}
