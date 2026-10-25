import { DBSchema, SCHEMA_VERSION, type DB } from './types';
import { isElectron } from './platform';

const KEY = 'flow.db.v3';

/** localStorage throws inside sandboxed iframes without allow-same-origin.
 *  Fall back to an in-memory map so the app still runs (persistence degrades
 *  gracefully instead of crashing). */
const memory = new Map<string, string>();
const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { memory.set(key, value); }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { memory.delete(key); }
  },
};

/** Shared safe key-value store used by the mini tools. */
export const safeStore = {
  read<T>(key: string, fallback: T): T {
    const raw = storage.get(`flow.tool.${key}`);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
  write(key: string, value: unknown) {
    storage.set(`flow.tool.${key}`, JSON.stringify(value));
  },
};

type Raw = Record<string, unknown>;

/** Versioned migrations. Each step upgrades one version forward. */
const migrations: Record<number, (db: Raw) => Raw> = {
  1: (db) => ({ ...db, decks: Array.isArray(db.decks) ? db.decks : [], activity: [] }),
  2: (db) => {
    const todos = (db.todos as Raw[] | undefined) ?? [];
    return { ...db, todos: todos.map((t) => ({ ...t, loggedMin: typeof t.loggedMin === 'number' ? t.loggedMin : 0 })) };
  },
  3: (db) => db,
  /* 4 adds settings.backdrop; the schema default fills it in for every
     existing database, so the step itself only records the version. */
  4: (db) => db,
  /* 5 adds settings.ui (label density) and settings.immersive (end colour,
     arc). Both are defaulted by the schema, so the step only records it. */
  5: (db) => db,
  /* 6 bundles Satoshi and Sentient with the app, so they become the defaults.
     Anyone still on the old default (Inter) moves across; a face the user
     picked on purpose is left exactly as it is. */
  6: (db) => {
    const settings = db.settings as Raw | undefined;
    if (!settings) return db;
    const type = settings.typography as Raw | undefined;
    if (!type) return db;
    const pick = (v: unknown, next: string) => (v === 'Inter' || v === undefined ? next : v);
    return {
      ...db,
      settings: {
        ...settings,
        typography: {
          ...type,
          ui: pick(type.ui, 'Satoshi'),
          content: pick(type.content, 'Sentient'),
          timer: pick(type.timer, 'Satoshi'),
        },
      },
    };
  },
};

export function migrate(raw: Raw): DB {
  let data = raw;
  let v = typeof data.version === 'number' ? data.version : 0;
  while (v < SCHEMA_VERSION) {
    v += 1;
    const step = migrations[v];
    if (step) data = step(data);
    data.version = v;
  }
  const parsed = DBSchema.safeParse(data);
  if (parsed.success) return parsed.data;

  // A single corrupt collection must never cost the user their whole database.
  // Each top-level key is validated on its own; only the broken ones fall back
  // to their schema default, everything else is kept verbatim.
  console.warn('Flow: database validation recovered with defaults', parsed.error.issues.slice(0, 5));
  const shape = DBSchema.shape as unknown as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } ; parse: (v: unknown) => unknown }>;
  const src = data as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const result = shape[key].safeParse(src[key]);
    if (result.success) {
      merged[key] = result.data;
    } else {
      const errs = parsed.error.issues.filter((i) => i.path[0] === key);
      console.warn(`Flow: resetting "${key}" (${errs.length} issues)`);
      try { merged[key] = shape[key].parse(undefined); } catch { /* key is required: leave it out */ }
    }
  }
  merged.version = SCHEMA_VERSION;
  return DBSchema.parse(merged);
}

export const repo = {
  async load(): Promise<DB | null> {
    if (isElectron()) {
      try {
        const json = await window.flow!.load();
        if (!json) return null;
        return migrate(JSON.parse(json) as Raw);
      } catch (err) {
        console.error('Flow: failed to load from main process', err);
      }
    }
    try {
      const json = storage.get(KEY);
      if (!json) return null;
      return migrate(JSON.parse(json) as Raw);
    } catch (err) {
      console.error('Flow: failed to load local database', err);
      return null;
    }
  },
  async save(db: DB): Promise<void> {
    const json = JSON.stringify(db);
    if (isElectron()) {
      try {
        await window.flow!.save(json);
        return;
      } catch (err) {
        console.error('Flow: main-process save failed, using local cache', err);
      }
    }
    try {
      storage.set(KEY, json);
    } catch (err) {
      console.error('Flow: save failed (storage full?)', err);
    }
  },
  async clear() {
    storage.remove(KEY);
  },
};

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.cancel = () => t && clearTimeout(t);
  return wrapped as typeof wrapped & { cancel: () => void };
}
