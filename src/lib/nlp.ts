import { addDays, setHours, setMinutes, startOfDay, nextDay, format, isBefore } from 'date-fns';
import type { Category, Subject } from './types';

export type ParsedTodo = {
  title: string;
  dueAt?: string;
  startAt?: string;
  categoryId?: string;
  subjectId?: string;
  priority: number;
  estimateMin?: number;
  tags: string[];
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

const PRIORITIES: Record<string, number> = {
  low: 1, l: 1, med: 2, medium: 2, m: 2, high: 3, h: 3, urgent: 3, top: 3, p1: 3, p2: 2, p3: 1, p0: 0,
};

/** Token-level natural language quick add.
 *  "Chem lab report friday 5pm #school @chemistry !high ~2h" */
export function parseQuickAdd(input: string, ctx: { categories: Category[]; subjects: Subject[] }): ParsedTodo {
  const tags: string[] = [];
  let categoryId: string | undefined;
  let subjectId: string | undefined;
  let priority = 0;
  let estimateMin: number | undefined;
  let dueDate: Date | undefined;
  let dueTime: { h: number; m: number } | undefined;

  // #category or #tag
  input = input.replace(/(^|\s)#([\w-]+)/g, (_m, pre: string, name: string) => {
    const cat = ctx.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (cat) categoryId = cat.id;
    else tags.push(name.toLowerCase());
    return pre;
  });

  // @subject
  input = input.replace(/(^|\s)@([\w-]+)/g, (_m, pre: string, name: string) => {
    const sub = ctx.subjects.find((s) => s.name.toLowerCase().startsWith(name.toLowerCase()));
    if (sub) subjectId = sub.id;
    else tags.push(name.toLowerCase());
    return pre;
  });

  // !priority
  input = input.replace(/(^|\s)!([\w]+)/g, (_m, pre: string, p: string) => {
    const v = PRIORITIES[p.toLowerCase()];
    if (v !== undefined) priority = v;
    return pre;
  });

  // ~duration
  input = input.replace(/(^|\s)~(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)?/gi, (_m, pre: string, num: string, unit?: string) => {
    const n = parseFloat(num);
    const u = (unit ?? 'm').toLowerCase();
    estimateMin = /^h/.test(u) ? Math.round(n * 60) : Math.round(n);
    return pre;
  });

  // time of day
  input = input.replace(/(^|\s)(at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (_m, pre: string, _at: string, h: string, m: string, ap: string) => {
    let hour = parseInt(h, 10) % 12;
    if (ap.toLowerCase() === 'pm') hour += 12;
    dueTime = { h: hour, m: m ? parseInt(m, 10) : 0 };
    return pre;
  });
  if (!dueTime) {
    input = input.replace(/(^|\s)(at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/g, (_m, pre: string, _at: string, h: string, m: string) => {
      dueTime = { h: parseInt(h, 10), m: parseInt(m, 10) };
      return pre;
    });
  }

  // relative / named dates
  const today = startOfDay(new Date());
  input = input.replace(/(^|\s)(today|tonight|tomorrow|tmrw|next week|eod|end of day|in \d+ days?)\b/gi, (_m, pre: string, word: string) => {
    const w = word.toLowerCase();
    if (w === 'today' || w === 'tonight') dueDate = today;
    else if (w === 'tomorrow' || w === 'tmrw') dueDate = addDays(today, 1);
    else if (w === 'next week') dueDate = addDays(today, 7);
    else if (w === 'eod' || w === 'end of day') { dueDate = today; dueTime = dueTime ?? { h: 17, m: 0 }; }
    else {
      const n = parseInt(w.replace(/\D/g, ''), 10);
      dueDate = addDays(today, n);
    }
    return pre;
  });
  if (!dueDate) {
    input = input.replace(/(^|\s)(next\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/gi, (_m, pre: string, next: string, day: string) => {
      const target = WEEKDAYS[day.toLowerCase()];
      const base = next ? addDays(today, 7) : today;
      dueDate = nextDay(base, target as 0 | 1 | 2 | 3 | 4 | 5 | 6);
      return pre;
    });
  }

  let dueAt: string | undefined;
  if (dueDate) {
    const d = new Date(dueDate);
    if (dueTime) d.setHours(dueTime.h, dueTime.m, 0, 0);
    else d.setHours(23, 59, 0, 0);
    dueAt = d.toISOString();
  } else if (dueTime) {
    const d = new Date();
    d.setHours(dueTime.h, dueTime.m, 0, 0);
    if (isBefore(d, new Date())) d.setDate(d.getDate() + 1);
    dueAt = d.toISOString();
  }

  const title = input.replace(/\s{2,}/g, ' ').replace(/^\s*[-–,]\s*/, '').trim();
  return { title: title || input.trim(), dueAt, categoryId, subjectId, priority, estimateMin, tags };
}

/** `math quiz 18/20` — palette grade quick add. */
export function parseQuickMark(input: string, subjects: Subject[]) {
  const m = input.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const label = m[1].trim();
  const score = parseFloat(m[2]);
  const max = parseFloat(m[3]);
  const sub = subjects.find((s) => label.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
  if (!sub) return null;
  const rest = label.replace(new RegExp(sub.name, 'i'), '').trim();
  const lower = rest.toLowerCase();
  const kind = /quiz/.test(lower) ? 'quiz' : /test/.test(lower) ? 'test' : /exam/.test(lower) ? 'exam' : /lab/.test(lower) ? 'lab' : /project/.test(lower) ? 'project' : 'assignment';
  const catName = { quiz: 'Quizzes', test: 'Tests', exam: 'Exams', lab: 'Assignments', project: 'Projects', assignment: 'Assignments' }[kind];
  const cat = sub.categories.find((c) => c.name === catName) ?? sub.categories[0];
  return { subjectId: sub.id, categoryId: cat?.id, kind, title: rest || `${kind} result`, score, max };
}

export function humanizeISO(d?: string) {
  if (!d) return '';
  return format(new Date(d), "EEE MMM d, h:mm a");
}

export { setHours, setMinutes };
