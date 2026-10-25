import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DBSchema, SCHEMA_VERSION } from '../src/lib/types';
import { seedDB } from '../src/lib/seed';
import { resetBoot, useFlow } from '../src/store';

const KEY = 'flow.db.v3';

/**
 * Boot recovery, end to end: a database on disk that is missing a settings
 * group used to blank the desktop window on `settings.backdrop.effect`. It now
 * boots, and the repaired version is written back so the next launch is clean.
 */
describe('boot with a damaged database', () => {
  beforeEach(() => {
    localStorage.clear();
    /* `init()` is once-per-process by design; each case here is a launch. */
    resetBoot();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const write = (db: unknown) => localStorage.setItem(KEY, JSON.stringify(db));

  it('repairs settings that lost a group and rewrites the file', async () => {
    const good = seedDB();
    const { backdrop, ...withoutBackdrop } = good.settings as unknown as Record<string, unknown>;
    expect(backdrop).toBeDefined();
    write({ ...good, settings: withoutBackdrop });

    await useFlow.getState().init();

    const loaded = useFlow.getState().db.settings;
    expect(loaded.backdrop.effect).toBeTruthy();
    expect(loaded.theme.mode).toBe(good.settings.theme.mode);

    // ...and the repair is persisted, not just held in memory (save is async)
    await new Promise((r) => setTimeout(r, 20));
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(saved.settings.backdrop).toBeDefined();
  });

  it('keeps the user data around a broken settings block', async () => {
    const good = seedDB();
    const todos = [{ ...good.todos[0], id: 'keep-me', title: 'Do not lose me' }];
    write({ ...good, todos, settings: { theme: 'not an object' } });

    await useFlow.getState().init();

    const db = useFlow.getState().db;
    expect(db.todos[0].title).toBe('Do not lose me');
    expect(db.settings.backdrop).toBeDefined();
    expect(useFlow.getState().ready).toBe(true);
  });

  it('falls back to a seed instead of hanging on the splash screen', async () => {
    localStorage.setItem(KEY, '{ not json');
    await useFlow.getState().init();
    expect(useFlow.getState().ready).toBe(true);
    expect(useFlow.getState().db.settings.backdrop).toBeDefined();
  });

  it('boots once however many callers ask for it', async () => {
    localStorage.clear();
    resetBoot();
    /* The entry point starts the load before React mounts and the shell asks
       again on its first effect (twice, under StrictMode). */
    await Promise.all([
      useFlow.getState().init(),
      useFlow.getState().init(),
      useFlow.getState().init(),
    ]);
    expect(useFlow.getState().ready).toBe(true);
    const first = useFlow.getState().db;
    await useFlow.getState().init();
    // The same object: nothing was re-read and nothing was replaced.
    expect(useFlow.getState().db).toBe(first);
  });
});
