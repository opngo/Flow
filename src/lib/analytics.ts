import { addDays, format, startOfDay, startOfWeek, subDays } from 'date-fns';
import type { FocusSession, Habit, HabitLog, Todo } from './types';
import { isComplete } from './habits';

export type HeatCell = { date: string; minutes: number; sessions: number; topSubject?: string };

export type DayBucket = Record<string, { minutes: number; sessions: number; bySubject: Record<string, number> }>;

export function bucketSessions(sessions: FocusSession[]): DayBucket {
  const out: DayBucket = {};
  for (const s of sessions) {
    if (!['focus', 'stopwatch', 'timer', 'exam'].includes(s.kind)) continue;
    const key = format(new Date(s.startedAt), 'yyyy-MM-dd');
    const b = (out[key] ||= { minutes: 0, sessions: 0, bySubject: {} });
    b.minutes += s.actualMin || 0;
    b.sessions += 1;
    const sub = s.subjectId ?? 'none';
    b.bySubject[sub] = (b.bySubject[sub] ?? 0) + (s.actualMin || 0);
  }
  return out;
}

/** Percentile-scaled thresholds → 5 intensity levels (0 + 4 shades). */
export function thresholds(values: number[], custom?: number[]) {
  if (custom && custom.length === 4) return custom;
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!active.length) return [15, 30, 60, 120];
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(active.length * p))];
  return [q(0.25), q(0.5), q(0.75), q(0.9)];
}

export function levelFor(minutes: number, th: number[]) {
  if (minutes <= 0) return 0;
  if (minutes >= th[3]) return 4;
  if (minutes >= th[2]) return 3;
  if (minutes >= th[1]) return 2;
  return 1;
}

/** 53 x 7 GitHub grid for a calendar year. */
export function buildYearGrid(year: number, weekStart: number) {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const gridStart = startOfWeek(jan1, { weekStartsOn: weekStart as 0 | 1 });
  const weeks: Date[][] = [];
  let cursor = gridStart;
  while (cursor <= dec31) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return { weeks, gridStart, gridEnd: addDays(cursor, -1) };
}

/** Rolling N-week strip for dashboard widgets. */
export function buildRollingGrid(weeksCount: number, weekStart: number, ref = new Date()) {
  const thisWeek = startOfWeek(ref, { weekStartsOn: weekStart as 0 | 1 });
  const start = subDays(thisWeek, (weeksCount - 1) * 7);
  return Array.from({ length: weeksCount }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

export function streakStats(bucket: DayBucket, ref = new Date()) {
  const keys = new Set(Object.keys(bucket).filter((k) => bucket[k].minutes > 0));
  let current = 0;
  let cursor = startOfDay(ref);
  if (!keys.has(format(cursor, 'yyyy-MM-dd'))) cursor = addDays(cursor, -1);
  while (keys.has(format(cursor, 'yyyy-MM-dd'))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  const allSorted = Array.from(keys).sort();
  let prev: Date | null = null;
  for (const k of allSorted) {
    const d = new Date(`${k}T12:00:00`);
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current) };
}

export function summaryStats(bucket: DayBucket, ref = new Date()) {
  const entries = Object.entries(bucket).filter(([, v]) => v.minutes > 0);
  const totalMin = entries.reduce((a, [, v]) => a + v.minutes, 0);
  const activeDays = entries.length;
  const avg = activeDays ? totalMin / activeDays : 0;
  const best = entries.sort((a, b) => b[1].minutes - a[1].minutes)[0];
  const byWeek = new Map<string, number>();
  for (const [k, v] of entries) {
    const d = new Date(`${k}T12:00:00`);
    const wk = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + v.minutes);
  }
  const bestWeek = Array.from(byWeek.entries()).sort((a, b) => b[1] - a[1])[0];
  const bySubject = new Map<string, number>();
  for (const [, v] of entries) for (const [s, m] of Object.entries(v.bySubject)) bySubject.set(s, (bySubject.get(s) ?? 0) + m);
  const topSubject = Array.from(bySubject.entries()).sort((a, b) => b[1] - a[1])[0];
  return {
    totalMin,
    activeDays,
    avg,
    bestDay: best ? { date: best[0], minutes: best[1].minutes } : null,
    bestWeek: bestWeek ? { week: bestWeek[0], minutes: bestWeek[1] } : null,
    topSubjectId: topSubject?.[0],
    topSubjectMin: topSubject?.[1] ?? 0,
    streaks: streakStats(bucket, ref),
    bySubject: Object.fromEntries(bySubject),
  };
}

/** Hour-of-day x weekday matrix = "when you focus best". */
export function hourWeekdayMatrix(sessions: FocusSession[]) {
  const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const s of sessions) {
    if (!['focus', 'stopwatch', 'timer', 'exam'].includes(s.kind)) continue;
    const d = new Date(s.startedAt);
    m[d.getDay()][d.getHours()] += s.actualMin || 0;
  }
  return m;
}

export function tasksPerDay(todos: Todo[]) {
  const out: Record<string, number> = {};
  for (const t of todos) {
    if (t.status !== 'done' || !t.completedAt) continue;
    const k = format(new Date(t.completedAt), 'yyyy-MM-dd');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function habitDayMap(habit: Habit, logs: HabitLog[]) {
  const out: Record<string, number> = {};
  for (const l of logs) {
    if (l.habitId !== habit.id) continue;
    out[l.date] = isComplete(habit, l) ? 1 : 0;
  }
  return out;
}
