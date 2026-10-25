import { nextDay, setHours, setMinutes, startOfDay } from 'date-fns';

/**
 * Recurring tasks, in the shape people actually type.
 *
 *   [name] every|on [other] [weekday] [at time] [#auto]
 *
 *   "Read every Monday at 18:00"
 *   "Gym every other Wednesday at 1730"
 *   "Standup on friday at 0930"
 *   "Stretch every day at 07:15"
 *   "Review biweekly at 18"
 *
 * The phrase is parsed into an iCalendar RRULE, which is what the todo already
 * stores, so nothing downstream needs to know about the syntax. Times are
 * military by default: `1800` and `18:00` both mean six in the evening. `#auto`
 * standardises a loose hour — `at 6` becomes `06:00` instead of being ignored.
 */

export type RepeatTime = { h: number; m: number };

export type Recurrence = {
  /** iCalendar rule, e.g. `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO` */
  rrule: string;
  /** Time of day the phrase carried, if any. */
  time?: RepeatTime;
  /** The text that was consumed, so the caller can strip it from the title. */
  matched: string;
  /** True when `#auto` was present. */
  auto: boolean;
};

const DAYS: Record<string, string> = {
  sunday: 'SU', sun: 'SU',
  monday: 'MO', mon: 'MO',
  tuesday: 'TU', tue: 'TU', tues: 'TU',
  wednesday: 'WE', wed: 'WE', weds: 'WE',
  thursday: 'TH', thu: 'TH', thurs: 'TH',
  friday: 'FR', fri: 'FR',
  saturday: 'SA', sat: 'SA',
};

const DAY_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

const DAY_NAMES = `(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|weds|thursday|thu|thurs|friday|fri|saturday|sat)`;
const EVERY = `(?:every|each|on|the)`;

/** `1800`, `18:00`, `6pm`, `6:30 pm`, `at 9` (only with #auto). */
function parseTime(raw: string, auto: boolean): RepeatTime | undefined {
  const s = raw.trim().toLowerCase();
  // 12-hour clock
  let m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    const h = parseInt(m[1], 10) % 12 + (m[3] === 'pm' ? 12 : 0);
    return { h, m: m[2] ? parseInt(m[2], 10) : 0 };
  }
  // colon form
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    return h <= 23 && mm <= 59 ? { h, m: mm } : undefined;
  }
  // military form: 930 or 1800
  m = s.match(/^(\d{3,4})$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const h = Math.floor(n / 100);
    const mm = n % 100;
    if (h <= 23 && mm <= 59) return { h, m: mm };
    return undefined;
  }
  // a bare hour only when the phrase asked for standardisation
  m = s.match(/^(\d{1,2})$/);
  if (m && auto) {
    const h = parseInt(m[1], 10);
    if (h <= 23) return { h, m: 0 };
  }
  return undefined;
}

function buildRule(freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY', interval: number, byDay: string[]) {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (byDay.length) parts.push(`BYDAY=${byDay.join(',')}`);
  return parts.join(';');
}

/**
 * Pulls a recurrence phrase out of free text. Returns the remainder and the
 * rule, so `parseQuickAdd` can keep the title clean.
 */
export function parseRecurrence(input: string): { text: string; recurrence?: Recurrence } {
  const auto = /(^|\s)#auto\b/i.test(input);
  let text = input.replace(/(^|\s)#auto\b/gi, '$1');

  // The whole phrase has to hang together: cadence, optional interval, optional
  // weekday, optional time. Anything looser would swallow ordinary words.
  const re = new RegExp(
    `(^|\\s)(${EVERY}\\s+)?` +
    `(?:(other|second|alternate)\\s+)?` +
    `(day|weekday|week|weekend|month|year|biweekly|fortnightly|${DAY_NAMES.replace(/^\(|\)$/g, '')})` +
    `(?:\\s+${DAY_NAMES})?` +
    // Military first: `1730` must not be read as `17` followed by junk.
    `(?:\\s+(?:at|@)\\s*(\\d{3,4}(?!\\d)|\\d{1,2}:\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm)|\\d{1,2}(?![:\\d])))?`,
    'i',
  );

  const m = text.match(re);
  if (!m) return { text: input };

  const [matched, lead, cadenceWord, intervalWord, unitRaw, weekdayRaw, timeRaw] = m;
  const unit = unitRaw.toLowerCase();
  const weekday = (weekdayRaw ?? '').toLowerCase();
  const weekdayCode = weekday ? DAYS[weekday] : undefined;
  const interval = intervalWord ? 2 : 1;
  const hasEvery = !!cadenceWord;

  // A bare weekday ("on friday") only counts when it is introduced by a cadence
  // word, otherwise "fri" inside a title would silently become a rule.
  if (!hasEvery && !/^(biweekly|fortnightly)$/.test(unit)) return { text: input };
  if (!hasEvery && !weekdayCode && /^(day|weekday|week|month|year|weekend)$/.test(unit)) {
    // "biweekly at 18" is fine, but a naked "day" is not a rule.
  }

  let rrule: string | undefined;
  if (unit === 'day') {
    rrule = buildRule('DAILY', interval, []);
  } else if (unit === 'weekend') {
    rrule = buildRule('WEEKLY', interval, ['SA', 'SU']);
  } else if (unit === 'weekday' || unit === 'weekdays') {
    rrule = buildRule('WEEKLY', interval, ['MO', 'TU', 'WE', 'TH', 'FR']);
  } else if (unit === 'biweekly' || unit === 'fortnightly') {
    rrule = buildRule('WEEKLY', 2, weekdayCode ? [weekdayCode] : []);
  } else if (unit === 'week') {
    rrule = buildRule('WEEKLY', interval, weekdayCode ? [weekdayCode] : []);
  } else if (unit === 'month') {
    rrule = buildRule('MONTHLY', interval, weekdayCode ? [weekdayCode] : []);
  } else if (unit === 'year') {
    rrule = buildRule('YEARLY', interval, []);
  } else if (DAYS[unit]) {
    // "every monday" — the weekday itself was the cadence
    rrule = buildRule('WEEKLY', interval, [DAYS[unit]]);
  } else if (weekdayCode) {
    rrule = buildRule('WEEKLY', interval, [weekdayCode]);
  }

  if (!rrule) return { text: input };

  const time = timeRaw ? parseTime(timeRaw, auto) : undefined;
  // A bare `#auto` hour that failed to parse still leaves a valid rule.
  return {
    text: text.replace(matched, lead).replace(/\s{2,}/g, ' '),
    recurrence: { rrule, time, matched: matched.trim(), auto },
  };
}

/** The first occurrence of `rrule` at `time`, or null when it never lands. */
export function firstOccurrence(rrule: string, time?: RepeatTime, from: Date = new Date()): Date | null {
  const day = rrule.match(/BYDAY=([A-Z,]+)/);
  const start = startOfDay(from);
  let base: Date;
  if (day) {
    const codes = day[1].split(',');
    const candidates = codes
      .map((c) => nextDay(start, (DAY_INDEX[c] ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6))
      .sort((a, b) => +a - +b);
    base = candidates[0] ?? start;
  } else if (rrule.includes('FREQ=DAILY')) {
    base = start;
  } else if (rrule.includes('FREQ=WEEKLY')) {
    base = start;
  } else if (rrule.includes('FREQ=MONTHLY')) {
    base = start;
  } else {
    base = start;
  }
  if (time) return setMinutes(setHours(base, time.h), time.m);
  return setMinutes(setHours(base, 23), 59);
}

/** Human sentence for a rule: "every 2 weeks on Monday at 18:00". */
export function describeRecurrence(recurrence?: Recurrence): string {
  if (!recurrence) return 'Does not repeat';
  const { rrule, time } = recurrence;
  const day = rrule.match(/BYDAY=([A-Z,]+)/)?.[1];
  const names: Record<string, string> = {
    SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday',
  };
  const every = rrule.includes('INTERVAL=2') ? 'every other' : 'every';
  let body: string;
  if (rrule.includes('FREQ=DAILY')) body = every === 'every other' ? 'every other day' : 'every day';
  else if (rrule.includes('FREQ=MONTHLY')) body = 'every month';
  else if (rrule.includes('FREQ=YEARLY')) body = 'every year';
  else if (day === 'MO,TU,WE,TH,FR') body = 'every weekday';
  else if (day === 'SA,SU') body = 'every weekend';
  else if (day) body = `${every} ${names[day] ?? day}`;
  else body = every === 'every other' ? 'every 2 weeks' : 'every week';
  if (time) {
    const hh = String(time.h).padStart(2, '0');
    const mm = String(time.m).padStart(2, '0');
    return `${body} at ${hh}:${mm}`;
  }
  return body;
}
