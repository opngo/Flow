import { describe, expect, it } from 'vitest';
import { DEMO_COLLECTIONS, DEMO_PREFIX, countDemoItems, demoDataset, exampleIds, mergeDemo, stripDemo } from '../src/lib/demo';
import { DBSchema, type DB } from '../src/lib/types';
import { seedDB } from '../src/lib/seed';

/** A user database with one real todo, a customised settings block and the
 *  tutorial already completed — the three things demo data must never touch. */
function userDB(): DB {
  const base = seedDB();
  return DBSchema.parse({
    ...base,
    todos: [
      { ...base.todos[0], id: 'user-todo-1', title: 'My own task' },
    ],
    notes: [],
    marks: [],
    habitLogs: [],
    focusSessions: [],
    settings: {
      ...base.settings,
      onboardingComplete: true,
      enabledTools: ['unit-converter'],
      theme: { ...base.settings.theme, accent: '#ff8800', preset: 'graphite', radius: 4, corners: 'sharp' },
      behavior: { ...base.settings.behavior, weekStart: 0, hotkeys: { quickAdd: 'X' } },
      backdrop: { effect: 'dither', intensity: 0.9, speed: 2, pixel: 8, inFullscreen: false },
    },
  });
}

describe('demo dataset', () => {
  it('namespaces every record and keeps references pointing inside the set', () => {
    const demo = demoDataset();
    for (const key of DEMO_COLLECTIONS) {
      for (const item of demo[key] as Array<{ id: string }>) {
        expect(item.id.startsWith(DEMO_PREFIX)).toBe(true);
      }
    }
    const catIds = new Set(demo.categories.map((c) => c.id));
    for (const todo of demo.todos) {
      if (todo.categoryId) expect(catIds.has(todo.categoryId)).toBe(true);
    }
    const subjectIds = new Set(demo.subjects.map((s) => s.id));
    for (const mark of demo.marks) {
      if (mark.subjectId) expect(subjectIds.has(mark.subjectId)).toBe(true);
    }
  });

  it('does not ship reminders or notifications, so nothing fires on load', () => {
    const demo = demoDataset();
    expect(demo.reminders).toHaveLength(0);
    expect(demo.notifications).toHaveLength(0);
    expect(demo.timers.every((t) => !t.running)).toBe(true);
  });

  it('is deterministic across calls', () => {
    expect(demoDataset().todos.map((t) => t.id)).toEqual(demoDataset().todos.map((t) => t.id));
  });
});

/** Counts only the namespaced demo records, without the shipped example set. */
const demoOnly = (db: DB) => DEMO_COLLECTIONS.reduce(
  (n, key) => n + (db[key] as Array<{ id: string }>).filter((i) => i.id.startsWith(DEMO_PREFIX)).length, 0,
);

/** A database that holds nothing but records the user made: no demo ids and no
 *  ids from the example set that ships with a new install. */
function pureUserDB(): DB {
  const base = seedDB();
  const keep = <T extends { id: string }>(items: T[]) => items.filter((i) => !i.id.startsWith(DEMO_PREFIX) && !exampleIds().has(i.id));
  return DBSchema.parse({
    ...base,
    categories: [{ ...base.categories[0], id: 'user-cat-1', name: 'Mine' }],
    todos: [{ ...base.todos[0], id: 'user-todo-1', title: 'My own task', categoryId: 'user-cat-1' }],
    habits: keep(base.habits),
    habitLogs: [],
    goals: keep(base.goals),
    subjects: keep(base.subjects),
    marks: [],
    focusSessions: [],
    notes: [],
    decks: keep(base.decks),
    events: keep(base.events),
    mixes: keep(base.mixes),
    projects: keep(base.projects),
  });
}

describe('mergeDemo', () => {
  it('adds records without touching settings or tutorial state', () => {
    const before = userDB();
    const { db, added } = mergeDemo(before);

    expect(added).toBeGreaterThan(20);
    expect(demoOnly(db)).toBe(added);
    expect(db.todos.length).toBe(before.todos.length + demoDataset().todos.length);

    expect(db.settings).toEqual(before.settings);
    expect(db.settings.onboardingComplete).toBe(true);
    expect(db.settings.enabledTools).toEqual(['unit-converter']);
    expect(db.settings.theme.corners).toBe('sharp');
    expect(db.settings.backdrop.effect).toBe('dither');
    expect(db.settings.behavior.hotkeys).toEqual({ quickAdd: 'X' });
  });

  it('keeps the user’s own records intact', () => {
    const { db } = mergeDemo(userDB());
    const mine = db.todos.find((t) => t.id === 'user-todo-1');
    expect(mine?.title).toBe('My own task');
  });

  it('records when the demo set was added', () => {
    const { db } = mergeDemo(userDB());
    expect(db.demo?.count).toBe(countDemoItems(db));
    expect(Number.isNaN(new Date(db.demo!.loadedAt).getTime())).toBe(false);
  });

  it('is idempotent', () => {
    const once = mergeDemo(userDB()).db;
    const twice = mergeDemo(once);
    expect(twice.added).toBe(0);
    expect(countDemoItems(twice.db)).toBe(countDemoItems(once));
    expect(twice.db.todos).toHaveLength(once.todos.length);
  });

  it('leaves the running focus engine alone', () => {
    const base = userDB();
    const running = DBSchema.parse({
      ...base,
      focus: { ...base.focus, running: true, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 6e5).toISOString() },
    });
    const { db } = mergeDemo(running);
    expect(db.focus?.running).toBe(true);
    expect(db.focus?.endsAt).toBe(running.focus?.endsAt);
  });
});

describe('stripDemo', () => {
  it('removes the demo set and the shipped example records, and nothing else', () => {
    const before = pureUserDB();
    const loaded = mergeDemo(before).db;
    const { db, removed } = stripDemo(loaded);

    expect(removed).toBe(countDemoItems(loaded));
    expect(countDemoItems(db)).toBe(0);
    expect(demoOnly(db)).toBe(0);
    expect(db.demo).toBeUndefined();
    // User-owned records survive; only sample content goes.
    for (const key of DEMO_COLLECTIONS) {
      expect(db[key]).toHaveLength(before[key].length);
    }
    expect(db.todos.map((t) => t.id)).toEqual(['user-todo-1']);
  });

  it('clears the example set that a fresh install carries', () => {
    const fresh = seedDB();
    const { db, removed } = stripDemo(fresh);
    expect(removed).toBeGreaterThan(0);
    expect(db.todos).toHaveLength(0);
    expect(db.notes).toHaveLength(0);
    expect(db.events).toHaveLength(0);
    expect(db.settings).toEqual(fresh.settings);
  });

  it('keeps preferences and the tutorial flag after clearing', () => {
    const loaded = mergeDemo(userDB()).db;
    const { db } = stripDemo(loaded);
    expect(db.settings.theme.accent).toBe('#ff8800');
    expect(db.settings.theme.corners).toBe('sharp');
    expect(db.settings.backdrop.effect).toBe('dither');
    expect(db.settings.onboardingComplete).toBe(true);
    expect(db.settings.enabledTools).toEqual(['unit-converter']);
  });

  it('is a no-op on a database of user records only', () => {
    const before = pureUserDB();
    const { db, removed } = stripDemo(before);
    expect(removed).toBe(0);
    expect(db).toBe(before);
  });
});
