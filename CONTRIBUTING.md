# Contributing to Flow

Thanks for wanting to help. This document is short on purpose: it covers the
rules that get a pull request merged, and the rules that get it turned down.

## Ground rules

Flow is **local-first**. Four properties are not negotiable, and a pull request
that breaks one of them will be declined regardless of how good it is:

1. **No network calls at runtime.** No analytics, no crash reporting, no update
   pings, no remote fonts, no CDN scripts. If a feature needs a server, it does
   not belong in Flow.
2. **No accounts.** Everything works for a user who has never signed in to
   anything.
3. **The database stays portable.** One JSON file, versioned, exportable. New
   fields need a default and a migration if they change an existing collection.
4. **The UI rules hold.** See below.

## The UI rules

These are the reason Flow looks calm. They are enforced in review and partly in
CI (`ci.yml` runs the hygiene job):

- **No borders, outlines or focus rings.** Not 1px strokes, not `ring-*`, not
  `outline`. Separation comes from three surface tones, blur and soft shadows.
  Keyboard focus must still be obvious: use a background tint plus an accent
  glow. `.focusable` in `src/styles.css` already does this.
- **Lucide icons only, and zero emoji.** Every icon resolves through
  `src/lib/icons.ts`. Add the import, add the map entry, then use the name.
  Icon names are stored as data, so a picker or seed can never reference a
  component that does not exist.
- **Headless UI for every control with a state machine.** Dialogs, menus,
  selects, comboboxes, switches, tabs, popovers, disclosures and radio groups
  all go through the wrappers in `src/components/ui.tsx`. Do not import Headless
  UI directly in a page; extend the wrapper. Never use a native `<select>`.
- **Motion between 150 and 250 ms.** Nothing should snap; nothing should make
  the user wait. Honour the `reduce motion` setting.
- **No dead ends.** Every control does something real. No "coming soon", no
  disabled-without-reason, no placeholder text.

## Getting set up

```sh
git clone https://github.com/opngo/flow.git
cd flow
npm ci
npm run dev
```

Node 20 or newer. The browser build and the Electron build share one renderer,
so you rarely need the desktop shell. When you do: `npm run electron:dev`.

## Before you open a pull request

Run all four. CI runs the same commands, and a red check will just delay review.

```sh
npm run typecheck
npm test
npm run build
npm run verify:workflows   # only if you touched .github/
```

Then:

- Add a test for new behaviour. Domain logic belongs in `tests/logic.test.ts`,
  store behaviour in `tests/store.test.ts`, and anything about routing or
  rendering in `tests/app.smoke.test.tsx` or `tests/tools.smoke.test.tsx`. If a
  change genuinely cannot be tested, say why in the pull request.
- Keep the diff focused. A feature and a refactor in one pull request is two
  reviews pretending to be one.
- Match the surrounding style: function components, hooks, `cn()` for
  conditional classes, CSS variables for colour, no inline hex where a token
  exists.
- Update `CHANGELOG.md` under `## [Unreleased]` for anything a user would
  notice.
- Fill in the pull request template. The "how to check it" section matters more
  than the checklist.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are used to build
release notes, so the subject line becomes user-facing text:

```
feat(timers): add interval presets
fix(grades): drop the lowest mark per category, not per subject
docs(readme): document the nightly workflow
chore(deps): bump electron to 33.2
```

`feat`, `fix`, `perf`, `docs`, `build`, `ci`, `refactor` and `test` all map to
sections in the generated notes. Keep the subject under about 70 characters and
write it in the imperative.

## Adding a tool

Flow advertises a specific number of tools, and the catalogue is checked:

1. Add an entry to `TOOLS` in `src/lib/nav.ts` with a unique `id`.
2. If it needs its own screen, add a renderer to `RENDERERS` in
   `src/pages/ToolHost.tsx` keyed by the route slug.
3. `tests/tools.smoke.test.tsx` renders every tool page automatically, so a
   broken renderer fails CI without any extra work.

## Reporting bugs and requesting features

Use the issue templates. A good bug report has reproduction steps, the surface
(installer or dev server), the version from Settings, and console output from the
in-app "Copy report" button. For security issues, read [`SECURITY.md`](SECURITY.md)
and report privately.

## Code of conduct

Be decent to each other. Harassment, personal attacks and bigotry are not
welcome here, in issues, in reviews or in discussions. Maintainers will close
threads and block accounts that cannot manage that.
