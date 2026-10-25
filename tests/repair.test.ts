import { describe, expect, it } from 'vitest';
import { DBSchema, SCHEMA_VERSION } from '../src/lib/types';
import { migrate, repairSettings, withDefaults } from '../src/lib/repo';

/**
 * These lock down the crash that blanked the desktop window: `AppBody` read
 * `settings.backdrop.effect`, and any database whose `settings` had lost that
 * group took the whole shell down with
 * "Cannot read properties of undefined (reading 'effect')".
 */
const settingsKeys = Object.keys(DBSchema.shape.settings.parse({}) as Record<string, unknown>);

const expectWholeSettings = (settings: unknown) => {
  expect(settings).toBeTypeOf('object');
  for (const key of settingsKeys) {
    expect(settings as Record<string, unknown>).toHaveProperty(key);
  }
  const backdrop = (settings as { backdrop: Record<string, unknown> }).backdrop;
  expect(backdrop.effect).toBeTypeOf('string');
  expect(backdrop.intensity).toBeTypeOf('number');
};

describe('settings repair', () => {
  it('fills a missing group instead of leaving it undefined', () => {
    const { backdrop, ...rest } = DBSchema.shape.settings.parse({}) as Record<string, unknown>;
    expect(backdrop).toBeDefined();
    const repaired = repairSettings(rest);
    expectWholeSettings(repaired);
    expect(repaired.backdrop.effect).toBe('none');
  });

  it('keeps the groups the user did set', () => {
    const repaired = repairSettings({ theme: { mode: 'light', accent: '#ff0000' } });
    expect(repaired.theme.mode).toBe('light');
    expect(repaired.theme.accent).toBe('#ff0000');
    // untouched neighbours still arrive with their defaults
    expectWholeSettings(repaired);
  });

  it('keeps the readable fields of a group that is partly broken', () => {
    const repaired = repairSettings({
      backdrop: { effect: 'aurora', intensity: 'very high', speed: 1.4 },
    });
    expect(repaired.backdrop.effect).toBe('aurora');
    expect(repaired.backdrop.speed).toBe(1.4);
    // the impossible value falls back rather than poisoning the group
    expect(repaired.backdrop.intensity).toBeTypeOf('number');
  });

  it('survives null, arrays and junk where an object belongs', () => {
    for (const junk of [null, undefined, [], 'settings', 42]) {
      expectWholeSettings(repairSettings(junk));
    }
    expectWholeSettings(repairSettings({ backdrop: null, theme: [], ui: 'none' }));
  });

  it('never invents data the database still has', () => {
    const original = DBSchema.shape.settings.parse({
      backdrop: { effect: 'grain', intensity: 0.2 },
      timerProfiles: [],
    }) as Record<string, unknown>;
    const repaired = repairSettings(original);
    expect(repaired.backdrop).toMatchObject({ effect: 'grain', intensity: 0.2 });
  });
});

describe('migrate', () => {
  const legacy: Record<string, unknown>[] = [
    {},
    { version: 0 },
    { version: 1, todos: [] },
    { version: 2, todos: [{ id: 'a', title: 'One' }] },
    { version: 3, settings: {} },
    { version: 4, settings: { theme: 'dark' } },
    { version: 5, settings: { theme: { mode: 'dark' } } },
    { version: SCHEMA_VERSION, settings: {} },
    { version: SCHEMA_VERSION, settings: null },
    { version: SCHEMA_VERSION },
  ];

  it('always returns whole settings', () => {
    for (const raw of legacy) {
      const db = migrate(raw);
      expectWholeSettings(db.settings);
      expect(db.version).toBe(SCHEMA_VERSION);
    }
  });

  it('does not erase the activity history when upgrading from version 0', () => {
    const kept = [{ id: 'a1', at: new Date().toISOString(), kind: 'todo', text: 'Kept' }];
    const db = migrate({ version: 0, activity: kept });
    expect(db.activity).toHaveLength(1);
    expect(db.activity[0].text).toBe('Kept');
  });

  it('repairs a database that was hand-edited into nonsense', () => {
    const db = migrate({
      version: SCHEMA_VERSION,
      todos: 'not an array',
      settings: { backdrop: 'aurora', ui: { labels: 'sideways' } },
    });
    expect(Array.isArray(db.todos)).toBe(true);
    expectWholeSettings(db.settings);
    expect(['full', 'minimal', 'none']).toContain(db.settings.ui.labels);
  });

  it('withDefaults is idempotent', () => {
    const once = withDefaults(DBSchema.parse({ version: SCHEMA_VERSION }));
    const twice = withDefaults(once);
    expect(JSON.stringify(twice.settings)).toBe(JSON.stringify(once.settings));
  });
});
