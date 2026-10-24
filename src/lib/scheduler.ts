import { addMinutes, format, isAfter, isBefore, setHours, setMinutes, startOfDay } from 'date-fns';
import type { Reminder, Settings } from './types';

/** Pure, testable scheduler helpers (spec §10.2 / §10.5). */

export function quietHoursActive(settings: Settings, now: Date = new Date()): boolean {
  const q = settings.notifications.quietHours;
  if (!q.enabled) return false;
  const [fh, fm] = q.from.split(':').map(Number);
  const [th, tm] = q.to.split(':').map(Number);
  const from = setMinutes(setHours(startOfDay(now), fh || 0), fm || 0);
  const to = setMinutes(setHours(startOfDay(now), th || 0), tm || 0);
  if (isBefore(from, to) || +from === +to) return now >= from && now < to;
  // window crosses midnight
  return now >= from || now < to;
}

export type DueReminder = { reminder: Reminder; missed: boolean };

/** Reminders whose effective fire time has passed and that were not delivered.
 *  Quiet hours never drop a reminder — it is held until the window closes. */
export function dueReminders(reminders: Reminder[], now: Date = new Date(), settings?: Settings): DueReminder[] {
  if (settings && quietHoursActive(settings, now)) return [];
  const out: DueReminder[] = [];
  for (const r of reminders) {
    if (r.delivered) continue;
    const effective = r.snoozedUntil ? new Date(r.snoozedUntil) : new Date(r.fireAt);
    if (isAfter(effective, now)) continue;
    const missed = now.getTime() - effective.getTime() > 5 * 60 * 1000;
    out.push({ reminder: r, missed });
  }
  return out.sort((a, b) => +new Date(a.reminder.fireAt) - +new Date(b.reminder.fireAt));
}

/** Missed reminders detected on boot (spec §10.2 restart recovery). */
export function missedOnBoot(reminders: Reminder[], now: Date = new Date()): Reminder[] {
  return reminders.filter((r) => !r.delivered && isBefore(new Date(r.snoozedUntil ?? r.fireAt), addMinutes(now, -5)));
}

export function nextFireAt(reminders: Reminder[], now: Date = new Date()): Date | null {
  const times = reminders
    .filter((r) => !r.delivered)
    .map((r) => new Date(r.snoozedUntil ?? r.fireAt))
    .filter((d) => isAfter(d, now))
    .sort((a, b) => +a - +b);
  return times[0] ?? null;
}

/** Reminder offsets for a todo due time → fire times (due-soon ladder). */
export function todoReminderTimes(dueAt: string, offsetsMin: number[] = [1440, 120, 60, 10, 0]) {
  const due = new Date(dueAt);
  return offsetsMin.map((o) => new Date(due.getTime() - o * 60000));
}

export function escalatingOverdueTimes(dueAt: string) {
  const due = new Date(dueAt);
  return [5, 30, 120].map((m) => new Date(due.getTime() + m * 60000));
}

export function describeQuietHours(settings: Settings) {
  const q = settings.notifications.quietHours;
  if (!q.enabled) return 'Quiet hours off';
  return `Quiet ${q.from}–${q.to}`;
}

export function todayAt(time: string, now: Date = new Date()) {
  const [h, m] = time.split(':').map(Number);
  return setMinutes(setHours(startOfDay(now), h || 0), m || 0);
}

export function habitReminderTime(time: string, now: Date = new Date()) {
  return format(todayAt(time, now), "yyyy-MM-dd'T'HH:mm:00");
}
