import { format, isSameDay, isToday, isTomorrow, isYesterday, differenceInMinutes, startOfWeek, addDays, parseISO } from 'date-fns';
import clsx, { type ClassValue } from 'clsx';

export const cn = (...c: ClassValue[]) => clsx(c);
export const uuid = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const nowISO = () => new Date().toISOString();
export const iso = (d: Date) => d.toISOString();

export function fmtDate(d?: string | Date, pattern = 'MMM d') {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern);
}

export function fmtDateTime(d?: string) {
  if (!d) return '—';
  return fmtDate(d, 'MMM d, h:mm a');
}

export function fmtTime(d?: string) {
  if (!d) return '';
  return fmtDate(d, 'h:mm a');
}

export function dayKey(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return format(date, 'yyyy-MM-dd');
}

export function relDay(d?: string) {
  if (!d) return '';
  const date = new Date(d);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  const days = Math.round((date.getTime() - Date.now()) / 86400000);
  if (days > 0 && days < 7) return format(date, 'EEEE');
  return format(date, 'MMM d');
}

export function minsToHM(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function minsToClock(min: number) {
  const total = Math.max(0, Math.round(min * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type DueState = 'none' | 'upcoming' | 'today' | 'soon' | 'overdue';
export function dueState(dueAt?: string): DueState {
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  const diff = due - Date.now();
  if (diff < 0) return 'overdue';
  if (diff <= 2 * 3600 * 1000) return 'soon';
  if (isToday(new Date(due))) return 'today';
  return 'upcoming';
}

export const dueTint: Record<DueState, string> = {
  none: 'text-faint',
  upcoming: 'text-muted',
  today: 'text-warning',
  soon: 'text-warning',
  overdue: 'text-danger',
};

export function weekDays(weekStart: number, ref = new Date()) {
  const start = startOfWeek(ref, { weekStartsOn: weekStart as 0 | 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function timeAgo(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return format(date, 'MMM d');
}

export function parseLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function toLocalInput(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function csvEscape(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Record<string, unknown>[], headers?: string[]) {
  if (!rows.length) return '';
  const cols = headers ?? Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\n');
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

export function durationBetween(a: string, b: string) {
  return Math.max(0, differenceInMinutes(parseISO(b), parseISO(a)));
}

export function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

export function isSame(a: string, b: string) {
  return isSameDay(new Date(a), new Date(b));
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = (p: number, q: number) => Math.round(p + (q - p) * t);
  return `#${[c(x.r, y.r), c(x.g, y.g), c(x.b, y.b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/* Countdown colour drift ------------------------------------------------ */

/**
 * How far a countdown has drifted toward its warning colour.
 *
 * Nothing happens until the clock enters the last `windowPct` percent of the
 * block, then it eases in on a curve so the change is felt rather than watched.
 */
export function endDrift(remaining: number, total: number, windowPct: number): number {
  if (total <= 0 || windowPct <= 0) return 0;
  const threshold = (total * windowPct) / 100;
  if (remaining >= threshold) return 0;
  const raw = 1 - remaining / threshold;
  return Math.pow(Math.min(1, Math.max(0, raw)), 1.6);
}
