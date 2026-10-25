import { addDays, format, nextDay, parseISO, startOfDay } from 'date-fns';
import type { Category, Habit, Subject } from './types';
import { parseClockInput } from './utils';

/**
 * Braced commands.
 *
 * Anything typed as `{key:value}` is pulled out of the text before the natural
 * language pass runs, so a line can be precise where it wants to be and loose
 * everywhere else:
 *
 *   `{type:habit} Read every night {target:25} {repeat:daily}`
 *   `{name:Chemistry unit test} {type:event} {date:28 oct} {time:10:00} {place:B-214}`
 *   `{type:mark} Chem quiz {score:18} {out-of:20} {subject:Chemistry}`
 *
 * Every key declares where its value lands, which is what the capture dialog
 * shows back to the writer.
 */

export type CommandKind = 'text' | 'date' | 'time' | 'number' | 'enum' | 'entity';

export type CommandKey = {
  key: string;
  aliases?: string[];
  label: string;
  /** Where the value goes, in the writer's words. */
  lands: string;
  icon: string;
  placeholder: string;
  kind: CommandKind;
  values?: (ctx: CommandContext) => string[];
};

export type CommandContext = {
  categories: Category[];
  subjects: Subject[];
  habits: Habit[];
  projects?: Array<{ id: string; name: string }>;
  decks?: Array<{ id: string; name: string }>;
};

const WEEKDAY_SUGGESTIONS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const COMMAND_KEYS: CommandKey[] = [
  {
    key: 'name', aliases: ['title', 'task'], label: 'Name', lands: 'the title',
    icon: 'Type', placeholder: 'what it is', kind: 'text',
  },
  {
    key: 'type', label: 'Type', lands: 'which record gets created',
    icon: 'Shapes', placeholder: 'task, habit, note, event, mark…', kind: 'enum',
    values: () => ['task', 'habit', 'note', 'event', 'mark', 'focus', 'timer'],
  },
  {
    key: 'date', aliases: ['day', 'due'], label: 'Date', lands: 'the day it is due or happens',
    icon: 'CalendarDays', placeholder: 'today, tomorrow, friday, 28 oct, 2026-10-28', kind: 'date',
    values: () => ['today', 'tomorrow', 'monday', 'friday', 'next monday', 'in 3 days', 'next week'],
  },
  {
    key: 'time', aliases: ['at', 'clock'], label: 'Time', lands: 'the clock time',
    icon: 'Clock', placeholder: '1830, 18:30, 6pm', kind: 'time',
    values: () => ['08:00', '09:00', '12:00', '14:00', '17:00', '18:00', '20:00'],
  },
  {
    key: 'when', label: 'When', lands: 'date and time together',
    icon: 'CalendarClock', placeholder: 'tomorrow 9am, friday 1730', kind: 'date',
    values: () => ['today 18:00', 'tomorrow 09:00', 'friday 17:00', 'next monday 08:00'],
  },
  {
    key: 'repeat', aliases: ['every', 'rrule'], label: 'Repeat', lands: 'the repeat rule',
    icon: 'Repeat', placeholder: 'daily, every monday, biweekly, monthly', kind: 'text',
    values: () => ['daily', 'weekdays', 'every monday', 'every other wednesday', 'monthly'],
  },
  {
    key: 'priority', aliases: ['prio'], label: 'Priority', lands: 'the priority flag',
    icon: 'Flag', placeholder: 'low, medium, high, urgent', kind: 'enum',
    values: () => ['low', 'medium', 'high', 'urgent'],
  },
  {
    key: 'estimate', aliases: ['effort'], label: 'Estimate', lands: 'the time estimate',
    icon: 'Hourglass', placeholder: '30m, 2h', kind: 'text',
    values: () => ['15m', '30m', '45m', '1h', '2h'],
  },
  {
    key: 'subject', label: 'Subject', lands: 'the subject it belongs to',
    icon: 'GraduationCap', placeholder: 'Chemistry', kind: 'entity',
    values: (ctx) => ctx.subjects.map((s) => s.name),
  },
  {
    key: 'category', aliases: ['cat'], label: 'Category', lands: 'the category it belongs to',
    icon: 'Folder', placeholder: 'School', kind: 'entity',
    values: (ctx) => ctx.categories.map((c) => c.name),
  },
  {
    key: 'tag', aliases: ['tags'], label: 'Tag', lands: 'a tag on the record',
    icon: 'Tag', placeholder: 'deep-work', kind: 'text',
  },
  {
    key: 'project', label: 'Project', lands: 'the project it belongs to',
    icon: 'FolderKanban', placeholder: 'Portfolio site', kind: 'entity',
    values: (ctx) => (ctx.projects ?? []).map((p) => p.name),
  },
  {
    key: 'habit', label: 'Habit', lands: 'which habit to check in',
    icon: 'Flame', placeholder: 'Read 30 minutes', kind: 'entity',
    values: (ctx) => ctx.habits.map((h) => h.name),
  },
  {
    key: 'target', aliases: ['goal', 'value'], label: 'Target', lands: 'how much counts as done',
    icon: 'Target', placeholder: '25, 3, 1', kind: 'number',
  },
  {
    key: 'body', aliases: ['note-text'], label: 'Body', lands: 'the note body',
    icon: 'NotebookPen', placeholder: 'the first line of the note', kind: 'text',
  },
  {
    key: 'folder', label: 'Folder', lands: 'the notebook folder',
    icon: 'FolderTree', placeholder: 'School, Work, Journal', kind: 'text',
    values: () => ['Inbox', 'School', 'Work', 'Journal'],
  },
  {
    key: 'score', aliases: ['mark'], label: 'Score', lands: 'the mark you got',
    icon: 'Percent', placeholder: '18', kind: 'number',
  },
  {
    key: 'out-of', aliases: ['max', 'of'], label: 'Out of', lands: 'the mark total',
    icon: 'Divide', placeholder: '20', kind: 'number',
  },
  {
    key: 'place', aliases: ['location', 'where'], label: 'Place', lands: 'the event location',
    icon: 'MapPin', placeholder: 'B-214, or a link', kind: 'text',
  },
  {
    key: 'for', aliases: ['duration'], label: 'Duration', lands: 'how long a focus block or timer runs',
    icon: 'Timer', placeholder: '25m, 50m', kind: 'text',
    values: () => ['5m', '15m', '25m', '50m', '90m'],
  },
  {
    key: 'label', label: 'Label', lands: 'the timer label',
    icon: 'Tag', placeholder: 'Tea, Deep work', kind: 'text',
  },
  {
    key: 'remind', aliases: ['alarm'], label: 'Remind', lands: 'how long before the due time to warn',
    icon: 'AlarmClock', placeholder: '10m, 1h', kind: 'text',
    values: () => ['5m', '10m', '30m', '1h', '1 day'],
  },
  {
    key: 'colour', aliases: ['color'], label: 'Colour', lands: 'the record colour',
    icon: 'Palette', placeholder: '#7c8cff', kind: 'text',
  },
  {
    key: 'deck', label: 'Deck', lands: 'the flashcard deck',
    icon: 'Layers', placeholder: 'Chemistry — bonding', kind: 'entity',
    values: (ctx) => (ctx.decks ?? []).map((d) => d.name),
  },
];

const byKey = new Map<string, CommandKey>();
for (const k of COMMAND_KEYS) {
  byKey.set(k.key, k);
  for (const a of k.aliases ?? []) byKey.set(a, k);
}

export const commandKey = (name: string) => byKey.get(name.trim().toLowerCase());

/** `{key:value}` anywhere in a line. Values may contain spaces. */
const TOKEN = /\{([a-z-]+)\s*:\s*([^}]*)\}/gi;

export type CommandTarget = 'task' | 'habit' | 'note' | 'event' | 'mark' | 'focus' | 'timer';

export type ParsedCommand = {
  /** The line with every token removed. */
  text: string;
  fields: Record<string, string>;
  target: CommandTarget;
  name?: string;
  date?: string;
  time?: string;
  dueAt?: string;
  tokens: Array<{ key: string; value: string; label: string; lands: string; icon: string }>;
};

const DATE_WORDS = /^(today|tomorrow|yesterday|in \d+ days?|next week|next month|next \w+|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2} \w+|\d{1,2}\/\d{1,2})$/i;

/** A forgiving date reader for `{date:…}`: words first, then ISO, then `28 oct`. */
export function readDate(raw: string, from = new Date()): string | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;
  const base = startOfDay(from);
  if (text === 'today') return format(base, 'yyyy-MM-dd');
  if (text === 'tomorrow') return format(addDays(base, 1), 'yyyy-MM-dd');
  if (text === 'yesterday') return format(addDays(base, -1), 'yyyy-MM-dd');
  if (text === 'next week') return format(addDays(base, 7), 'yyyy-MM-dd');
  if (text === 'next month') return format(addDays(base, 30), 'yyyy-MM-dd');
  const inDays = text.match(/^in (\d+) days?$/);
  if (inDays) return format(addDays(base, Number(inDays[1])), 'yyyy-MM-dd');
  const weekday = text.replace(/^next /, '');
  const index = WEEKDAY_SUGGESTIONS.findIndex((d) => d === weekday || d.startsWith(weekday.slice(0, 3)));
  if (index >= 0) {
    /* The list runs Monday-first, `nextDay` wants Sunday = 0. Getting that
       mapping wrong put every weekday one day early. */
    const day = ((index + 1) % 7) as 0;
    const target = text.startsWith('next ') ? nextDay(base, day) : nextDay(addDays(base, -1), day);
    return format(target, 'yyyy-MM-dd');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d = parseISO(text);
    return Number.isNaN(d.getTime()) ? undefined : format(d, 'yyyy-MM-dd');
  }
  const dayMonth = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})$/);
  if (dayMonth) {
    const month = new Date(`${dayMonth[2]} 1, ${from.getFullYear()}`).getMonth();
    if (!Number.isNaN(month)) {
      const d = new Date(from.getFullYear(), month, Number(dayMonth[1]));
      return format(d < base ? new Date(from.getFullYear() + 1, month, Number(dayMonth[1])) : d, 'yyyy-MM-dd');
    }
  }
  /* `10/28` is month then day, the way it is written on this side of the
     Atlantic; a date already gone rolls to the same day next year. */
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const d = new Date(from.getFullYear(), Number(slash[1]) - 1, Number(slash[2]));
    return format(d < base ? new Date(from.getFullYear() + 1, Number(slash[1]) - 1, Number(slash[2])) : d, 'yyyy-MM-dd');
  }
  return undefined;
}

/** `tomorrow 9am`, `friday 1730` — a date and a clock in one value. */
export function readWhen(raw: string, from = new Date()): { date?: string; time?: string } {
  const text = raw.trim();
  const clock = text.match(/(\d{1,2}(?::\d{2})?(?:\s?(?:am|pm))?|\d{3,4})\s*$/i);
  if (!clock) return { date: readDate(text, from) };
  const time = parseClockInput(clock[1]);
  const rest = text.slice(0, text.length - clock[0].length).trim();
  return { date: rest ? readDate(rest, from) : readDate('today', from), time: time ?? undefined };
}

export function parseCommands(input: string, ctx: CommandContext, from = new Date()): ParsedCommand {
  const fields: Record<string, string> = {};
  const tokens: ParsedCommand['tokens'] = [];
  let text = input;

  text = text.replace(TOKEN, (whole, rawKey: string, rawValue: string) => {
    const def = commandKey(rawKey);
    const value = rawValue.trim();
    if (!def) return whole;
    /* An empty value is a placeholder someone has not filled in yet: it leaves
       the line (so it never ends up in a title) and simply sets nothing. */
    if (!value) return ' ';
    fields[def.key] = value;
    tokens.push({ key: def.key, value, label: def.label, lands: def.lands, icon: def.icon });
    return ' ';
  });
  text = text.replace(/\s{2,}/g, ' ').trim();

  const target = (fields.type as CommandTarget | undefined) ?? 'task';
  const name = fields.name?.trim() || (target === 'note' ? undefined : text) || undefined;

  let date = fields.date ? readDate(fields.date, from) : undefined;
  let time = fields.time ? parseClockInput(fields.time) ?? undefined : undefined;
  if (fields.when) {
    const when = readWhen(fields.when, from);
    date = when.date ?? date;
    time = when.time ?? time;
  }
  if (!date && fields.date) date = undefined;
  const dueAt = date ? `${date}T${time ?? '09:00'}:00` : undefined;

  return {
    text: text || name || '',
    fields,
    target,
    name,
    date,
    time,
    dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    tokens,
  };
}

/** Where the caret sits inside an unfinished `{…` token, if it does. */
export function activeToken(text: string, caret = text.length) {
  // Only look behind the caret: `{date:}` with the caret inside its braces is
  // still being written, even though a closing brace already follows it.
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const start = before.lastIndexOf('{');
  if (start < 0) return null;
  if (before.indexOf('}', start) >= 0) return null;
  const body = before.slice(start + 1);
  const colon = body.indexOf(':');
  return {
    start,
    body,
    key: colon >= 0 ? body.slice(0, colon).trim().toLowerCase() : body.trim().toLowerCase(),
    value: colon >= 0 ? body.slice(colon + 1) : null,
  };
}

export type Suggestion = {
  label: string;
  hint: string;
  icon: string;
  /** Full replacement text for the unfinished token, including braces. */
  insert: string;
};

/** Keys, then values for the key being typed. Empty list closes the panel. */
export function suggestionsFor(text: string, ctx: CommandContext, caret = text.length): Suggestion[] {
  const active = activeToken(text, caret);
  if (!active) return [];

  if (active.value === null) {
    // Still typing the key.
    return COMMAND_KEYS
      .filter((k) => !active.key || k.key.startsWith(active.key) || (k.aliases ?? []).some((a) => a.startsWith(active.key)))
      .map((k) => ({
        label: k.key,
        hint: `${k.lands} · ${k.placeholder}`,
        icon: k.icon,
        insert: `{${k.key}:}`,
      }));
  }

  const def = commandKey(active.key);
  const typed = active.value.trim().toLowerCase();
  if (!def) return [];
  if (!def.values) return [];
  return def.values(ctx)
    .filter((v) => !typed || v.toLowerCase().includes(typed))
    .map((v) => ({
      label: v,
      hint: def.lands,
      icon: def.icon,
      insert: `{${def.key}:${v}}`,
    }));
}

/**
 * Replace the unfinished token with a finished one.
 *
 * `{date:}` is a key with no value yet, so the closing brace is dropped and the
 * caret lands inside the braces: the value suggestions for that key are already
 * on screen and you can type straight into them. A full `{date:tomorrow}` puts
 * the caret after the token, ready for the next word.
 */
export function applySuggestion(text: string, insert: string, caret = text.length): { text: string; caret: number } {
  const active = activeToken(text, caret);
  if (!active) {
    // No token open: append. A key with no value keeps the caret inside the
    // braces, same as picking one from the list does.
    const keepOpen = insert.endsWith(':}');
    return {
      text: text + insert,
      caret: text.length + insert.length - (keepOpen ? 1 : 0),
    };
  }
  const before = text.slice(0, active.start);
  const tokenEnd = active.start + 1 + active.body.length;
  // Skip the closing brace when the caret was sitting inside a complete token.
  const after = text[tokenEnd] === '}' ? text.slice(tokenEnd + 1) : text.slice(tokenEnd);
  const keepOpen = insert.endsWith(':}');
  const completed = keepOpen ? insert.slice(0, -1) : insert;
  return { text: `${before}${completed}${after}`, caret: before.length + completed.length };
}

/** A one-line summary of the last token, for the hint under the field. */
export function describeTokens(tokens: ParsedCommand['tokens']) {
  return tokens.map((t) => `${t.label} · ${t.value}`).join('  ');
}
