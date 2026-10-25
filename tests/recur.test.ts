import { describe, it, expect } from 'vitest';
import { parseRecurrence, describeRecurrence, firstOccurrence } from '../src/lib/recur';

const cases: Array<[string, string, string]> = [
  ['Read every Monday at 18:00', 'Read', 'FREQ=WEEKLY;BYDAY=MO'],
  ['Gym every other Wednesday at 1730', 'Gym', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'],
  ['Standup on friday at 0930', 'Standup', 'FREQ=WEEKLY;BYDAY=FR'],
  ['Stretch every day at 07:15', 'Stretch', 'FREQ=DAILY'],
  ['Review biweekly at 18', 'Review', 'FREQ=WEEKLY;INTERVAL=2'],
  ['Water plants every other day', 'Water plants', 'FREQ=DAILY;INTERVAL=2'],
  ['Lab prep every weekday at 08:00', 'Lab prep', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ['Call mum every sunday at 1900', 'Call mum', 'FREQ=WEEKLY;BYDAY=SU'],
];

describe('recurrence grammar', () => {
  for (const [input, title, rrule] of cases) {
    it(input, () => {
      const { text, recurrence } = parseRecurrence(input);
      expect(recurrence?.rrule).toBe(rrule);
      expect(text.trim()).toBe(title);
    });
  }

  it('reads military times, colon times and 12-hour times', () => {
    expect(parseRecurrence('Read every monday at 1800').recurrence?.time).toEqual({ h: 18, m: 0 });
    expect(parseRecurrence('Read every monday at 18:30').recurrence?.time).toEqual({ h: 18, m: 30 });
    expect(parseRecurrence('Read every monday at 6pm').recurrence?.time).toEqual({ h: 18, m: 0 });
    expect(parseRecurrence('Read every monday at 9:05 am').recurrence?.time).toEqual({ h: 9, m: 5 });
  });

  it('only takes a bare hour when #auto standardises it', () => {
    expect(parseRecurrence('Read every monday at 6').recurrence?.time).toBeUndefined();
    const auto = parseRecurrence('Read every monday at 6 #auto');
    expect(auto.recurrence?.time).toEqual({ h: 6, m: 0 });
    expect(auto.recurrence?.auto).toBe(true);
    expect(auto.text).not.toMatch(/#auto/);
  });

  it('leaves ordinary text alone', () => {
    expect(parseRecurrence('Buy milk on the way home').recurrence).toBeUndefined();
    expect(parseRecurrence('Read chapter 4').recurrence).toBeUndefined();
  });

  it('describes itself', () => {
    const r = parseRecurrence('Gym every other Wednesday at 1730').recurrence;
    expect(describeRecurrence(r)).toBe('every other Wednesday at 17:30');
  });

  it('computes the first occurrence at the stated time', () => {
    const r = parseRecurrence('Read every monday at 18:00').recurrence!;
    const d = firstOccurrence(r.rrule, r.time, new Date('2026-10-24T10:00:00'));
    expect(d?.getDay()).toBe(1);
    expect(d?.getHours()).toBe(18);
  });
});
