# Changelog

All notable changes to Flow are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `release.yml` workflow reads the section matching the version being released,
so keep headings exactly as `## [x.y.z] - YYYY-MM-DD`.

## [Unreleased]

### Planned

- Signed Windows and macOS builds once certificates are in place
- Optional encrypted database at rest
- Split view: two panes side by side in one window

## [1.6.0] - 2026-10-24

### Added

- **Braced commands.** `{type:habit} Read poetry {repeat:daily} {target:25}` builds the record you
  mean. Twenty-five keys — name, type, date, time, when, repeat, priority, estimate, subject,
  category, tag, project, habit, target, body, folder, score, out-of, place, for, label, remind,
  colour, deck — each with a plain-language note about where its value lands. Typing `{` opens the
  list, keys first and then the values that key accepts; picking a key drops the caret inside its
  braces and the value list appears behind it. Everything typed is previewed field by field before
  it is saved, and an unfinished `{repeat:daily` is closed for you at commit instead of leaking
  into the title.
- **Placement chips.** Under the capture box, one tap adds When, Date, Time, Repeat, Priority,
  Estimate, Subject, Category, Tag, Place, Folder, Score or For.
- **Seven things to capture.** The same line can become a task, a habit, a note, an event, a mark,
  a focus block or a running timer, and the dialog says which one before you press Enter.
- **A working command palette.** Capture (eight entries), Focus (start, pause, resume, skip, extend,
  end, reset, log a distraction, focus mode, pick a target), Timers (new, stopwatch, tea, one row
  each to stop or pause every running timer, stop all, open, full-screen clock), Habits (new,
  check the whole day in, one row per habit), Marks, Notes and App (no-text mode, heatmap style,
  lock, mark notifications read, undo, redo, export, settings). `+` filters to capture, `>` to
  everything that acts.
- **Command icon on the dashboard.** The titlebar plus and the soft `Command` button are gone; a
  single command glyph sits beside the day's numbers and opens the palette.
- **Animated sidebar accent.** One accent bar travels between rows instead of a line per row: it is
  positioned from live layout (so it survives a width change or a label-density change), springs
  between rows and carries a soft bloom that breathes at rest. Respects reduced motion.
- **Filled vertical heatmaps, and the option to step.** Default now: each cell is a small column
  that fills from the bottom by the share done that day (fraction of scheduled habits, or value
  against the top threshold). Settings → Appearance → Heatmaps offers the five-step ladder instead,
  with a live preview of both. Legibility work: filled cells are 25 % taller than they are wide so a
  half-done day reads as half a bar.
- **Habit calendar dots explained.** The monthly habit grid is now a row of dots per day — filled
  for done, a ring for still open, a dash for skipped — each with a tooltip naming the habit and its
  state, above a key that spells the three states out and says that a dot checks the habit in.
- **Notebook type.** Notes read in the content face at 15 px on a 1.78 line, headings in the
  interface face so structure still scans; editor and preview share the same rhythm. Text in notes,
  previews and tables is selectable again, so a paragraph can be copied in preview mode.

### Fixed

- Weekday names in `{date:friday}` resolved one day early (Monday-first list indexed into a
  Sunday-first calendar), and `{date:10/28}` was read day-first, overflowing into a date two years
  out.
- The Habits heatmap tab drew the year of coverage twice: the page already shows it above every tab.
- Empty `{name:}` placeholders no longer end up in titles.
- Duplicate suggestions are no longer re-picked by Enter when the token already says exactly that.

## [1.5.0] - 2026-10-24

### Added

- **Calendar rebuilt.** A dated badge, the exact span the view covers, search, a joined
  previous / Today / next group and a view picker sit above three real views: a month grid with
  tinted event chips and `N more`, a week grid with events placed by minute, a live now-line and
  click-to-create empty hours, and a day view paired with a rail that shows the selected event's
  own details — time and span, place, subject, notes, duplicate, prep task, delete — over a mini
  month with activity dots.
- **Habit coverage.** The heatmap can fill each square by a fraction instead of an intensity step,
  so a day where half the scheduled habits were done is exactly half a square. The strip sits under
  the stats on every Habits tab, filterable per habit.
- **Typed times.** `TimeField` takes `1830`, `18:30`, `6.30pm` or `6 pm`, shows the reading back as
  `6:30 PM`, commits on Enter and reverts on Escape. It replaces every native time and
  date-time field in tasks, events, habits, timers, quiet hours and the tools.
- **Context menus.** One layer serves tasks, habits, notes, timers, decks and calendar chips:
  opens at the pointer, flips at the edges, closes on Escape, outside click or scroll, arrows and
  Enter navigate.
- **Satoshi and Sentient, bundled.** Both faces ship inside the app as woff2, woff and ttf with
  `@font-face` declarations; Satoshi is the interface face and Sentient the prose face. Nothing is
  fetched from Google Fonts or Fontshare at runtime, so type is identical offline.

### Changed

- **Colour picker layout.** Preview and hex, then a swatch row, then the field and the hue rail:
  the picker stacks in the width it is given and can no longer sit on top of the colour it is
  editing.
- **Create actions are a bare plus.** A single `PlusBtn` replaces “+ New habit”, “+ New task”,
  “+ New goal”, “+ New card”, “+ New timer”, “+ Add subject”, “+ Add mark” and “+ Event”.
- **The notebook list lives on the right** and folds away from its own header; the choice is
  remembered.
- **Flashcards move.** Cards enter and leave from opposite sides, the face tips back on reveal,
  the answer unrolls, and the rating row settles in.
- **No-text mode removes far more text**: page titles, section heads, stat and field labels, chips,
  table headers and the words on any control that has an icon.

### Fixed

- **Removing demo data did nothing on a fresh install.** The example database seeded on first run
  uses plain ids, not the `demo-` namespace, so the filter matched nothing. Removal now clears both
  the demo set and the shipped example records, and leaves preferences and the tutorial untouched.
- **Playhead and progress.** The immersive clock redraws every frame instead of four times a second,
  progress is one continuous arc rather than sections switching on, and the dot is a quiet bead in
  the text colour — white on dark, black on light — riding the arc instead of parking at the frame
  edge.
- **Sidebar accent rail** is drawn per row: it no longer slides between rows over several frames,
  and it sits centred in the row instead of low.

## [1.4.0] - 2026-10-24

### Added

- **Repeating tasks.** Quick capture understands a repeat clause — `Read every Monday at 18:00`,
  `Gym every other Wednesday at 1730`, `Pay rent on the 1st` — and stores it as an RRULE. Military
  times (`1800`, `0930`) are read as written; `#auto` lets loose times such as a bare `6` resolve
  against the current half of the day. Every non-repeating added task still behaves exactly as before.
- **Repeat builder in the task dialog.** Cadence, weekday pills and a time field with a live sentence
  underneath (`every other Wednesday at 17:30`) so the rule is confirmed before it is saved.
- **Calendar day panel.** Clicking a day in the month grid opens a side panel for that day: its events,
  tasks, assessments, habits due and focus sessions, grouped and counted. Rows route straight to the
  matching record, and hover cards summarise each one the way task rows do.
- **Colour picker.** A hand-drawn saturation/value field, hue rail, swatches and a hex field replace the
  native colour input for event colours, subject colours, grade categories and tool palettes. The
  Untitled UI colour picker is a PRO component, so the shipped one is built in the same visual language:
  no native control, full keyboard support and no border anywhere.

### Changed

- Task rows accept a start time as well as a due time, and the repeat cadence includes biweekly
  (every two weeks) alongside daily, weekly and monthly.
- Hover cards are portalled to the document body and measured before they appear, so they no longer
  inherit the offset of a transformed ancestor and always flip to stay on screen.

### Removed

- The mini clock in the titlebar. The immersive clock is the only place the time is shown.

## [1.3.0] - 2026-10-24

### Added

- **Label density.** Settings → Appearance offers Full, Minimal and None. Minimal hides metadata
  and minor labels; None leaves an icon-only shell with the same layout.
- **Tooltip layer.** One delegated `[data-tip]` layer gives every chrome control a tooltip in the
  reduced-label modes: sidebar rows, titlebar, icon buttons, toggles, swatches, habit cells, toasts.
  Content hover cards opt out through `[data-rich-tip]`.
- **Todo hover card.** Hovering a task shows created, start, due, estimate, logged time, checklist
  progress, tags and notes, split by hairlines that are shorter than the card and nearly invisible,
  with roomier padding than the row itself.
- **Immersive clock.** The time sits above a single 30 px band that sweeps beneath it and leaves the
  screen at both sides. The band is divided into 26 sections, and each section's end corners follow
  Settings → Appearance: sharp mode squares them, the radius slider rounds them up to a full cap.
  Sections light in order as the block elapses and a playhead dot rides the tip of the fill; the
  band dissolves at the screen edges instead of being cut by them.
  Digits are sized against the screen, the band grows slightly on play, and chrome is fully hidden
  while the clock runs, returning translucent on hover.
- **Colour drift.** The clock drifts toward a chosen colour over the closing share of the block
  (Settings → Timers: end colour and threshold).
- **Start on startup.** An Electron login item, exposed as a Settings toggle; the switch reverts if
  the OS refuses.
- **Sound Studio player.** Now-playing header with transport, analyser-driven LED output meter,
  vertical channel faders with a master strip, per-channel EQ, session clock.
- Route chunks prefetch on sidebar hover; Sound Studio is reachable from the immersive clock and
  the Timers header.

### Changed

- Task rows put metadata and tags on separate rows, so tags never crowd the meta line.
- The heatmap tooltip renders in a portal and clamps to the viewport on every edge; the grid scrolls
  instead of clipping at narrow widths.
- The sidebar active rail sits inside the pill; Dashboard is no longer a sidebar destination (the
  logo is home).
- Notifications open as a popover; breadcrumbs are clickable.
- Page transitions no longer wait for an exit animation before the next route paints.
- Database schema 5 adds `settings.ui.labels` and `settings.immersive`.

### Fixed

- Heatmap tooltip clipped at the edge of its panel.
- Tooltip text rendering as `[object Object]` for string tips.
- Sidebar hover state read as a function, crashing the shell on narrow widths.

## [1.2.0] - 2026-10-24

### Added

- **Three clocks in the immersive view.** Pomodoro, a plain countdown with a
  duration picker, and a stopwatch with hundredths and laps. Switch with the
  segmented control or keys `1`, `2`, `3`. The countdown and stopwatch are
  ordinary timer rows, so they also appear on the Timers page and log to study
  time when you finish them (`Space` start or pause, `L` lap, `R` reset, `F` log).
- **A clock that gets out of its own way.** While a timer runs the mode switch,
  buttons and footer fade out entirely, leaving the digits, the phase line and the
  progress segments alone. Moving the pointer or touching a key brings the chrome
  back at partial opacity; it fades again after a couple of seconds.
- **Custom sliders.** Every range control in the app is now drawn from scratch:
  a hairline track, a fill, a floating thumb, keyboard support (arrows, page keys,
  home and end, `Shift` for coarse steps), double-click to reset to the middle,
  and optional tick marks. The native input, which cannot be themed, is gone from
  the codebase.

### Changed

- **Glows are painted, not stroked.** Focus and hover highlights no longer use
  inset shadows, which were clipped by the border radius and ended on a visible
  hard edge, and no longer scale the element, which pushed it past its parent's
  clip box. Inputs now get a radial wash that fades out before the edge, buttons
  get a two-layer bloom with no spread, and panels can use a `.glow-wash` overlay
  that inherits their radius.
- The immersive digits carry a stepped glow instead of a blurred halo, and scale
  down when the clock needs more than five or seven characters.
- Settings, Appearance is regrouped: corner rounding has a single home in the
  Corners panel instead of a read-only duplicate in the theme panel.

### Fixed

- The corner swatch preview and the backdrop preview were clipped mid-glow; the
  preview surfaces now clip their own content and fill their row.
- The sound studio EQ sliders were uncontrolled, so their displayed position did
  not follow the engine after reopening.

## [1.1.0] - 2026-10-24

### Added

- **Opt-in backdrop effects.** Eight atmospheres behind the interface, off by
  default and chosen in Settings, Appearance, Backdrop: CRT wrap (scanlines,
  aperture grille, vignette, rolling band), ordered dither, dot grid, aurora,
  hyperspeed, silk, film grain. Intensity, speed and pixel-size sliders, a live
  preview that runs the real renderer, an option to also show the effect in the
  immersive timer, and a still frame when reduced motion is on. Canvas effects
  draw into a small buffer capped at 24,000 cells and 30 frames per second, and
  pause when the window is hidden.
- **Immersive timer.** A full-screen clock on its own surface: native fullscreen
  where the platform allows it, segmented progress, session dots, today's
  minutes, and a keyboard of its own (Space, S, N, F, arrows, Escape). Reachable
  from the titlebar, the Focus page, the command palette and `Ctrl/Cmd+Shift+Enter`.
- **Demo data you can add and remove.** Every seeded record is tagged `demo-` and
  merged additively, so loading it next to real work changes nothing else:
  preferences, theme, backdrop, corners mode, sidebar, enabled tools, hotkeys,
  the running focus engine and the tutorial state are left exactly as they were.
  Removing the demo set strips only the tagged records. Available in Settings,
  Data and from the command palette.
- **Corner rounding.** A scale slider (0 to 28 px with presets) that every literal
  radius in the interface follows through a single `--radius-scale` token, plus a
  sharp mode that flattens every corner including pills. The preview shows a
  panel, an icon plate and a pill at the current setting.
- **A new landing page.** Pixel-art hero scene rendered on canvas in three
  rendering modes, a horizontally panned six-panel product panorama driven by
  vertical scroll, parallax layer, scroll progress, platform-aware downloads,
  keyboard-navigable tabs, and a `P` shortcut for page-wide scanlines. Still one
  self-contained file with no external requests.

### Changed

- Settings, Appearance is now grouped: theme presets, custom tokens, backdrop and
  corners each get their own panel.
- The landing page is committed with real version numbers instead of placeholders;
  `stamp-landing.mjs` now rewrites existing version strings as well as
  placeholders, so the file renders correctly when opened from disk.
- Database schema version 4 adds `settings.backdrop` and `settings.theme.corners`;
  both carry defaults, so existing databases migrate without intervention.

### Fixed

- The dither renderer no longer shifts a whole grid row by one column when the
  frame wraps.
- Segmented timer bars use a theme-aware inactive tone instead of a hard-coded
  surface colour, which made them invisible in light mode.

## [1.0.0] - 2026-10-24

First public release. Everything below ships in the installers.

### Added

- **Shell and design system.** Frameless window with a custom titlebar, auto-hiding
  sidebar (auto or always, adjustable delay, width, icons-only, overlay, reorder,
  hide, regroup), five theme presets with dark, light and system modes, an accent
  picker, per-token theme overrides, density, radius and blur controls. Focus is
  shown with a tint and a glow everywhere: no borders, outlines or focus rings.
- **Typography.** Separate UI, content, timer and monospace font slots, base size,
  line height, letter spacing, weight and heading scale, with local `.ttf`, `.otf`,
  `.woff` and `.woff2` import through the FontFace API, a live preview, and preset
  export and import as JSON.
- **Todos.** Eleven views (list, board, calendar, timeline, day planner, Eisenhower
  matrix, deadline radar, focus list, overdue rescue, completed log, projects),
  smart filters, subtasks, tags, priorities, estimates, drag-and-drop, bulk
  actions, undo and redo, natural-language quick add, and an escalating reminder
  ladder that clears itself when a task is completed.
- **Habits.** Daily, weekday, times-per-week, alternate-day and recurrence-rule
  schedules; boolean, count and duration targets; streaks, longest run,
  consistency and weekly target statistics; a weekly grid and calendar; skip with
  a reason; automatic check-in when a linked timer finishes.
- **Goals.** Board, milestone and timeline views with progress derived from linked
  tasks and habits.
- **Focus engine.** Pomodoro profiles with configurable focus, break and long-break
  lengths, cycles, auto-start and strict mode; pause, resume, skip, extend and
  reset; distraction counting; a full-screen focus mode and an always-on-top mini
  mode; every completed block logged as a study session.
- **Timers.** Countdown, stopwatch, interval, routines, tracker and timesheet, all
  persisted and restart-safe. Remaining time is recomputed from timestamps on every
  tick rather than counted down.
- **Analytics.** A 53 by 7 GitHub-style study heatmap with source, subject,
  category and project filters, custom intensity thresholds, hover tooltips, a day
  detail panel and SVG or PNG export; plus subject, habit, hour and task
  breakdowns, streak statistics and summary cards.
- **Grades.** Subjects owning weighted categories with drop-lowest and best-N rules,
  typed marks (assignment, quiz, test, exam, project, lab), per-subject and
  term-wide what-if calculators, "what do I need on the final", GPA on 4.0 and 5.0
  scales, trends and cross-subject comparison.
- **Notes.** Markdown editor with live preview, folders, tags, double-bracket
  wikilinks with a backlink panel and a link picker that inserts at the caret,
  journal mode with mood tracking, zen mode, and word and reading-time statistics.
- **Flashcards.** Decks with spaced repetition (rate Again, Hard, Good or Easy to
  set the next interval and ease), due counts, CSV import and per-deck progress.
- **Calendar.** Month, week and agenda views layering events, pending assessments,
  due tasks and habit marks, with a one-click "prep task" for any event.
- **Sound Studio.** Six noise colours generated procedurally as four-second stereo
  buffers, eighteen nature and city layers built from filtered noise and scheduled
  bursts, per-layer volume, pan and tone, master muffle and ducking, a sleep timer,
  saved presets with favourites and morphing, and a canvas visualiser.
- **124 tools** in eight groups, 76 of them dedicated pages: reviews, exam mode,
  world clock, day progress, distraction log, countdown events, study planner,
  assignments, timetable, reading list, citations, formula sheet, vocabulary,
  practice log, scratchpad, journal, writing mode, whiteboard, mind map, Cornell
  notes, outline, scientific calculator with a real parser, unit and percentage
  converters, date and age calculators, colour palettes, base64, hashing, QR codes,
  passwords, regex, JSON, timestamps, time zones, budgets, subscriptions, packing
  lists, global search, tags, saved views, backups, export, undo history, activity
  log, shortcuts, widgets gallery and changelog.
- **Workspace.** Command palette, quick capture, in-app toasts, onboarding,
  app-lock PIN, notification centre with delivery diagnostics, and a mini mode.
- **Desktop integration.** Tray icon with a live timer label, close-to-tray and
  minimise-to-tray, launch at startup, pin on top, global shortcuts, a
  main-process notification scheduler with AppUserModelID set before the first
  notification, persistence across restarts and resume handling after sleep.
- **Packaging.** electron-builder for NSIS, portable, DMG and ZIP, AppImage, deb
  and tar.gz on x64 and ARM64, with generated icon set, macOS entitlements,
  published update metadata and SHA-256 checksums.

### Changed

- Timers are now derived from wall-clock timestamps rather than an interval
  counter, so they no longer drift while the window is throttled or hidden.
- Database migrations validate each top-level collection independently: one broken
  record resets that collection only instead of discarding the whole database.

### Fixed

- Starting the app crashed with "useNavigate() may be used only in the context of
  a Router" because the reminder scheduler ran outside the router. The router now
  wraps the effects layer.
- Opening the Todos page or mini mode could blank the window: selectors that
  allocated a new array or object on every call made the store re-render forever.
  They now use stable selectors and shallow comparison.
- Two tools returned "Tool not found" because their catalogue id differed from
  their route slug.
- A corrupt database reported as valid-but-empty; recovery now keeps every
  collection that parses and pins the schema version.
- The scientific calculator built a `Function` from user input. Replaced with a
  recursive-descent parser that rejects anything that is not arithmetic.
- The sound visualiser called `ctx.roundRect` and passed `color-mix()` to a canvas
  fill, neither of which works in a canvas context.
- Placeholder markers left in the Notes, Grades and Analytics sources were replaced
  with real features: a wikilink picker, a school-wide what-if view, and URL-driven
  analytics tabs.

[Unreleased]: https://github.com/opngo/flow/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/opngo/flow/releases/tag/v1.0.0
