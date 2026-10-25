import { useMemo } from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { Field, Icon, Select, TimeField } from './ui';
import { describeRecurrence } from '../lib/recur';
import { describeRRule } from '../lib/habits';
import { cn } from '../lib/utils';

/**
 * Repeat editor for a todo.
 *
 * Three controls that between them cover the same grammar quick-add accepts:
 * a cadence, the days it lands on, and the time of day it is due. The rule is
 * still a plain RRULE on the todo, so the calendar and the instance spawner do
 * not need to know any of this.
 */

const CADENCES = [
  { value: '', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Every day' },
  { value: 'WEEKDAYS', label: 'Every weekday' },
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks' },
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'YEARLY', label: 'Every year' },
];

const DAYS: Array<{ code: string; label: string }> = [
  { code: 'MO', label: 'M' },
  { code: 'TU', label: 'T' },
  { code: 'WE', label: 'W' },
  { code: 'TH', label: 'T' },
  { code: 'FR', label: 'F' },
  { code: 'SA', label: 'S' },
  { code: 'SU', label: 'S' },
];

type Parsed = {
  cadence: string;
  /** Set for MONTHLY/YEARLY on a day-of-week rule, which the picker cannot show. */
  raw?: string;
  byDay: string[];
  time: string;
};

function readRule(rrule?: string): Parsed {
  if (!rrule) return { cadence: '', byDay: [], time: '' };
  const byDay = rrule.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(',') ?? [];
  const interval = /INTERVAL=2/.test(rrule);
  if (rrule.includes('FREQ=DAILY')) {
    return { cadence: interval ? 'BIWEEKLY' : 'DAILY', byDay, time: '' };
  }
  if (rrule.includes('FREQ=MONTHLY')) return { cadence: 'MONTHLY', byDay, time: '' };
  if (rrule.includes('FREQ=YEARLY')) return { cadence: 'YEARLY', byDay, time: '' };
  if (rrule.includes('FREQ=WEEKLY')) {
    const weekdays = byDay.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => byDay.includes(d));
    if (weekdays && !interval) return { cadence: 'WEEKDAYS', byDay, time: '' };
    return { cadence: interval ? 'BIWEEKLY' : 'WEEKLY', byDay, time: '' };
  }
  // A rule the picker does not model (e.g. BYMONTHDAY): keep it untouched.
  return { cadence: 'CUSTOM', raw: rrule, byDay: [], time: '' };
}

function buildRule(cadence: string, byDay: string[]) {
  if (!cadence) return undefined;
  if (cadence === 'DAILY') return 'FREQ=DAILY';
  if (cadence === 'WEEKDAYS') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (cadence === 'MONTHLY') return 'FREQ=MONTHLY';
  if (cadence === 'YEARLY') return 'FREQ=YEARLY';
  const interval = cadence === 'BIWEEKLY' ? ';INTERVAL=2' : '';
  const days = byDay.length ? `;BYDAY=${byDay.join(',')}` : '';
  return `FREQ=WEEKLY${interval}${days}`;
}

export function RepeatBuilder({ rrule, dueAt, onChange }: {
  rrule?: string;
  dueAt?: string;
  onChange: (next: { rrule?: string; dueAt?: string }) => void;
}) {
  const parsed = useMemo(() => readRule(rrule), [rrule]);
  const time = dueAt ? format(new Date(dueAt), 'HH:mm') : '';

  const setCadence = (cadence: string) => {
    if (cadence === 'CUSTOM') return;
    const byDay = parsed.byDay.length ? parsed.byDay : [];
    onChange({ rrule: buildRule(cadence, byDay) });
  };

  const toggleDay = (code: string) => {
    const next = parsed.byDay.includes(code)
      ? parsed.byDay.filter((d) => d !== code)
      : [...parsed.byDay, code].sort((a, b) => DAYS.findIndex((d) => d.code === a) - DAYS.findIndex((d) => d.code === b));
    // A day pick implies weekly picking, unless a cadence already says otherwise.
    const cadence = ['WEEKLY', 'BIWEEKLY'].includes(parsed.cadence) ? parsed.cadence : 'WEEKLY';
    onChange({ rrule: buildRule(cadence, next) });
  };

  const setTime = (value: string) => {
    const [h, m] = value.split(':').map((n) => parseInt(n, 10));
    const base = dueAt ? new Date(dueAt) : new Date();
    const next = setMinutes(setHours(base, Number.isFinite(h) ? h : 23), Number.isFinite(m) ? m : 59);
    onChange({ rrule, dueAt: next.toISOString() });
  };

  const weeklyish = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(parsed.cadence);

  return (
    <div>
      <div className="label mb-1.5">Repeat</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={parsed.cadence} onChange={setCadence} options={CADENCES} />
        <TimeField value={time} onChange={setTime} label="Time of day" />
      </div>

      {weeklyish && (
        <div className="mt-2 flex items-center gap-1">
          {DAYS.map((d) => {
            const on = parsed.byDay.includes(d.code);
            return (
              <button
                key={d.code}
                onClick={() => toggleDay(d.code)}
                aria-pressed={on}
                aria-label={`Repeat on ${d.code}`}
                data-tip={`Repeat on ${d.code}`}
                className={cn('focusable h-7 w-7 rounded-[8px] text-[11.5px] transition-colors', on ? 'text-accent' : 'bg-s1 text-faint hover:bg-s2 hover:text-muted')}
                style={on ? { background: 'var(--accent-soft)' } : undefined}
              >{d.label}</button>
            );
          })}
          <span className="ml-1 text-[11px] text-faint">{parsed.byDay.length ? '' : 'no day set — repeats weekly'}</span>
        </div>
      )}

      {rrule && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-faint">
          <Icon name="Repeat" size={11} className="shrink-0" />
          <span className="whitespace-nowrap">
            {parsed.cadence === 'CUSTOM'
              ? describeRRule(parsed.raw)
              : describeRecurrence({ rrule, matched: '', auto: false })}
          </span>
          {time && <span aria-hidden className="text-faint">·</span>}
          {time && <span className="num whitespace-nowrap">{time}</span>}
          <span className="whitespace-nowrap">· next instance appears on completion</span>
        </div>
      )}
    </div>
  );
}
