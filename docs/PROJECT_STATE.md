# Project state

_Last updated: 2026-10-24 — release 1.0.0_

## Where things stand

| Area | State |
|---|---|
| Application | Complete. 16 routes, 76 tool pages, 124 catalogue entries, all functional |
| Tests | 41 tests across 6 files, all passing |
| Type check | Strict, zero errors |
| Build | Clean; boot chunk 150 kB (48 kB gzip), every page lazy-loaded |
| Desktop shell | Complete and code-verified; cannot be launched in a headless sandbox |
| Packaging | Configured for NSIS, portable, DMG, ZIP, AppImage, deb and tar.gz on x64 and ARM64 |
| CI | Eight workflows, validated by `npm run verify:workflows` |
| Landing page | Complete, self-contained, deployed by Pages on every relevant push |
| Docs | README, ARCHITECTURE, RELEASING, WORKFLOWS, CONTRIBUTING, SECURITY, CHANGELOG |

## What is verified, and how

- **Run for real:** the renderer in a browser at `npm run dev`, every route, every
  tool page, every catalogue deep link, the store and all domain logic.
- **Verified by test:** routing, tool routing, grade maths, analytics grids,
  habit streaks, natural-language parsing, reminder scheduling, migrations and
  corruption recovery, undo and redo, spaced repetition, JSON round-trip,
  calculator grammar, error recovery.
- **Verified by screenshot:** the landing page at 390, 820 and 1280 px, checked
  for horizontal overflow, focus behaviour and console errors.
- **Code-verified only:** tray, native notifications, global shortcuts and window
  controls. These need a desktop session, which the build sandbox does not have.
  Run `npm run electron:dev` on a real machine to confirm them.

## Known limitations

1. **Unsigned installers.** SmartScreen and Gatekeeper prompt once. Fixing it
   needs certificates, not code.
2. **No encryption at rest.** The database is a plain JSON file in the user-data
   folder. The app lock is a convenience gate, not encryption.
3. **No cloud sync.** Deliberate: export and import JSON, or keep the file in a
   folder your file-sync tool already watches.
4. **Single window.** Timers keep running in the tray, but there is no split view
   yet.
5. **jsdom gaps.** Canvas visualisations and real layout are checked by screenshot
   rather than by unit test.

## Next

- Signed Windows and macOS builds
- Optional encrypted database
- Split view

The full backlog is in the issue tracker, and the release history is in
[`CHANGELOG.md`](../CHANGELOG.md).
