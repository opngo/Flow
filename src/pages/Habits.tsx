import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format, isSameDay, startOfWeek, subDays } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { openContextMenu } from '../components/ContextMenu';
import { Heatmap } from '../components/Heatmap';
import {
  Badge, Btn, Chip, ColorPicker, EmptyState, Field, Icon, IconBtn, IconPicker, MenuBtn, Modal,
  Panel, ProgressRing, ScrollArea, SectionHead, Segmented, Select, Stat, TextArea, TextInput, TimeField, Toggle,
  PlusBtn,
 } from '../components/ui';
import { habitStats, isHabitScheduled, weeklyTarget, RRULE_PRESETS } from '../lib/habits';
import { buildRollingGrid, bucketSessions, thresholds } from '../lib/analytics';
import { dayKey, fmtDate, minsToHM, relDay, cn } from '../lib/utils';
import type { Habit } from '../lib/types';

type HabitView = 'week' | 'heatmap' | 'streaks' | 'calendar' | 'insights';
const VIEWS: Array<{ id: HabitView; label: string; icon: string }> = [
  { id: 'week', label: 'Week', icon: 'CalendarDays' },
  { id: 'heatmap', label: 'Heatmap', icon: 'LayoutGrid' },
  { id: 'streaks', label: 'Streaks', icon: 'TrendingUp' },
  { id: 'calendar', label: 'Calendar', icon: 'CalendarRange' },
  { id: 'insights', label: 'Insights', icon: 'Lightbulb' },
];

export default function Habits() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as HabitView) ?? 'week';
  const setView = (v: HabitView) => { params.set('view', v); setParams(params, { replace: true }); };
  const db = useFlow((s) => s.db);
  const checkIn = useFlow((s) => s.checkIn);
  const uncheckIn = useFlow((s) => s.uncheckIn);
  const skipHabit = useFlow((s) => s.skipHabit);
  const updateHabit = useFlow((s) => s.updateHabit);
  const deleteHabit = useFlow((s) => s.deleteHabit);
  const toast = useUI((s) => s.toast);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [open, setOpen] = useState(false);
  const [skipFor, setSkipFor] = useState<{ habit: Habit; date: string } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (params.get('new')) { setEditing(null); setOpen(true); params.delete('new'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const weekStart = db.settings.behavior.weekStart;
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today, { weekStartsOn: weekStart as 0 | 1 }), i));
  const activeHabits = db.habits.filter((h) => !h.pausedUntil || new Date(h.pausedUntil) < today);

  const logFor = (habitId: string, date: Date) => db.habitLogs.find((l) => l.habitId === habitId && l.date === format(date, 'yyyy-MM-dd'));

  const weekCompletion = activeHabits.reduce((acc, h) => {
    const target = weeklyTarget(h);
    const done = db.habitLogs.filter((l) => l.habitId === h.id && !l.skipped && new Date(`${l.date}T12:00:00`) >= week[0] && new Date(`${l.date}T12:00:00`) <= week[6]).length;
    return acc + Math.min(1, done / target);
  }, 0);
  const weekPct = activeHabits.length ? (weekCompletion / activeHabits.length) * 100 : 0;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Habits</h1>
          <div className="mt-0.5 text-[12px] text-muted">
            {activeHabits.length} active · {Math.round(weekPct)}% of this week's targets
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon }))} />
          <PlusBtn label="New habit" onClick={() => { setEditing(null); setOpen(true); }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="This week" value={`${Math.round(weekPct)}%`} sub="targets hit" icon="Gauge" />
        <Stat label="Best streak" value={`${Math.max(0, ...db.habits.map((h) => habitStats(h, db.habitLogs, weekStart).longest))}d`} icon="Flame" tone="warning" />
        <Stat label="Perfect weeks" value={db.habits.reduce((a, h) => a + habitStats(h, db.habitLogs, weekStart).weeklyStreak, 0)} sub="combined weekly streaks" icon="Trophy" tone="success" />
        <Stat label="Check-ins" value={db.habitLogs.filter((l) => !l.skipped).length} sub="all time" icon="CheckCircle2" />
      </div>

      {/* Every view carries the same year of coverage, so switching tabs never
          hides how the habits are actually going. */}
      <HabitYearStrip />

      {view === 'week' && (
        <Panel className="p-3">
          <SectionHead title="This week" subtitle={fmtDate(week[0], 'MMM d') + ' – ' + fmtDate(week[6], 'MMM d')} />
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(180px,1fr)_repeat(7,44px)_70px] items-center gap-1 px-1 pb-1">
                <div className="label">Habit</div>
                {week.map((d) => (
                  <div key={d.toISOString()} className="text-center">
                    <div className="text-[10px] text-faint">{format(d, 'EEEEE')}</div>
                    <div className={cn('num text-[11px]', isSameDay(d, today) ? 'text-accent' : 'text-muted')}>{format(d, 'd')}</div>
                  </div>
                ))}
                <div className="label text-right">Week</div>
              </div>
              {activeHabits.map((h) => {
                const st = habitStats(h, db.habitLogs, weekStart);
                return (
                  <div key={h.id} className="grid grid-cols-[minmax(180px,1fr)_repeat(7,44px)_70px] items-center gap-1 rounded-[10px] px-1 py-1 hover:bg-s1/60">
                    <div className="flex min-w-0 items-center gap-2"
                      onContextMenu={(e) => openContextMenu(e, [
                        { label: 'Edit habit', icon: 'PenLine', onClick: () => { setEditing(h); setOpen(true); } },
                        { label: 'Check in today', icon: 'Check', onClick: () => checkIn(h.id, format(today, 'yyyy-MM-dd'), h.target.type === 'boolean' ? 1 : h.target.value) },
                        { label: h.pausedUntil ? 'Resume' : 'Pause for a week', icon: h.pausedUntil ? 'Play' : 'Pause', onClick: () => updateHabit(h.id, { pausedUntil: h.pausedUntil ? undefined : addDays(today, 7).toISOString() }) },
                        { label: 'Delete', icon: 'Trash2', danger: true, separator: true, onClick: () => deleteHabit(h.id) },
                      ], h.name)}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]" style={{ background: `color-mix(in srgb, ${h.color} 16%, transparent)` }}>
                        <Icon name={h.icon} size={14} style={{ color: h.color }} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px]">{h.name}</div>
                        <div className="text-[10px] text-faint">
                          {h.schedule.type === 'timesPerWeek' ? `${h.schedule.times}x / week` : h.schedule.type === 'daily' ? 'every day' : h.schedule.type === 'weekdays' ? h.schedule.days.map((d) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d]).join('') : h.schedule.type}
                          {h.target.type !== 'boolean' ? ` · ${h.target.value}${h.target.type === 'duration' ? 'm' : 'x'}` : ''}
                        </div>
                      </div>
                    </div>
                    {week.map((d) => {
                      const log = logFor(h.id, d);
                      const scheduled = isHabitScheduled(h, d);
                      const done = !!log && !log.skipped;
                      const future = d > today && !isSameDay(d, today);
                      return (
                        <div key={d.toISOString()} className="flex justify-center">
                          <button
                            disabled={future && !scheduled}
                            onClick={() => {
                              if (log?.skipped) { uncheckIn(h.id, format(d, 'yyyy-MM-dd')); return; }
                              if (done) uncheckIn(h.id, format(d, 'yyyy-MM-dd'));
                              else { checkIn(h.id, format(d, 'yyyy-MM-dd'), h.target.type === 'boolean' ? 1 : h.target.value); }
                            }}
                            onContextMenu={(e) => { e.preventDefault(); setSkipFor({ habit: h, date: format(d, 'yyyy-MM-dd') }); }}
                            className={cn('focusable flex h-8 w-8 items-center justify-center rounded-[9px] transition-all', future && 'opacity-45')}
                            style={{
                              background: done
                                ? h.color
                                : log?.skipped
                                  ? 'var(--surface-2)'
                                  : scheduled
                                    ? `color-mix(in srgb, ${h.color} 14%, transparent)`
                                    : 'transparent',
                            }}
                            aria-label={`${h.name} on ${format(d, 'MMM d')}`}
                            data-tip={`${h.name} · ${format(d, 'EEE d MMM')}${done ? ' · done' : log?.skipped ? ' · skipped' : ''}`}
                          >
                            {done && <Icon name="Check" size={13} className="text-white" strokeWidth={3} />}
                            {log?.skipped && <Icon name="Minus" size={12} className="text-faint" />}
                            {!done && !log && scheduled && <span className="h-1 w-1 rounded-full" style={{ background: `color-mix(in srgb, ${h.color} 50%, transparent)` }} />}
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-end gap-1">
                      <ProgressRing value={(st.weekDone / Math.max(1, st.weekTarget)) * 100} size={26} stroke={3.5} color={h.color}>
                        <span className="num text-[8.5px]">{st.weekDone}</span>
                      </ProgressRing>
                      <MenuBtn
                        align="right"
                        trigger={<IconBtn icon="MoreHorizontal" label={`${h.name} actions`} className="h-6 w-6" />}
                        items={[
                          { label: 'Edit habit', icon: 'Edit3', onClick: () => { setEditing(h); setOpen(true); } },
                          { label: 'Skip today with reason', icon: 'Minus', onClick: () => setSkipFor({ habit: h, date: dayKey(today) }) },
                          { label: 'Pause one week', icon: 'Plane', onClick: () => { updateHabit(h.id, { pausedUntil: addDays(today, 7).toISOString() }); toast({ title: `${h.name} paused`, body: 'Streaks are protected until the pause ends.' }); } },
                          { label: 'Resume', icon: 'Play', onClick: () => updateHabit(h.id, { pausedUntil: undefined }) },
                          { label: 'Delete', icon: 'Trash2', danger: true, separator: true, onClick: () => deleteHabit(h.id) },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
              {!activeHabits.length && <EmptyState icon="Flame" title="No habits yet" body="Start with one weekly habit — reading, movement or review." action={<Btn variant="primary" icon="Plus" onClick={() => { setEditing(null); setOpen(true); }}>New habit</Btn>} />}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-faint">Click a cell to check in. Right-click for skip-with-reason.</div>
        </Panel>
      )}

      {view === 'heatmap' && <HeatmapView />}
      {view === 'streaks' && <StreaksView />}
      {view === 'calendar' && <CalendarView />}
      {view === 'insights' && <InsightsView />}

      <HabitDialog open={open} onClose={() => setOpen(false)} habit={editing} />

      <Modal open={!!skipFor} onClose={() => setSkipFor(null)} title="Skip this day" subtitle="Streaks stay intact when a skip has a reason"
        footer={<>
          <Btn variant="ghost" onClick={() => setSkipFor(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={() => { if (skipFor) skipHabit(skipFor.habit.id, skipFor.date, reason || 'No reason given'); setSkipFor(null); setReason(''); }}>Skip day</Btn>
        </>}>
        <Field label="Reason">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Travelling, sick, rest day" />
        </Field>
      </Modal>
    </div>
  );
}

/**
 * One year of habit coverage, as a share of the habits that were due.
 *
 * Each square fills from the left by the fraction of the day's scheduled habits
 * that were checked off: a day where two of four were done is exactly half
 * filled, not "somewhere between two intensity steps". Filters to a single
 * habit when one is chosen.
 */
function useHabitCoverage(habitId: string) {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;

  const grid = useMemo(() => {
    const weeks: Date[][] = [];
    const start = startOfWeek(subDays(new Date(), 364), { weekStartsOn: weekStart as 0 | 1 });
    for (let w = 0; w < 53; w += 1) weeks.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
    return weeks;
  }, [weekStart]);

  const coverage = useMemo(() => {
    const habits = (habitId === 'all' ? db.habits : db.habits.filter((h) => h.id === habitId))
      .filter((h) => !h.pausedUntil || new Date(h.pausedUntil) >= new Date());
    const done = new Set(db.habitLogs.filter((l) => !l.skipped).map((l) => `${l.habitId}|${l.date}`));
    const out: Record<string, number> = {};
    const counts: Record<string, { due: number; done: number }> = {};
    for (const week of grid) {
      for (const day of week) {
        const key = format(day, 'yyyy-MM-dd');
        if (day > new Date()) continue;
        for (const h of habits) {
          if (!isHabitScheduled(h, day)) continue;
          const bucket = counts[key] ?? { due: 0, done: 0 };
          bucket.due += 1;
          if (done.has(`${h.id}|${key}`)) bucket.done += 1;
          counts[key] = bucket;
        }
        const c = counts[key];
        if (c && c.due > 0) out[key] = c.done / c.due;
      }
    }
    return out;
  }, [db.habits, db.habitLogs, grid, habitId]);

  return { grid, coverage, weekStart };
}

function HabitYearStrip() {
  const db = useFlow((s) => s.db);
  const [habitId, setHabitId] = useState('all');
  const { grid, coverage, weekStart } = useHabitCoverage(habitId);
  const days = Object.keys(coverage);
  const average = days.length ? days.reduce((a, k) => a + coverage[k], 0) / days.length : 0;

  return (
    <Panel className="p-4">
      <SectionHead
        title="Coverage"
        subtitle={`${Math.round(average * 100)}% of scheduled habits done across the year`}
        right={<Select value={habitId} onChange={setHabitId} options={[{ value: 'all', label: 'All habits' }, ...db.habits.map((h) => ({ value: h.id, label: h.name, icon: h.icon }))]} />}
      />
      <div className="overflow-x-auto pb-2">
        <Heatmap
          weeks={grid}
          values={coverage}
          partial
          cell={11}
          weekStart={weekStart}
          color="var(--success)"
          emptyLabel="Nothing scheduled"
          formatTooltip={(date, value) => {
            const pct = Math.round(value * 100);
            return (
              <>
                <div className="font-medium">{format(new Date(`${date}T12:00:00`), 'EEE, MMM d')}</div>
                <div className="text-muted">{value > 0 ? `${pct}% of that day's habits done` : 'No habits due'}</div>
              </>
            );
          }}
        />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-faint">
        <span>None</span>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="relative h-2.5 w-2.5 overflow-hidden rounded-[2.5px]" style={{ background: 'color-mix(in srgb, var(--text-faint) 14%, transparent)' }}>
            {f > 0 && <span className="absolute inset-y-0 left-0" style={{ width: `${f * 100}%`, background: 'var(--success)' }} />}
          </span>
        ))}
        <span>All done</span>
      </div>
    </Panel>
  );
}

function HeatmapView() {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;
  return (
    <>
      <HabitYearStrip />
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {db.habits.map((h) => {
          const st = habitStats(h, db.habitLogs, weekStart);
          return (
            <div key={h.id} className="flex items-center gap-2 rounded-[12px] bg-s1 p-2.5">
              <Icon name={h.icon} size={15} style={{ color: h.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px]">{h.name}</div>
                <div className="text-[10.5px] text-faint">{st.totalCompletions} completions · {st.consistency}% this week</div>
              </div>
              <ProgressRing value={(st.weekDone / Math.max(1, st.weekTarget)) * 100} size={30} stroke={3.5} color={h.color} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function StreaksView() {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {db.habits.map((h) => {
        const st = habitStats(h, db.habitLogs, weekStart);
        const last30 = Array.from({ length: 30 }, (_, i) => subDays(new Date(), 29 - i));
        return (
          <Panel key={h.id} className="p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${h.color} 16%, transparent)` }}>
                <Icon name={h.icon} size={15} style={{ color: h.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{h.name}</div>
                <div className="text-[11px] text-faint">{st.bestWeekday !== '—' ? `best on ${st.bestWeekday}s` : 'not enough data yet'}</div>
              </div>
              <div className="text-right">
                <div className="num text-[20px] font-semibold leading-none" style={{ color: h.color }}>{st.current}</div>
                <div className="text-[9.5px] uppercase tracking-wide text-faint">day streak</div>
              </div>
            </div>
            <div className="mt-3 flex gap-0.5">
              {last30.map((d) => {
                const log = db.habitLogs.find((l) => l.habitId === h.id && l.date === format(d, 'yyyy-MM-dd'));
                const done = log && !log.skipped;
                return <span key={d.toISOString()} title={format(d, 'MMM d')} className="h-6 flex-1 rounded-[3px]"
                  style={{ background: done ? h.color : log?.skipped ? 'var(--surface-3)' : 'color-mix(in srgb, var(--text-faint) 12%, transparent)' }} />;
              })}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Icon name="Trophy" size={11} /> longest {st.longest}</span>
              <span className="flex items-center gap-1"><Icon name="Repeat" size={11} /> weekly {st.weeklyStreak}</span>
              <span className="ml-auto num">{st.weekDone}/{st.weekTarget}</span>
            </div>
          </Panel>
        );
      })}
      {!db.habits.length && <EmptyState icon="TrendingUp" title="No habits to streak yet" />}
    </div>
  );
}

function CalendarView() {
  const db = useFlow((s) => s.db);
  const checkIn = useFlow((s) => s.checkIn);
  const [month, setMonth] = useState(new Date());
  const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1), { weekStartsOn: db.settings.behavior.weekStart as 0 | 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-medium">{format(month, 'MMMM yyyy')}</span>
        <div className="ml-auto flex gap-1">
          <IconBtn icon="ChevronLeft" label="Previous" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <Btn size="sm" variant="ghost" onClick={() => setMonth(new Date())}>Today</Btn>
          <IconBtn icon="ChevronRight" label="Next" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const scheduled = db.habits.filter((h) => isHabitScheduled(h, d));
          const done = db.habitLogs.filter((l) => l.date === format(d, 'yyyy-MM-dd') && !l.skipped);
          return (
            <div key={d.toISOString()} className={cn('min-h-[86px] rounded-[12px] p-1.5', d.getMonth() === month.getMonth() ? 'bg-s1/60' : 'bg-s1/20')}>
              <div className={cn('num mb-1 text-[10.5px]', isSameDay(d, new Date()) ? 'text-accent' : 'text-faint')}>{format(d, 'd')}</div>
              <div className="space-y-0.5">
                {scheduled.slice(0, 4).map((h) => {
                  const isDone = done.some((l) => l.habitId === h.id);
                  return (
                    <button key={h.id} onClick={() => checkIn(h.id, format(d, 'yyyy-MM-dd'), h.target.type === 'boolean' ? 1 : h.target.value)}
                      className="focusable flex w-full items-center gap-1 rounded-[6px] px-1 py-0.5 text-left text-[10px]"
                      style={{ background: isDone ? `color-mix(in srgb, ${h.color} 26%, transparent)` : 'var(--surface-2)' }}>
                      <Icon name={isDone ? 'Check' : h.icon} size={9} style={{ color: h.color }} />
                      <span className="truncate">{h.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-faint">Click a habit chip to check it in for that day.</div>
    </Panel>
  );
}

function InsightsView() {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;
  const bucket = useMemo(() => bucketSessions(db.focusSessions), [db.focusSessions]);
  const studyByDay = Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, v.minutes]));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {db.habits.map((h) => {
        const st = habitStats(h, db.habitLogs, weekStart);
        // correlation: average study minutes on completed vs missed days
        const days = Object.keys(studyByDay);
        const doneDays = db.habitLogs.filter((l) => l.habitId === h.id && !l.skipped).map((l) => l.date);
        const avgDone = doneDays.length ? doneDays.reduce((a, d) => a + (studyByDay[d] ?? 0), 0) / doneDays.length : 0;
        const avgAll = days.length ? days.reduce((a, d) => a + studyByDay[d], 0) / days.length : 0;
        return (
          <Panel key={h.id} className="p-3.5">
            <div className="flex items-center gap-2">
              <Icon name={h.icon} size={15} style={{ color: h.color }} />
              <span className="text-[13px] font-medium">{h.name}</span>
              <Badge tone="accent">{st.consistency}%</Badge>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
              <div className="rounded-[10px] bg-s1 p-2">
                <div className="text-faint">Best weekday</div>
                <div className="mt-0.5 text-[12.5px]">{st.bestWeekday}</div>
              </div>
              <div className="rounded-[10px] bg-s1 p-2">
                <div className="text-faint">Best time</div>
                <div className="num mt-0.5 text-[12.5px]">{st.bestHour}</div>
              </div>
              <div className="rounded-[10px] bg-s1 p-2">
                <div className="text-faint">Study on habit days</div>
                <div className="num mt-0.5 text-[12.5px]" style={{ color: h.color }}>{minsToHM(avgDone)}</div>
              </div>
              <div className="rounded-[10px] bg-s1 p-2">
                <div className="text-faint">Average day</div>
                <div className="num mt-0.5 text-[12.5px]">{minsToHM(avgAll)}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-faint">
              {avgDone > avgAll
                ? `You study ${minsToHM(avgDone - avgAll)} more on days you keep this habit.`
                : `This habit tends to land on lighter study days.`}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

export function HabitDialog({ open, onClose, habit }: { open: boolean; onClose: () => void; habit: Habit | null }) {
  const db = useFlow((s) => s.db);
  const addHabit = useFlow((s) => s.addHabit);
  const updateHabit = useFlow((s) => s.updateHabit);
  const deleteHabit = useFlow((s) => s.deleteHabit);
  const [form, setForm] = useState<Partial<Habit>>({});

  useEffect(() => {
    if (!open) return;
    setForm(habit ?? {
      name: '', icon: 'Sparkles', color: '#57c9a0', description: '',
      schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 7 },
      target: { type: 'boolean', value: 1 }, reminderTimes: [],
    });
  }, [open, habit]);

  const set = (patch: Partial<Habit>) => setForm((f) => ({ ...f, ...patch }));
  const schedule = form.schedule ?? { type: 'daily' as const, days: [0, 1, 2, 3, 4, 5, 6], times: 7 };

  const save = () => {
    if (!form.name?.trim()) return;
    if (habit) updateHabit(habit.id, form);
    else addHabit(form);
    onClose();
  };

  const templates = [
    { name: 'Read 30 minutes', icon: 'BookOpen', target: { type: 'duration' as const, value: 30 } },
    { name: 'Exercise', icon: 'Dumbbell', target: { type: 'boolean' as const, value: 1 } },
    { name: 'Meditate', icon: 'Brain', target: { type: 'duration' as const, value: 10 } },
    { name: 'Review notes', icon: 'NotebookPen', target: { type: 'boolean' as const, value: 1 } },
    { name: 'Practice instrument', icon: 'Music', target: { type: 'duration' as const, value: 20 } },
    { name: 'Plan tomorrow', icon: 'ListChecks', target: { type: 'boolean' as const, value: 1 } },
  ];

  return (
    <Modal open={open} onClose={onClose} wide title={habit ? 'Edit habit' : 'New habit'}
      subtitle="Habits are weekly commitments tracked by streaks, not deadlines"
      footer={<>
        {habit && <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={() => { deleteHabit(habit.id); onClose(); }}>Delete</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="Check" onClick={save}>{habit ? 'Save' : 'Create habit'}</Btn>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput autoFocus value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Habit name" className="text-[15px] font-medium" />
          <div className="flex items-center gap-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, ${form.color ?? '#57c9a0'} 18%, transparent)` }}>
              <Icon name={form.icon ?? 'Sparkles'} size={16} style={{ color: form.color }} />
            </span>
          </div>
        </div>

        {!habit && (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button key={t.name} onClick={() => set({ name: t.name, icon: t.icon, target: t.target })} className="focusable chip hover:bg-s3">
                <Icon name={t.icon} size={11} /> {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Icon">
            <IconPicker value={form.icon ?? 'Sparkles'} onChange={(v) => set({ icon: v })} color={form.color} />
          </Field>
          <Field label="Colour">
            <ColorPicker value={form.color ?? '#57c9a0'} onChange={(v) => set({ color: v })} />
          </Field>
        </div>

        <Field label="Schedule">
          <Segmented
            value={schedule.type}
            onChange={(v) => set({ schedule: { ...schedule, type: v } })}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'weekdays', label: 'Specific days' },
              { value: 'timesPerWeek', label: 'N per week' },
              { value: 'everyOtherDay', label: 'Every other day' },
              { value: 'rrule', label: 'Custom' },
            ]}
          />
        </Field>

        {schedule.type === 'weekdays' && (
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = schedule.days.includes(d);
              return (
                <button key={d} onClick={() => set({ schedule: { ...schedule, days: on ? schedule.days.filter((x) => x !== d) : [...schedule.days, d] } })}
                  className="focusable h-9 flex-1 rounded-[10px] text-[12px]"
                  style={{ background: on ? 'var(--accent)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-muted)' }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'][d]}
                </button>
              );
            })}
          </div>
        )}

        {schedule.type === 'timesPerWeek' && (
          <Field label="Times per week">
            <TextInput type="number" min={1} max={21} value={schedule.times} onChange={(e) => set({ schedule: { ...schedule, times: Number(e.target.value) } })} />
          </Field>
        )}

        {schedule.type === 'rrule' && (
          <Field label="Recurrence">
            <Select value={schedule.rrule ?? RRULE_PRESETS[0].value} onChange={(v) => set({ schedule: { ...schedule, rrule: v } })} options={RRULE_PRESETS.map((r) => ({ value: r.value, label: r.label }))} />
          </Field>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Target type">
            <Select
              value={form.target?.type ?? 'boolean'}
              onChange={(v) => set({ target: { type: v as 'boolean' | 'count' | 'duration', value: form.target?.value ?? 1 } })}
              options={[{ value: 'boolean', label: 'Done / not done' }, { value: 'count', label: 'Count' }, { value: 'duration', label: 'Duration (min)' }]}
            />
          </Field>
          <Field label="Target value">
            <TextInput type="number" min={1} disabled={form.target?.type === 'boolean'} value={form.target?.value ?? 1}
              onChange={(e) => set({ target: { type: form.target?.type ?? 'boolean', value: Number(e.target.value) } })} />
          </Field>
          <Field label="Reminder time">
            <TimeField label="Reminder time" value={form.reminderTimes?.[0] ?? ''} onChange={(v) => set({ reminderTimes: v ? [v] : [] })} />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Linked subject">
            <Select value={form.linkedSubjectId ?? ''} onChange={(v) => set({ linkedSubjectId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
          </Field>
          <Field label="Linked sound mix">
            <Select value={form.mixId ?? ''} onChange={(v) => set({ mixId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.mixes.map((m) => ({ value: m.id, label: m.name }))]} />
          </Field>
        </div>

        <Field label="Description">
          <TextArea rows={2} value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Why this habit matters" />
        </Field>

        <div className="rounded-[12px] bg-s1 p-3">
          <Toggle label="Paused (protects streaks)" description="Streaks freeze while paused"
            checked={!!form.pausedUntil && new Date(form.pausedUntil) > new Date()}
            onChange={(v) => set({ pausedUntil: v ? addDays(new Date(), 7).toISOString() : undefined })} />
        </div>
      </div>
    </Modal>
  );
}
