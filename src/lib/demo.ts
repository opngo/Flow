import { seedDB } from './seed';
import { DBSchema, type DB } from './types';

/**
 * Demo data that can be added to and removed from a live database.
 *
 * The rule this module enforces: demo records are additive and disposable.
 * Preferences (`settings`), the onboarding/tutorial state, enabled tools,
 * dashboard layout, the running focus engine and tool-local storage are never
 * part of the payload, so loading or clearing the demo set cannot reset how the
 * app is configured.
 *
 * Every record is namespaced with `demo-`, which is what makes removal exact:
 * user records use UUIDs and never carry the prefix.
 */

export const DEMO_PREFIX = 'demo-';

/** Content collections the demo set touches. Settings and focus are excluded. */
export const DEMO_COLLECTIONS = [
  'categories',
  'todos',
  'habits',
  'habitLogs',
  'goals',
  'subjects',
  'marks',
  'focusSessions',
  'notes',
  'decks',
  'events',
  'mixes',
  'projects',
] as const;

export type DemoCollection = (typeof DEMO_COLLECTIONS)[number];

type Raw = Record<string, unknown>;

function collectIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Raw;
  if (typeof obj.id === 'string') out.add(obj.id);
  for (const key of Object.keys(obj)) collectIds(obj[key], out);
}

/** Only id-bearing fields are rewritten. A blanket string replace would corrupt
 *  any enum or label that happens to equal an id (`focus` is a session kind). */
const ID_FIELD = /(^id$|Id$|Ids$)/;

function remap<T>(node: T, map: Map<string, string>, field = 'id'): T {
  if (typeof node === 'string') {
    return (ID_FIELD.test(field) ? map.get(node) ?? node : node) as unknown as T;
  }
  if (Array.isArray(node)) return node.map((n) => remap(n, map, field)) as unknown as T;
  if (!node || typeof node !== 'object') return node;
  const out: Raw = {};
  for (const [key, value] of Object.entries(node as Raw)) out[key] = remap(value, map, key);
  return out as T;
}

/**
 * The seeded example database, rewritten into the `demo-` namespace so it can
 * sit next to real records without touching any of them.
 */
export function demoDataset(): DB {
  const seed = seedDB();
  const ids = new Set<string>();
  collectIds(seed, ids);
  const map = new Map<string, string>();
  for (const id of ids) map.set(id, `${DEMO_PREFIX}${id}`);
  const namespaced = remap(seed, map);
  // Anything that arrives running would start ticking against the clock.
  namespaced.timers = namespaced.timers.map((t) => ({ ...t, running: false, endsAt: undefined }));
  // No scheduled reminders or notifications: loading example data must never
  // fire an alert, missed or otherwise.
  namespaced.reminders = [];
  namespaced.notifications = [];
  namespaced.activity = [];
  return DBSchema.parse(namespaced);
}

/** Demo items currently in a database. */
/**
 * Ids that belong to the shipped example set.
 *
 * The first run seeds a full example database whose ids are stable
 * (`todo-…`, `note-…`, `ev-…`). Those records are sample content just as much
 * as the `demo-` ones, but they predate the namespace, so removal has to know
 * about both — otherwise "Remove demo data" silently does nothing on a fresh
 * install, which is exactly what it used to do.
 */
let seedIds: Set<string> | null = null;
export function exampleIds(): Set<string> {
  if (!seedIds) {
    const ids = new Set<string>();
    collectIds(seedDB(), ids);
    seedIds = ids;
  }
  return seedIds;
}

const isSample = (id: string) => id.startsWith(DEMO_PREFIX) || exampleIds().has(id);

export function countDemoItems(db: DB): number {
  return DEMO_COLLECTIONS.reduce(
    (total, key) => total + (db[key] as Array<{ id: string }>).filter((i) => isSample(i.id)).length,
    0,
  );
}

/**
 * Merge the demo set into `current`. Existing ids win, so loading twice is
 * harmless. Returns the new database plus how many records were added.
 */
export function mergeDemo(current: DB, demo: DB = demoDataset()): { db: DB; added: number } {
  let added = 0;
  const db: DB = { ...current };
  for (const key of DEMO_COLLECTIONS) {
    const existing = new Set((current[key] as Array<{ id: string }>).map((i) => i.id));
    const incoming = (demo[key] as Array<{ id: string }>).filter((i) => !existing.has(i.id));
    if (!incoming.length) continue;
    added += incoming.length;
    // The collection types differ; the demo array is built from the same schema.
    (db as unknown as Record<string, unknown[]>)[key] = [...(current[key] as unknown[]), ...(incoming as unknown[])];
  }
  db.demo = added || current.demo ? { loadedAt: current.demo?.loadedAt ?? new Date().toISOString(), count: countDemoItems(db) } : current.demo;
  return { db: DBSchema.parse(db), added };
}

/**
 * Remove only demo records. Everything the user created, plus all preferences
 * and tutorial flags, is left exactly as it was.
 */
export function stripDemo(current: DB): { db: DB; removed: number } {
  let removed = 0;
  const db: DB = { ...current };
  for (const key of DEMO_COLLECTIONS) {
    const items = current[key] as Array<{ id: string }>;
    const kept = items.filter((i) => !isSample(i.id));
    removed += items.length - kept.length;
    (db as unknown as Record<string, unknown[]>)[key] = kept;
  }
  if (removed === 0) return { db: current, removed: 0 };
  db.demo = undefined;
  return { db: DBSchema.parse(db), removed };
}
