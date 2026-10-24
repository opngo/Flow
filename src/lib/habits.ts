import { RRule, rrulestr } from 'rrule';
import { addDays, format, startOfDay } from 'date-fns';
import type { Habit, HabitLog, Todo } from './types';

export function nextOccurrence(rrule: string, after: Date = new Date()): Date | null {
  try {
    const rule = rrulestr(rrule, { dtstart: startOfDay(new Date(after.getTime() - 200 * 86400000)) });
    const next = rule.after(after, false);
    return next ?? null;
  } catch {
    return null;
  }
}

export function occurrencesBetween(rrule: string, from: Date, to: Date): Date[] {
  try {
    const rule = rrulestr(rrule, { dtstart: startOfDay(from) });
    return rule.between(from, to, true);
  } catch {
    return [];
  }
}

/** Build the next instance of a recurring todo (spec §6.4). */
export function spawnNextTodo(todo: Todo, mode: 'on-complete' | 'on-schedule' = 'on-complete'): Todo | null {
  if (!todo.rrule) return null;
  const base = todo.dueAt ? new Date(todo.dueAt) : new Date();
  const next = nextOccurrence(todo.rrule, mode === 'on-complete' ? base : new Date(base.getTime() - 1000));
  if (!next) return null;
  return {
    ...todo,
    id: crypto.randomUUID(),
    status: 'todo',
    completedAt: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: next.toISOString(),
    startAt: todo.startAt && todo.dueAt
      ? new Date(next.getTime() - (new Date(todo.dueAt).getTime() - new Date(todo.startAt).getTime())).toISOString()
      : undefined,
    checklist: todo.checklist.map((c) => ({ ...c, id: crypto.randomUUID(), done: false })),
  };
}

export function describeRRule(rrule?: string) {
  if (!rrule) return 'Does not repeat';
  try {
    return rrulestr(rrule).toText();
  } catch {
    return rrule;
  }
}

export const RRULE_PRESETS = [
  { label: 'Every day', value: 'FREQ=DAILY' },
  { label: 'Every weekday', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week', value: 'FREQ=WEEKLY' },
  { label: 'Every 2 weeks', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month', value: 'FREQ=MONTHLY' },
  { label: 'Every year', value: 'FREQ=YEARLY' },
];

/** Habit scheduling -------------------------------------------------- */

export function isHabitScheduled(habit: Habit, date: Date): boolean {
  const dow = date.getDay();
  const s = habit.schedule;
  const start = startOfDay(new Date(habit.startDate));
  if (startOfDay(date) < start) return false;
  if (habit.endDate && startOfDay(date) > startOfDay(new Date(habit.endDate))) return false;
  if (habit.pausedUntil && startOfDay(date) <= startOfDay(new Date(habit.pausedUntil))) return false;
  switch (s.type) {
    case 'daily': return true;
    case 'weekdays': return s.days.includes(dow);
    case 'everyOtherDay': {
      const diff = Math.floor((startOfDay(date).getTime() - start.getTime()) / 86400000);
      return diff % 2 === 0;
    }
    case 'timesPerWeek': return true; // any day counts toward the weekly target
    case 'rrule': return s.rrule ? occurrencesBetween(s.rrule, startOfDay(date), addDays(startOfDay(date), 1)).length > 0 : false;
    default: return false;
  }
}

export function weeklyTarget(habit: Habit): number {
  if (habit.schedule.type === 'timesPerWeek') return habit.schedule.times;
  if (habit.schedule.type === 'weekdays') return habit.schedule.days.length;
  if (habit.schedule.type === 'daily') return 7;
  if (habit.schedule.type === 'everyOtherDay') return 4;
  return 4;
}

export function logValue(log?: HabitLog) {
  return log && !log.skipped ? log.value : 0;
}

export function isComplete(habit: Habit, log?: HabitLog) {
  if (!log || log.skipped) return false;
  if (habit.target.type === 'boolean') return log.value >= 1;
  return log.value >= (habit.target.value || 1);
}

/** Weekly bucket of logs, respecting the configured week start. */
export function weekBuckets(logs: HabitLog[], weekStart: number) {
  const map = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const d = new Date(`${log.date}T12:00:00`);
    const offset = (d.getDay() - weekStart + 7) % 7;
    const key = format(addDays(d, -offset), 'yyyy-MM-dd');
    const arr = map.get(key) ?? [];
    arr.push(log);
    map.set(key, arr);
  }
  return map;
}

export type HabitStats = {
  current: number;
  longest: number;
  weeklyStreak: number;
  consistency: number;
  weekDone: number;
  weekTarget: number;
  bestWeekday: string;
  bestHour: string;
  totalCompletions: number;
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Pure stats used by habits UI and unit tests. */
export function habitStats(habit: Habit, logs: HabitLog[], weekStart = 1, ref = new Date()): HabitStats {
  const completeDates = new Set(
    logs.filter((l) => l.habitId === habit.id && isComplete(habit, l)).map((l) => l.date),
  );
  // current streak: walk backwards over scheduled days, allowing today to be pending
  let current = 0;
  let cursor = startOfDay(ref);
  let guard = 0;
  if (!completeDates.has(format(cursor, 'yyyy-MM-dd')) && isHabitScheduled(habit, cursor)) {
    cursor = addDays(cursor, -1);
  }
  while (guard < 800) {
    guard += 1;
    if (habit.schedule.type === 'timesPerWeek') {
      // weekly-target habits keep the streak alive as long as the week is on pace
      const weekStartDate = addDays(cursor, -(((cursor.getDay() - weekStart) + 7) % 7));
      const weekLogs = logs.filter((l) => {
        const d = new Date(`${l.date}T12:00:00`);
        return l.habitId === habit.id && d >= weekStartDate && d < addDays(weekStartDate, 7) && isComplete(habit, l);
      });
      if (weekLogs.length >= weeklyTarget(habit)) {
        current += 1;
        cursor = addDays(weekStartDate, -1);
        continue;
      }
      if (weekStartDate > startOfDay(ref) || weekStartDate.getTime() > startOfDay(ref).getTime() - 0) {
        const sameWeek = weekStartDate.getTime() === addDays(startOfDay(ref), -(((ref.getDay() - weekStart) + 7) % 7)).getTime();
        if (sameWeek) { cursor = addDays(weekStartDate, -1); continue; }
      }
      break;
    }
    if (!isHabitScheduled(habit, cursor)) { cursor = addDays(cursor, -1); continue; }
    if (completeDates.has(format(cursor, 'yyyy-MM-dd'))) { current += 1; cursor = addDays(cursor, -1); continue; }
    break;
  }

  // longest streak over scheduled days
  let longest = 0;
  let run = 0;
  for (let i = 400; i >= 0; i -= 1) {
    const d = addDays(startOfDay(ref), -i);
    if (!isHabitScheduled(habit, d)) continue;
    if (completeDates.has(format(d, 'yyyy-MM-dd'))) { run += 1; longest = Math.max(longest, run); }
    else run = 0;
  }
  longest = Math.max(longest, current);

  // weekly streak: consecutive weeks meeting the weekly target going backwards
  const weeks = weekBuckets(logs.filter((l) => l.habitId === habit.id && isComplete(habit, l)), weekStart);
  let weeklyStreak = 0;
  let wCursor = addDays(startOfDay(ref), -(((ref.getDay() - weekStart) + 7) % 7));
  for (let i = 0; i < 60; i += 1) {
    const key = format(wCursor, 'yyyy-MM-dd');
    const count = (weeks.get(key) ?? []).length;
    if (count >= weeklyTarget(habit)) { weeklyStreak += 1; wCursor = addDays(wCursor, -7); }
    else if (i === 0) { wCursor = addDays(wCursor, -7); }
    else break;
  }

  const thisWeekStart = addDays(startOfDay(ref), -(((ref.getDay() - weekStart) + 7) % 7));
  const thisWeekLogs = logs.filter((l) => {
    const d = new Date(`${l.date}T12:00:00`);
    return l.habitId === habit.id && d >= thisWeekStart && d < addDays(thisWeekStart, 7) && isComplete(habit, l);
  });

  const scheduledSoFar = Array.from({ length: 7 }, (_, i) => addDays(thisWeekStart, i))
    .filter((d) => d <= startOfDay(ref) && isHabitScheduled(habit, d)).length;
  const consistency = scheduledSoFar ? Math.round((thisWeekLogs.length / Math.max(1, scheduledSoFar)) * 100) : 0;

  const byWeekday = new Array(7).fill(0) as number[];
  const byHour = new Array(24).fill(0) as number[];
  for (const date of completeDates) {
    const d = new Date(`${date}T12:00:00`);
    byWeekday[d.getDay()] += 1;
  }
  logs.filter((l) => l.habitId === habit.id).forEach((l) => {
    const hour = l.source === 'timer' ? 10 : 20;
    byHour[hour] += 1;
  });

  const bestWeekdayIdx = byWeekday.indexOf(Math.max(...byWeekday));
  const bestHourIdx = byHour.indexOf(Math.max(...byHour));
  const hourLabel = `${String(bestHourIdx).padStart(2, '0')}:00`;

  return {
    current,
    longest,
    weeklyStreak,
    consistency,
    weekDone: thisWeekLogs.length,
    weekTarget: weeklyTarget(habit),
    bestWeekday: byWeekday[bestWeekdayIdx] ? WEEKDAY_NAMES[bestWeekdayIdx] : '—',
    bestHour: byHour[bestHourIdx] ? hourLabel : '—',
    totalCompletions: completeDates.size,
  };
}

export { RRule };
