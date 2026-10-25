import { DBSchema, SCHEMA_VERSION, type DB, type Settings } from './types';
import { cleanLine } from './commands';
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
  1: (db) => ({
    ...db,
    decks: Array.isArray(db.decks) ? db.decks : [],
    /* Only fill a missing array. An existing history is the user's, and an
       upgrade that quietly erased it would be worse than the bug it fixes. */
    activity: Array.isArray(db.activity) ? db.activity : [],
  }),
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
  /* 7 repairs titles that swallowed their own command syntax. A line of only
     tokens (`{type:task}{when:tomorrow }`) used to be saved verbatim, so it
     showed up in the list and in every reminder as braces. Clean the titles
     that are already stored instead of leaving the user to fix them by hand. */
  7: (db) => {
    /* A corrupt collection is not an array: leave it alone and let the
       schema's own repair deal with it. */
    const fix = (rows: unknown, key: string, fallback: string) =>
      Array.isArray(rows)
        ? rows.map((row) => {
          if (!isPlainObject(row)) return row;
          const title = typeof row[key] === 'string' ? (row[key] as string) : '';
          const clean = cleanLine(title);
          return clean === title ? row : { ...row, [key]: clean || fallback };
        })
        : rows;
    return {
      ...db,
      todos: fix(db.todos as Raw[] | undefined, 'title', 'New task'),
      notes: fix(db.notes as Raw[] | undefined, 'title', 'Untitled note'),
    };
  },
};

type SettingsShape = typeof DBSchema.shape.settings;
const settingsDefaults = DBSchema.shape.settings.parse({}) as Record<string, unknown>;
const settingsGroups = (DBSchema.shape.settings as unknown as {
  _def: { innerType: { shape: Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }> } };
})._def.innerType.shape;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Make a settings object whole again.
 *
 * Every group in `settings` is validated on its own and merged over the schema
 * defaults, so one broken or missing group costs the user that group's
 * preferences and nothing else. A database written by an older build, repaired
 * by hand, or half-written before a crash therefore boots into a complete
 * `settings` object instead of crashing the shell on a missing key
 * (`settings.backdrop.effect` was exactly that fault).
 */
export function repairSettings(raw: unknown): Settings {
  const source = isPlainObject(raw) ? raw : {};
  const out: Record<string, unknown> = { ...settingsDefaults };
  for (const key of Object.keys(settingsDefaults)) {
    const fallback = settingsDefaults[key];
    const group = settingsGroups[key];
    const value = source[key];
    const merged = isPlainObject(fallback) && isPlainObject(value) ? { ...fallback, ...value } : value;
    if (merged === undefined || merged === null) continue;
    if (!group) { out[key] = merged; continue; }
    const parsed = group.safeParse(merged);
    if (parsed.success) {
      out[key] = parsed.data;
      continue;
    }
    /* The group is unusable as a whole. Keep whatever survives one field at a
       time rather than throwing all of it away. */
    const salvaged: Record<string, unknown> = { ...(isPlainObject(fallback) ? fallback : {}) };
    if (isPlainObject(merged)) {
      for (const field of Object.keys(salvaged)) {
        const single = group.safeParse({ ...salvaged, [field]: merged[field] });
        if (single.success) salvaged[field] = (single.data as Record<string, unknown>)[field];
      }
    }
    out[key] = salvaged;
  }
  return out as Settings;
}

/** Guarantee a whole database: settings repaired, collections defaulted. */
export function withDefaults(db: DB): DB {
  return { ...db, settings: repairSettings(db.settings) };
}

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
  if (parsed.success) return withDefaults(parsed.data);

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
  return withDefaults(DBSchema.parse(merged));
}

/** A database plus the answer to "did loading have to change anything?".
 *  The shell writes the repaired version back so the file on disk stops being
 *  broken, instead of paying for the same recovery on every launch. */
export type LoadResult = { db: DB; repaired: boolean };

const changedSinceStored = (raw: Raw, db: DB) =>
  JSON.stringify(raw.settings) !== JSON.stringify(db.settings) ||
  (typeof raw.version === 'number' ? raw.version : 0) !== db.version;

export const repo = {
  async load(): Promise<LoadResult | null> {
    if (isElectron()) {
      try {
        const json = await window.flow!.load();
        if (!json) return null;
        const raw = JSON.parse(json) as Raw;
        const db = migrate(raw);
        return { db, repaired: changedSinceStored(raw, db) };
      } catch (err) {
        console.error('Flow: failed to load from main process', err);
      }
    }
    try {
      const json = storage.get(KEY);
      if (!json) return null;
      const raw = JSON.parse(json) as Raw;
      const db = migrate(raw);
      return { db, repaired: changedSinceStored(raw, db) };
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
