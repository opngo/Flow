import { create } from 'zustand';
import { addDays, format } from 'date-fns';
import type {
  Category, CollectionKey, DB, Deck, FlashCard, Goal, Habit, HabitLog, Mark, Note,
  NotificationRecord, Reminder, Settings, SoundMix, Subject, Timer, Todo, FocusSession,
  CalendarEvent, GradeCategory,
} from './lib/types';
import { DBSchema, FocusEngineSchema, SCHEMA_VERSION, FocusSessionSchema, NotificationRecordSchema } from './lib/types';
import type { z } from 'zod';

/** Input shapes: fields with schema defaults stay optional at construction. */
export type NotificationInput = Omit<z.input<typeof NotificationRecordSchema>, 'id' | 'at' | 'read'> & { at?: string };
export type SessionInput = Omit<z.input<typeof FocusSessionSchema>, 'id'>;
import { repo, debounce } from './lib/repo';
import { seedDB } from './lib/seed';
import { mergeDemo, stripDemo } from './lib/demo';
import { nowISO, uuid } from './lib/utils';
import { spawnNextTodo } from './lib/habits';
import { escalatingOverdueTimes, todoReminderTimes } from './lib/scheduler';
import { parseQuickAdd } from './lib/nlp';

export type Toast = { id: string; title: string; body?: string; tone?: 'default' | 'success' | 'warning' | 'danger'; route?: string; actions?: Array<{ label: string; run: () => void }> };

type TimerProfile = Settings['timerProfiles'][number];

const persist = debounce((db: DB) => { void repo.save(db); }, 350);

export type FlowState = {
  db: DB;
  ready: boolean;
  past: DB[];
  future: DB[];
  init: () => Promise<void>;

  /* low-level ---------------------------------------------------- */
  mutate: (fn: (db: DB) => DB, opts?: { snapshot?: boolean }) => void;
  add: <K extends CollectionKey>(key: K, item: DB[K][number]) => void;
  patch: <K extends CollectionKey>(key: K, id: string, patch: Partial<DB[K][number]>) => void;
  remove: <K extends CollectionKey>(key: K, id: string) => void;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  undo: () => void;
  redo: () => void;
  logActivity: (kind: string, text: string) => void;

  /* todos -------------------------------------------------------- */
  addTodo: (partial: Partial<Todo>) => Todo;
  /** Rebuild the reminder ladder for a task from its due time. */
  syncTodoReminders: (todoId: string) => void;
  updateTodo: (id: string, patch: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  completeTodo: (id: string) => void;
  uncompleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  reorderTodos: (ids: string[]) => void;
  bulkPatch: (ids: string[], patch: Partial<Todo>) => void;
  duplicateTodo: (id: string) => void;
  snoozeTodo: (id: string, minutes: number) => void;
  quickAdd: (text: string, fallback?: Partial<Todo>) => Todo;

  /* habits ------------------------------------------------------- */
  addHabit: (partial: Partial<Habit>) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  checkIn: (habitId: string, date: string, value: number, source?: HabitLog['source']) => void;
  uncheckIn: (habitId: string, date: string) => void;
  skipHabit: (habitId: string, date: string, reason: string) => void;

  /* goals -------------------------------------------------------- */
  addGoal: (partial: Partial<Goal>) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  /* grades ------------------------------------------------------- */
  addSubject: (partial: Partial<Subject>) => void;
  updateSubject: (id: string, patch: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  duplicateSubject: (id: string) => void;
  addMark: (partial: Partial<Mark>) => void;
  updateMark: (id: string, patch: Partial<Mark>) => void;
  deleteMark: (id: string) => void;
  bulkAddMarks: (marks: Partial<Mark>[]) => void;
  normalizeWeights: (subjectId: string) => void;

  /* sessions ----------------------------------------------------- */
  logSession: (session: SessionInput) => void;
  updateSession: (id: string, patch: Partial<FocusSession>) => void;
  deleteSession: (id: string) => void;

  /* timers ------------------------------------------------------- */
  focus: () => NonNullable<DB['focus']>;
  /** Attach a task/subject/mix to the current (possibly idle) focus engine. */
  patchFocus: (patch: Partial<NonNullable<DB['focus']>>) => void;
  startFocus: (opts?: { todoId?: string; subjectId?: string; categoryId?: string; mixId?: string; profileId?: string }) => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  resetFocus: () => void;
  skipPhase: () => void;
  extendFocus: (min: number) => void;
  bumpDistraction: () => void;
  finishPhase: (opts?: { rating?: number; note?: string; distractions?: number }) => void;
  startTimer: (partial: Partial<Timer>) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  stopTimer: (id: string) => void;
  finishTimer: (id: string) => void;
  addLap: (id: string) => void;
  removeTimer: (id: string) => void;
  tick: () => void;

  /* notifications ------------------------------------------------ */
  notify: (n: NotificationInput) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  addReminder: (r: Partial<Reminder>) => void;
  deliverReminder: (id: string, missed?: boolean) => void;
  snoozeReminder: (id: string, minutes: number) => void;
  deleteReminder: (id: string) => void;

  addProject: (name: string) => void;
  updateProject: (id: string, patch: Partial<import('./lib/types').Project>) => void;
  deleteProject: (id: string) => void;

  /* content ------------------------------------------------------ */
  addNote: (partial?: Partial<Note>) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  addDeck: (name: string) => void;
  deleteDeck: (id: string) => void;
  addCard: (deckId: string, front: string, back: string) => void;
  updateCard: (deckId: string, card: FlashCard) => void;
  reviewCard: (deckId: string, cardId: string, quality: 0 | 1 | 2 | 3) => void;
  addEvent: (partial: Partial<CalendarEvent>) => void;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  saveMix: (mix: SoundMix) => void;
  deleteMix: (id: string) => void;

  /* system ------------------------------------------------------- */
  resetAll: () => Promise<void>;
  loadSeed: () => void;
  /** Add the example records without touching settings or tutorial state. */
  loadDemoData: () => number;
  /** Remove only demo records. */
  clearDemoData: () => number;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
};

const emptyDB: DB = DBSchema.parse({ version: SCHEMA_VERSION });

export const useFlow = create<FlowState>((set, get) => ({
  db: emptyDB,
  ready: false,
  past: [],
  future: [],

  async init() {
    const loaded = await repo.load();
    const db = loaded ?? seedDB();
    set({ db, ready: true });
    if (!loaded) void repo.save(db);
  },

  mutate(fn, opts = {}) {
    const { db, past } = get();
    const next = fn(db);
    if (next === db) return;
    next.settings = next.settings ?? db.settings;
    set({
      db: next,
      past: opts.snapshot ? [...past.slice(-24), db] : past,
      future: opts.snapshot ? [] : get().future,
    });
    persist(next);
  },

  add(key, item) {
    get().mutate((db) => ({ ...db, [key]: [...(db[key] as unknown[]), item] }) as DB, { snapshot: true });
  },
  patch(key, id, patch) {
    get().mutate((db) => ({
      ...db,
      [key]: (db[key] as Array<{ id: string }>).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }) as DB, { snapshot: true });
  },
  remove(key, id) {
    get().mutate((db) => ({
      ...db,
      [key]: (db[key] as Array<{ id: string }>).filter((x) => x.id !== id),
    }) as DB, { snapshot: true });
  },

  updateSettings(fn) {
    get().mutate((db) => ({ ...db, settings: fn(db.settings) }), { snapshot: false });
  },

  undo() {
    const { past, db, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ db: prev, past: past.slice(0, -1), future: [db, ...future].slice(0, 25) });
    persist(prev);
  },
  redo() {
    const { future, db, past } = get();
    if (!future.length) return;
    const next = future[0];
    set({ db: next, future: future.slice(1), past: [...past, db] });
    persist(next);
  },

  logActivity(kind, text) {
    get().mutate((db) => ({ ...db, activity: [{ id: uuid(), at: nowISO(), kind, text }, ...db.activity].slice(0, 300) }));
  },

  /* ------------------------------------------------------------ todos */
  addTodo(partial) {
    const todo: Todo = {
      id: uuid(), title: 'New task', notes: '', tags: [], priority: 0, loggedMin: 0,
      status: 'todo', reminders: [], checklist: [], attachments: [],
      createdAt: nowISO(), updatedAt: nowISO(), order: Date.now() % 100000,
      ...partial,
    };
    get().add('todos', todo);
    get().logActivity('todo', `Created "${todo.title}"`);
    if (todo.dueAt) get().syncTodoReminders(todo.id);
    return todo;
  },
  syncTodoReminders(todoId) {
    const todo = get().db.todos.find((t) => t.id === todoId);
    if (!todo) return;
    // Escalating ladder (spec §7): a day before, 2h, 1h, 10m and at the due
    // time, then follow-ups 5, 30 and 120 minutes late until it is completed.
    const pending = todo.dueAt
      ? [...todoReminderTimes(todo.dueAt), ...escalatingOverdueTimes(todo.dueAt)]
      : [];
    const fresh: Reminder[] = pending
      .filter((at) => at.getTime() > Date.now() - 6 * 3600_000)
      .map((at, i) => ({
        id: uuid(),
        targetKind: 'todo',
        targetId: todo.id,
        title: todo.dueAt && at.getTime() <= new Date(todo.dueAt).getTime() ? `Due soon: ${todo.title}` : `Overdue: ${todo.title}`,
        body: todo.notes.slice(0, 120) || 'Created automatically from the due date.',
        fireAt: at.toISOString(),
        delivered: false,
        missed: false,
        actions: ['complete', 'snooze10', 'open'],
        route: '/todos',
        ladder: i,
      }));
    get().mutate((d) => ({
      ...d,
      reminders: [...d.reminders.filter((r) => !(r.targetKind === 'todo' && r.targetId === todo.id && !r.delivered)), ...fresh],
    }));
  },
  updateTodo(id, patch) {
    get().patch('todos', id, { ...patch, updatedAt: nowISO() });
    if ('dueAt' in patch || 'status' in patch) {
      const next = get().db.todos.find((t) => t.id === id);
      if (next) {
        if (next.status === 'done' || next.status === 'archived') {
          // Completed work stops nagging.
          get().mutate((d) => ({ ...d, reminders: d.reminders.filter((r) => !(r.targetKind === 'todo' && r.targetId === id && !r.delivered)) }));
        } else if ('dueAt' in patch) {
          get().syncTodoReminders(id);
        }
      }
    }
  },
  deleteTodo(id) {
    get().remove('todos', id);
  },
  completeTodo(id) {
    const todo = get().db.todos.find((t) => t.id === id);
    if (!todo) return;
    const db = get().db;
    const now = nowISO();
    const next = spawnNextTodo(todo, 'on-complete');
    get().mutate((d) => ({
      ...d,
      todos: [
        ...d.todos.map((t) => (t.id === id ? { ...t, status: 'done' as const, completedAt: now, updatedAt: now } : t)),
        ...(next ? [next] : []),
      ],
      timers: d.timers.map((t) => (t.todoId === id && t.running ? { ...t, running: false, finished: true } : t)),
      // A finished task must stop nagging: drop its undelivered ladder.
      reminders: d.reminders.filter((r) => !(r.targetKind === 'todo' && r.targetId === id && !r.delivered)),
    }), { snapshot: true });
    get().logActivity('todo', `Completed "${todo.title}"`);
    // linked habit auto check-in
    if (todo.subjectId) {
      const today = format(new Date(), 'yyyy-MM-dd');
      for (const h of get().db.habits) {
        if (h.linkedSubjectId === todo.subjectId && h.target.type === 'boolean') {
          const already = get().db.habitLogs.some((l) => l.habitId === h.id && l.date === today && !l.skipped);
          if (!already) get().checkIn(h.id, today, 1, 'auto');
        }
      }
    }
    void db;
  },
  uncompleteTodo(id) {
    get().patch('todos', id, { status: 'todo', completedAt: undefined, updatedAt: nowISO() });
  },
  toggleTodo(id) {
    const t = get().db.todos.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'done') get().uncompleteTodo(id);
    else get().completeTodo(id);
  },
  reorderTodos(ids) {
    get().mutate((db) => ({
      ...db,
      todos: db.todos.map((t) => (ids.includes(t.id) ? { ...t, order: ids.indexOf(t.id) } : t)),
    }));
  },
  bulkPatch(ids, patch) {
    const setIds = new Set(ids);
    get().mutate((db) => ({
      ...db,
      todos: db.todos.map((t) => (setIds.has(t.id) ? { ...t, ...patch, updatedAt: nowISO() } : t)),
    }), { snapshot: true });
  },
  duplicateTodo(id) {
    const t = get().db.todos.find((x) => x.id === id);
    if (!t) return;
    get().addTodo({ ...t, id: uuid(), title: `${t.title} (copy)`, status: 'todo', completedAt: undefined, createdAt: nowISO(), updatedAt: nowISO() });
  },
  snoozeTodo(id, minutes) {
    const t = get().db.todos.find((x) => x.id === id);
    if (!t) return;
    const base = t.dueAt ? new Date(t.dueAt) : new Date();
    const due = new Date(Math.max(Date.now(), base.getTime()) + minutes * 60000);
    get().patch('todos', id, { dueAt: due.toISOString(), updatedAt: nowISO() });
    const label = minutes >= 1440 ? `${Math.round(minutes / 1440)} day` : minutes >= 60 ? `${Math.round(minutes / 60)} hour` : `${minutes} min`;
    get().updateSettings((s) => ({
      ...s,
      notifications: { ...s.notifications },
    }));
    get().notify({ kind: 'system', title: 'Snoozed', body: `${t.title} — reminded in ${label}`, route: '/todos' });
  },
  quickAdd(text, fallback = {}) {
    const { categories, subjects } = get().db;
    const parsed = parseQuickAdd(text, { categories, subjects });
    return get().addTodo({
      title: parsed.title,
      dueAt: parsed.dueAt,
      categoryId: parsed.categoryId ?? fallback.categoryId,
      subjectId: parsed.subjectId ?? fallback.subjectId,
      priority: parsed.priority || (fallback.priority ?? 0),
      estimateMin: parsed.estimateMin,
      tags: parsed.tags,
      status: fallback.status ?? 'todo',
      ...fallback,
    });
  },

  /* ----------------------------------------------------------- habits */
  addHabit(partial) {
    const habit: Habit = {
      id: uuid(), name: 'New habit', icon: 'Sparkles', color: '#57c9a0',
      description: '', schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 7 },
      target: { type: 'boolean', value: 1 }, reminderTimes: [],
      startDate: nowISO(), order: Date.now() % 10000, createdAt: nowISO(),
      ...partial,
    };
    get().add('habits', habit);
    get().logActivity('habit', `Created habit "${habit.name}"`);
  },
  updateHabit(id, patch) { get().patch('habits', id, patch); },
  deleteHabit(id) {
    get().mutate((db) => ({
      ...db,
      habits: db.habits.filter((h) => h.id !== id),
      habitLogs: db.habitLogs.filter((l) => l.habitId !== id),
    }), { snapshot: true });
  },
  checkIn(habitId, date, value, source = 'manual') {
    const habit = get().db.habits.find((h) => h.id === habitId);
    if (!habit) return;
    get().mutate((db) => {
      const existing = db.habitLogs.find((l) => l.habitId === habitId && l.date === date);
      const logs = existing
        ? db.habitLogs.map((l) => (l.id === existing.id ? { ...l, value, skipped: false, source } : l))
        : [...db.habitLogs, { id: uuid(), habitId, date, value, skipped: false, source }];
      return { ...db, habitLogs: logs };
    }, { snapshot: true });
    get().logActivity('habit', `Checked in "${habit.name}"`);
  },
  uncheckIn(habitId, date) {
    get().mutate((db) => ({ ...db, habitLogs: db.habitLogs.filter((l) => !(l.habitId === habitId && l.date === date)) }), { snapshot: true });
  },
  skipHabit(habitId, date, reason) {
    get().mutate((db) => {
      const existing = db.habitLogs.find((l) => l.habitId === habitId && l.date === date);
      const logs = existing
        ? db.habitLogs.map((l) => (l.id === existing.id ? { ...l, skipped: true, reason, value: 0 } : l))
        : [...db.habitLogs, { id: uuid(), habitId, date, value: 0, skipped: true, reason, source: 'manual' as const }];
      return { ...db, habitLogs: logs };
    }, { snapshot: true });
  },

  /* ------------------------------------------------------------ goals */
  addGoal(partial) {
    const goal: Goal = {
      id: uuid(), title: 'New goal', icon: 'Target', color: '#7c8cff', type: 'outcome',
      progressMode: 'manual', manualProgress: 0, milestones: [], status: 'on-track', createdAt: nowISO(),
      ...partial,
    };
    get().add('goals', goal);
  },
  updateGoal(id, patch) { get().patch('goals', id, patch); },
  deleteGoal(id) { get().remove('goals', id); },

  /* ----------------------------------------------------------- grades */
  addSubject(partial) {
    const defaults = ['Assignments', 'Quizzes', 'Tests', 'Exams', 'Projects'];
    const subject: Subject = {
      id: uuid(), name: 'New subject', teacher: '', room: '', term: '', credits: 1,
      icon: 'BookOpen', color: '#7c8cff', scale: 'af', weighting: 'category',
      categories: defaults.map((n, i) => ({ id: uuid(), name: n, weightPct: 20, dropLowest: 0, bestN: 0, color: ['#7c8cff', '#57c9a0', '#f0a75a', '#ef6f6c', '#b18cff'][i] })),
      syllabus: '', notes: '', archived: false, order: get().db.subjects.length,
      ...partial,
    };
    get().add('subjects', subject);
    get().logActivity('grade', `Created subject "${subject.name}"`);
  },
  updateSubject(id, patch) { get().patch('subjects', id, patch); },
  deleteSubject(id) {
    get().mutate((db) => ({
      ...db,
      subjects: db.subjects.filter((s) => s.id !== id),
      marks: db.marks.filter((m) => m.subjectId !== id),
    }), { snapshot: true });
  },
  duplicateSubject(id) {
    const s = get().db.subjects.find((x) => x.id === id);
    if (!s) return;
    get().addSubject({ ...s, id: uuid(), name: `${s.name} (copy)`, order: get().db.subjects.length });
  },
  addMark(partial) {
    const subjectId = partial.subjectId ?? get().db.subjects[0]?.id;
    const subject = get().db.subjects.find((s) => s.id === subjectId);
    const mark: Mark = {
      id: uuid(), subjectId: subjectId ?? '', categoryId: partial.categoryId ?? subject?.categories[0]?.id ?? '',
      title: 'New mark', kind: 'assignment', max: 100, status: 'graded', date: nowISO(), notes: '',
      ...partial,
    } as Mark;
    get().add('marks', mark);
    if (subject) get().logActivity('grade', `Added mark "${mark.title}" to ${subject.name}`);
  },
  updateMark(id, patch) { get().patch('marks', id, patch); },
  deleteMark(id) { get().remove('marks', id); },
  bulkAddMarks(marks) {
    get().mutate((db) => ({
      ...db,
      marks: [...db.marks, ...marks.map((m) => ({
        id: uuid(), subjectId: m.subjectId ?? '', categoryId: m.categoryId ?? '', title: m.title ?? 'Mark',
        kind: m.kind ?? 'assignment', max: m.max ?? 100, status: m.status ?? 'graded',
        date: m.date ?? nowISO(), notes: '', ...m,
      } as Mark))],
    }), { snapshot: true });
  },
  normalizeWeights(subjectId) {
    const subject = get().db.subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    const total = subject.categories.reduce((a, c) => a + c.weightPct, 0) || subject.categories.length;
    const cats: GradeCategory[] = subject.categories.map((c) => ({
      ...c, weightPct: Math.round(((c.weightPct / total) * 100) * 10) / 10,
    }));
    get().updateSubject(subjectId, { categories: cats });
  },

  /* --------------------------------------------------------- sessions */
  logSession(session) {
    const parsed = FocusSessionSchema.parse({ ...session, id: uuid() }) as FocusSession;
    const full: FocusSession = parsed;
    get().add('focusSessions', full);
  },
  updateSession(id, patch) { get().patch('focusSessions', id, patch); },
  deleteSession(id) { get().remove('focusSessions', id); },

  /* ----------------------------------------------------------- timers */
  focus() {
    return get().db.focus ?? FocusEngineSchema.parse({});
  },
  patchFocus(patch) {
    get().mutate((d) => ({ ...d, focus: { ...(d.focus ?? FocusEngineSchema.parse({})), ...patch } as DB['focus'] }));
  },
  startFocus(opts = {}) {
    const db = get().db;
    const profileId = opts.profileId ?? db.settings.activeProfileId;
    const profile = db.settings.timerProfiles.find((p) => p.id === profileId) ?? db.settings.timerProfiles[0];
    const minutes = profile?.focus ?? 25;
    const now = new Date();
    get().mutate((d) => ({
      ...d,
      focus: {
        phase: 'focus', startedAt: now.toISOString(), endsAt: new Date(now.getTime() + minutes * 60000).toISOString(),
        remainingMs: minutes * 60000, running: true, sessionsDone: d.focus?.sessionsDone ?? 0,
        profileId, todoId: opts.todoId, subjectId: opts.subjectId, categoryId: opts.categoryId,
        mixId: opts.mixId ?? profile?.mixId, distractions: 0, planningPrompt: false, notifiedEnd: false,
      },
    }));
  },
  pauseFocus() {
    const f = get().focus();
    if (!f.running || !f.endsAt) return;
    const remaining = Math.max(0, new Date(f.endsAt).getTime() - Date.now());
    get().mutate((d) => ({
      ...d,
      focus: { ...get().focus(), running: false, remainingMs: remaining, endsAt: undefined, startedAt: f.startedAt },
    }));
  },
  resumeFocus() {
    const f = get().focus();
    if (f.running) return;
    const now = new Date();
    get().mutate((d) => ({
      ...d,
      focus: { ...get().focus(), running: true, endsAt: new Date(now.getTime() + f.remainingMs).toISOString(), startedAt: f.startedAt ?? now.toISOString() },
    }));
  },
  resetFocus() {
    const f = get().focus();
    const profile = get().db.settings.timerProfiles.find((p) => p.id === f.profileId);
    const minutes = f.phase === 'focus' ? profile?.focus ?? 25 : f.phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;
    get().mutate((d) => ({ ...d, focus: { ...get().focus(), running: false, endsAt: undefined, startedAt: undefined, remainingMs: minutes * 60000 } }));
  },
  skipPhase() {
    const f = get().focus();
    const profile = get().db.settings.timerProfiles.find((p) => p.id === f.profileId);
    const nextPhase = f.phase === 'focus' ? (f.sessionsDone % (profile?.sessionsBeforeLong ?? 4) === (profile?.sessionsBeforeLong ?? 4) - 1 ? 'long-break' : 'short-break') : 'focus';
    const minutes = nextPhase === 'focus' ? profile?.focus ?? 25 : nextPhase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;
    const autoStart = nextPhase === 'focus' ? profile?.autoStartFocus : profile?.autoStartBreaks;
    const now = new Date();
    get().mutate((d) => ({
      ...d,
      focus: {
        ...get().focus(), phase: nextPhase, remainingMs: minutes * 60000,
        startedAt: autoStart ? now.toISOString() : undefined,
        endsAt: autoStart ? new Date(now.getTime() + minutes * 60000).toISOString() : undefined,
        running: !!autoStart, notifiedEnd: false, distractions: 0,
      },
    }));
  },
  extendFocus(min) {
    const f = get().focus();
    const addMs = min * 60000;
    get().mutate((d) => ({
      ...d,
      focus: {
        ...get().focus(),
        remainingMs: f.running ? f.remainingMs : f.remainingMs + addMs,
        endsAt: f.endsAt ? new Date(new Date(f.endsAt).getTime() + addMs).toISOString() : undefined,
        running: f.running,
        startedAt: f.startedAt ?? new Date().toISOString(),
      },
    }));
  },
  bumpDistraction() {
    const f = get().focus();
    get().mutate((d) => ({ ...d, focus: { ...get().focus(), distractions: f.distractions + 1 } }));
  },
  finishPhase(opts = {}) {
    const f = get().focus();
    const db = get().db;
    const profile = db.settings.timerProfiles.find((p) => p.id === f.profileId);
    const plannedMin = f.phase === 'focus' ? profile?.focus ?? 25 : f.phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;
    let actualMin = plannedMin;
    if (f.startedAt) {
      const started = new Date(f.startedAt).getTime();
      const ended = Date.now();
      actualMin = Math.min(plannedMin * 2, Math.max(0, Math.round((ended - started) / 60000)));
      if (actualMin === 0) actualMin = 1;
    }
    if (f.phase === 'focus') {
      get().logSession({
        startedAt: f.startedAt ?? new Date(Date.now() - plannedMin * 60000).toISOString(),
        endedAt: nowISO(), kind: 'focus', subjectId: f.subjectId, todoId: f.todoId,
        categoryId: f.categoryId, plannedMin, actualMin,
        rating: opts.rating, distractions: opts.distractions ?? f.distractions, note: opts.note ?? '', label: '',
      });
      if (f.todoId) {
        const todo = db.todos.find((t) => t.id === f.todoId);
        if (todo) get().patch('todos', todo.id, { loggedMin: (todo.loggedMin ?? 0) + actualMin });
      }
      // habit auto check-in for duration habits linked to the subject
      const today = format(new Date(), 'yyyy-MM-dd');
      for (const h of db.habits) {
        if (h.target.type !== 'duration') continue;
        const linked = h.linkedSubjectId ? h.linkedSubjectId === f.subjectId : h.schedule.type === 'daily';
        if (!linked) continue;
        const existing = db.habitLogs.find((l) => l.habitId === h.id && l.date === today);
        get().checkIn(h.id, today, (existing?.value ?? 0) + actualMin, 'timer');
      }
      const sessionsDone = f.sessionsDone + 1;
      const isLong = sessionsDone % (profile?.sessionsBeforeLong ?? 4) === 0;
      const nextPhase = isLong ? 'long-break' : 'short-break';
      const minutes = isLong ? profile?.longBreak ?? 15 : profile?.shortBreak ?? 5;
      const autoStart = !!profile?.autoStartBreaks;
      const now = new Date();
      get().mutate((d) => ({
        ...d,
        focus: {
          ...get().focus(), phase: nextPhase, sessionsDone,
          remainingMs: minutes * 60000,
          startedAt: autoStart ? now.toISOString() : undefined,
          endsAt: autoStart ? new Date(now.getTime() + minutes * 60000).toISOString() : undefined,
          running: autoStart, notifiedEnd: false, distractions: 0,
        } as DB['focus'],
      }));
      get().notify({ kind: 'timer', title: 'Focus session complete', body: `${actualMin} min logged${f.subjectId ? '' : ''}. Time for a ${nextPhase === 'long-break' ? 'long ' : ''}break.`, route: '/focus', actions: ['start-timer', 'open'] });
    } else {
      get().logSession({
        startedAt: f.startedAt ?? nowISO(), endedAt: nowISO(), kind: f.phase as 'break' | 'long-break',
        plannedMin, actualMin, categoryId: f.categoryId, label: 'Break',
      });
      const minutes = profile?.focus ?? 25;
      const autoStart = !!profile?.autoStartFocus;
      const now = new Date();
      get().mutate((d) => ({
        ...d,
        focus: {
          ...get().focus(), phase: 'focus', remainingMs: minutes * 60000,
          startedAt: autoStart ? now.toISOString() : undefined,
          endsAt: autoStart ? new Date(now.getTime() + minutes * 60000).toISOString() : undefined,
          running: autoStart, distractions: 0, notifiedEnd: false,
        } as DB['focus'],
      }));
      get().notify({ kind: 'timer', title: 'Break over', body: 'Ready for the next focus block?', route: '/focus', actions: ['start-timer', 'open'] });
    }
    get().logActivity('timer', `Completed a ${f.phase} block (${actualMin} min)`);
  },

  startTimer(partial) {
    const now = new Date();
    const plannedMin = partial.plannedMin ?? 5;
    const timer: Timer = {
      id: uuid(), kind: 'countdown', label: 'Timer', startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + plannedMin * 60000).toISOString(),
      accumulatedMs: 0, plannedMin, rounds: 1, restSec: 30, running: true, laps: [], finished: false,
      notifKind: 'timer',
      ...partial,
    };
    get().add('timers', timer);
  },
  pauseTimer(id) {
    const t = get().db.timers.find((x) => x.id === id);
    if (!t) return;
    const accumulated = t.accumulatedMs + (t.startedAt ? Date.now() - new Date(t.startedAt).getTime() : 0);
    get().patch('timers', id, { running: false, pausedAt: nowISO(), accumulatedMs: accumulated, startedAt: undefined });
  },
  resumeTimer(id) {
    const t = get().db.timers.find((x) => x.id === id);
    if (!t) return;
    const now = new Date();
    const remainingMs = Math.max(0, (t.endsAt ? new Date(t.endsAt).getTime() : 0) - Date.now()) || t.plannedMin * 60000;
    get().patch('timers', id, {
      running: true, pausedAt: undefined, startedAt: now.toISOString(), finished: false,
      endsAt: new Date(now.getTime() + remainingMs).toISOString(),
    });
  },
  finishTimer(id) {
    const t = get().db.timers.find((x) => x.id === id);
    if (!t) return;
    const actualMin = t.kind === 'stopwatch'
      ? Math.max(1, Math.round((t.accumulatedMs + (t.startedAt ? Date.now() - new Date(t.startedAt).getTime() : 0)) / 60000))
      : t.plannedMin;
    get().logSession({
      startedAt: t.startedAt ?? t.pausedAt ?? nowISO(), endedAt: nowISO(),
      kind: t.kind === 'stopwatch' ? 'stopwatch' : 'timer', subjectId: t.subjectId, todoId: t.todoId,
      categoryId: t.categoryId, habitId: t.habitId, plannedMin: t.plannedMin, actualMin, label: t.label,
    });
    if (t.todoId) {
      const todo = get().db.todos.find((x) => x.id === t.todoId);
      if (todo) get().patch('todos', todo.id, { loggedMin: (todo.loggedMin ?? 0) + actualMin });
    }
    if (t.habitId) get().checkIn(t.habitId, format(new Date(), 'yyyy-MM-dd'), actualMin, 'timer');
    get().patch('timers', id, { running: false, finished: true, endsAt: undefined, startedAt: nowISO(), accumulatedMs: actualMin * 60000 });
    get().notify({ kind: 'timer', title: `${t.label} finished`, body: `${actualMin} min logged to your study time.`, route: '/timers' });
    get().logActivity('timer', `Timer "${t.label}" finished (${actualMin} min)`);
  },
  stopTimer(id) { get().finishTimer(id); },
  addLap(id) {
    const t = get().db.timers.find((x) => x.id === id);
    if (!t) return;
    const elapsed = t.accumulatedMs + (t.startedAt ? Date.now() - new Date(t.startedAt).getTime() : 0);
    get().patch('timers', id, { laps: [...t.laps, elapsed] });
  },
  removeTimer(id) { get().remove('timers', id); },
  tick() {
    const db = get().db;
    const now = Date.now();
    let changed = false;
    const timers = db.timers.map((t) => {
      if (!t.running || t.finished) return t;
      if (t.kind === 'countdown' && t.endsAt && now >= new Date(t.endsAt).getTime()) { changed = true; return { ...t, finished: true }; }
      if (t.kind === 'interval' && t.endsAt && now >= new Date(t.endsAt).getTime()) { changed = true; return { ...t, finished: true }; }
      return t;
    });
    const f = db.focus;
    const focusEnded = !!(f && f.running && f.endsAt && now >= new Date(f.endsAt).getTime() && !f.notifiedEnd);
    if (changed) set({ db: { ...db, timers } });
    if (focusEnded) {
      get().mutate((d) => ({ ...d, focus: d.focus ? { ...d.focus, running: false, notifiedEnd: true, remainingMs: 0 } : d.focus }));
      const p = db.settings.timerProfiles.find((x) => x.id === f?.profileId);
      get().notify({
        kind: 'timer',
        title: f?.phase === 'focus' ? 'Focus block finished' : 'Break finished',
        body: f?.phase === 'focus' ? `${p?.focus ?? 25} minutes of focus complete. Log it and take a break.` : 'Break over — back to it.',
        route: '/focus',
        actions: ['start-timer', 'open'],
      });
      get().finishPhase();
    }
  },

  /* ------------------------------------------------------ notifications */
  notify(n) {
    const record: NotificationRecord = {
      missed: false, actions: [], body: '', ...n,
      id: uuid(), at: n.at ?? nowISO(), read: false,
    } as NotificationRecord;
    get().mutate((db) => ({ ...db, notifications: [record, ...db.notifications].slice(0, 200) }));
  },
  markNotificationRead(id) {
    get().patch('notifications', id, { read: true });
  },
  markAllNotificationsRead() {
    get().mutate((db) => ({ ...db, notifications: db.notifications.map((n) => ({ ...n, read: true })) }));
  },
  clearNotifications() {
    get().mutate((db) => ({ ...db, notifications: [] }));
  },
  addReminder(r) {
    const reminder: Reminder = {
      id: uuid(), targetKind: 'todo', title: 'Reminder', body: '', fireAt: nowISO(),
      delivered: false, missed: false, actions: ['open'], ...r,
    } as Reminder;
    get().add('reminders', reminder);
  },
  deliverReminder(id, missed = false) {
    const r = get().db.reminders.find((x) => x.id === id);
    if (!r) return;
    get().patch('reminders', id, { delivered: true, missed });
    get().notify({ kind: r.targetKind, title: r.title, body: r.body, route: r.route, actions: r.actions, missed });
  },
  snoozeReminder(id, minutes) {
    const till = new Date(Date.now() + minutes * 60000).toISOString();
    get().patch('reminders', id, { snoozedUntil: till, delivered: false });
    get().notify({ kind: 'system', title: 'Reminder snoozed', body: `Will fire again in ${minutes} minutes.` });
  },
  deleteReminder(id) { get().remove('reminders', id); },

  /* --------------------------------------------------------- content */
  addProject(name) {
    get().add('projects', { id: uuid(), name, description: '', color: '#7c8cff', icon: 'FolderKanban', archived: false, createdAt: nowISO() });
  },
  updateProject(id, patch) { get().patch('projects', id, patch); },
  deleteProject(id) { get().remove('projects', id); },

  addNote(partial = {}) {
    const note: Note = {
      id: uuid(), title: partial.title ?? 'Untitled', body: partial.body ?? '', folder: partial.folder ?? 'Inbox',
      tags: partial.tags ?? [], pinned: false, journal: partial.journal ?? false, mood: partial.mood,
      createdAt: nowISO(), updatedAt: nowISO(), ...partial,
    };
    get().add('notes', note);
    return note;
  },
  updateNote(id, patch) { get().patch('notes', id, { ...patch, updatedAt: nowISO() }); },
  deleteNote(id) { get().remove('notes', id); },
  addDeck(name) {
    get().add('decks', { id: uuid(), name, cards: [], createdAt: nowISO() });
  },
  deleteDeck(id) { get().remove('decks', id); },
  addCard(deckId, front, back) {
    const deck = get().db.decks.find((d) => d.id === deckId);
    if (!deck) return;
    const card: FlashCard = { id: uuid(), front, back, ease: 2.5, interval: 0, due: format(new Date(), 'yyyy-MM-dd'), reps: 0, lapses: 0 };
    get().patch('decks', deckId, { cards: [...deck.cards, card] });
  },
  updateCard(deckId, card) {
    const deck = get().db.decks.find((d) => d.id === deckId);
    if (!deck) return;
    get().patch('decks', deckId, { cards: deck.cards.map((c) => (c.id === card.id ? card : c)) });
  },
  reviewCard(deckId, cardId, quality) {
    const deck = get().db.decks.find((d) => d.id === deckId);
    const card = deck?.cards.find((c) => c.id === cardId);
    if (!deck || !card) return;
    const ease = Math.max(1.3, card.ease + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02)));
    const interval = quality === 0 ? 0 : card.interval === 0 ? 1 : Math.round(card.interval * ease);
    const next: FlashCard = {
      ...card, ease: Math.round(ease * 100) / 100, interval,
      due: format(addDays(new Date(), Math.max(0, interval)), 'yyyy-MM-dd'),
      reps: card.reps + 1, lapses: card.lapses + (quality === 0 ? 1 : 0),
    };
    get().patch('decks', deckId, { cards: deck.cards.map((c) => (c.id === cardId ? next : c)) });
  },
  addEvent(partial) {
    const start = partial.start ?? nowISO();
    get().add('events', {
      id: uuid(), title: 'New event', start, end: partial.end ?? new Date(new Date(start).getTime() + 3600000).toISOString(),
      allDay: false, color: '#7c8cff', location: '', notes: '', ...partial,
    });
  },
  updateEvent(id, patch) { get().patch('events', id, patch); },
  deleteEvent(id) { get().remove('events', id); },
  saveMix(mix) {
    const exists = get().db.mixes.some((m) => m.id === mix.id);
    if (exists) get().patch('mixes', mix.id, mix);
    else get().add('mixes', mix);
  },
  deleteMix(id) { get().remove('mixes', id); },

  /* ---------------------------------------------------------- system */
  async resetAll() {
    await repo.clear();
    set({ db: seedDB(), past: [], future: [], ready: true });
    persist(get().db);
  },
  loadSeed() {
    const db = seedDB();
    set({ db, past: [], future: [] });
    persist(db);
  },
  loadDemoData() {
    const { db } = get();
    const { db: next, added } = mergeDemo(db);
    set({ db: next, past: [], future: [] });
    persist(next);
    if (added) get().logActivity('demo', `Added ${added} demo records`);
    return added;
  },
  clearDemoData() {
    const { db } = get();
    const { db: next, removed } = stripDemo(db);
    if (!removed) return 0;
    set({ db: next, past: [], future: [] });
    persist(next);
    get().logActivity('demo', `Removed ${removed} demo records`);
    return removed;
  },
  exportJSON() {
    return JSON.stringify(get().db, null, 2);
  },
  importJSON(json) {
    try {
      const parsed = DBSchema.parse(JSON.parse(json));
      set({ db: parsed, past: [], future: [] });
      persist(parsed);
      return true;
    } catch (err) {
      console.error('Flow: import failed', err);
      return false;
    }
  },
}));

/** Selectors ------------------------------------------------------- */
export const useToday = () => format(new Date(), 'yyyy-MM-dd');
export const useUnreadCount = () => useFlow((s) => s.db.notifications.filter((n) => !n.read).length);
export const useSubject = (id?: string) => useFlow((s) => s.db.subjects.find((x) => x.id === id));
export const useActiveTimerLabel = () =>
  useFlow((s) => {
    const f = s.db.focus;
    if (f?.running) return `${f.phase.replace('-', ' ')} running`;
    const t = s.db.timers.find((x) => x.running);
    return t ? `${t.label} running` : 'No active timer';
  });

export type { Timer, Deck, Subject, Mark, Habit, HabitLog, Todo, FocusSession };
