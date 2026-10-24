import { describe, expect, it } from 'vitest';
import { DEMO_COLLECTIONS, DEMO_PREFIX, countDemoItems, demoDataset, mergeDemo, stripDemo } from '../src/lib/demo';
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

describe('mergeDemo', () => {
  it('adds records without touching settings or tutorial state', () => {
    const before = userDB();
    const { db, added } = mergeDemo(before);

    expect(added).toBeGreaterThan(20);
    expect(countDemoItems(db)).toBe(added);
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
  it('removes exactly what mergeDemo added', () => {
    const before = userDB();
    const loaded = mergeDemo(before).db;
    const { db, removed } = stripDemo(loaded);

    expect(removed).toBe(countDemoItems(loaded));
    expect(countDemoItems(db)).toBe(0);
    expect(db.demo).toBeUndefined();
    for (const key of DEMO_COLLECTIONS) {
      expect(db[key]).toHaveLength(before[key].length);
    }
    expect(db.todos.map((t) => t.id)).toEqual(['user-todo-1']);
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

  it('is a no-op on a database without demo records', () => {
    const before = userDB();
    const { db, removed } = stripDemo(before);
    expect(removed).toBe(0);
    expect(db).toBe(before);
  });
});
