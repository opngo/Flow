# Architecture

Flow is one renderer shared by two hosts. This document explains the layers, the
decisions behind them, and the rules the interface is held to.

## The two hosts

```
┌──────────────────────────── packaged desktop ────────────────────────────┐
│  Electron main process            preload (contextBridge)   renderer     │
│  ─ window, tray, shortcuts        ─ flow.load()             ─ src/**     │
│  ─ notification scheduler         ─ flow.save()                          │
│  ─ JSON file + backups            ─ flow.window/notify/…                 │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── browser preview ─────────────────────────────┐
│  Vite dev server                  nothing extra             renderer      │
│                                   (localStorage behind the same repo API) │
└──────────────────────────────────────────────────────────────────────────┘
```

`src/lib/platform.ts` decides which host it is in by looking for `window.flow`,
the preload bridge. Nothing else in the codebase branches on platform except the
titlebar's window buttons and the tray sync. That is what makes `npm run dev`
useful: it is the same application, not a mock of it.

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Schema | `src/lib/types.ts` | Zod schema for every entity. Single source of truth. `SCHEMA_VERSION` lives here. |
| Persistence | `src/lib/repo.ts` | `load`, `save`, debounced writes, `migrate()`, per-key corruption recovery, rolling backups in Electron, in-memory fallback when storage throws. |
| State | `src/store.ts` | The only writer. Every mutation goes through `mutate`, `patch`, `add`, `remove`, with undo snapshots for user-visible changes. |
| UI state | `src/ui.ts` | Palette, quick capture, toasts, sidebar, focus mode, mini mode, lock. Deliberately separate: none of it is persisted. |
| Domain | `src/lib/*` | Pure functions: `grades`, `analytics`, `habits`, `nlp`, `scheduler`. No React, no store, trivially testable. |
| Views | `src/pages/*` | 16 routes plus `ToolHost`, which holds 76 tool renderers. All lazy-loaded. |
| Design system | `src/components/ui.tsx`, `src/styles.css` | Every primitive and every Headless UI wrapper. Pages never import Headless UI directly. |

## Decisions worth knowing

### Timers are clock-derived, never counted

A running timer stores `startedAt` and `endsAt`. The UI recomputes the remainder
from `Date.now()` on a 500 ms tick. A counter would drift whenever the window is
throttled, the machine sleeps, or the app reloads; timestamps cannot.

The same reasoning puts the reminder scheduler in the main process: a single
precise timer for the next reminder plus a 30-second safety tick, persisted so
reminders survive a restart, re-armed on `powerMonitor` resume. Anything that
fired while the app was off is delivered as *missed* rather than dropped.

### One database, validated at the edge

Writes go to one JSON document. On load, `migrate()` walks the version chain, then
validates. If validation fails, each top-level collection is validated
independently: the ones that parse are kept verbatim, only the broken ones fall
back to their schema default, and the version is pinned so the file is not
silently downgraded. A single malformed record cannot cost a user their notes.

### Fault isolation

Routes are wrapped in an error boundary. A render fault shows a panel with retry,
reload, and a copyable report, and the shell, the sidebar and the database stay
alive. The alternative — a white window — is unacceptable for a local app where
the data is the whole point.

### Code splitting along page boundaries

The shell and store ship in the entry chunk; each page loads on first visit.
Recharts, the Web Audio engine and the drag-and-drop kit therefore never appear in
the boot path.

### The sound engine is procedural

There are no audio files. `src/audio/engine.ts` generates four-second stereo noise
buffers in six colours and builds eighteen layers from filtered noise, amplitude
modulation and scheduled bursts. That keeps the installer small and every layer
infinitely variable.

## UI rules, and where they are enforced

| Rule | Where |
|---|---|
| No borders, outlines or focus rings | `src/styles.css` (`outline: none !important`, `.focusable` tint + glow) |
| Lucide only, no emoji | `src/lib/icons.ts`; `ci.yml` hygiene job rejects emoji in source and docs |
| Headless UI for every control | `src/components/ui.tsx`; no native `<select>`, `<details>` or `<dialog>` in `src/` |
| Motion 150–250 ms | transitions in `styles.css` and `framer-motion` props |
| No dead ends | `tests/tools.smoke.test.tsx` renders every tool page and every catalogue deep link |
| No placeholders | `ci.yml` hygiene job greps for TODO, FIXME and "coming soon" |

## Testing

| Suite | Purpose |
|---|---|
| `tests/app.smoke.test.tsx` | boots, seeds, renders all 16 routes, fails on fatal render errors |
| `tests/tools.smoke.test.tsx` | all 76 tool pages and 32 catalogue deep links mount their own content |
| `tests/logic.test.ts` | grades, analytics, habits, natural-language parsing, scheduling, migrations, corruption recovery |
| `tests/store.test.ts` | CRUD, undo and redo, clock-derived timers, spaced repetition, JSON round-trip, reminder ladder |
| `tests/calc.test.ts` | calculator grammar, and rejection of injection attempts |
| `tests/errorboundary.test.tsx` | fault isolation and recovery affordances |

jsdom cannot run everything, so `tests/setup.ts` stubs `ResizeObserver`, canvas
contexts, `matchMedia` and media playback. Anything requiring a real layout is
verified by screenshotting the built app instead.

## Where to go next

- [`RELEASING.md`](RELEASING.md) — how a tag becomes installers
- [`WORKFLOWS.md`](WORKFLOWS.md) — every workflow, trigger and required secret
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the rules in review
