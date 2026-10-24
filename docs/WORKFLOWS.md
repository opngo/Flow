# Workflows

Eight workflows live in [`.github/workflows`](../.github/workflows). All of them
are validated by `npm run verify:workflows`, which CI runs on every pull request:
it parses each file, checks that every step has a name and a pinned action ref,
and that Pages and release jobs declare the permissions their actions need.

## At a glance

| Workflow | Trigger | Runtime | Purpose |
|---|---|---|---|
| `ci.yml` | push to `main`/`dev`, pull request, manual | ~4 min | Typecheck, tests, build, hygiene, audit |
| `release.yml` | tag `v*.*.*`, manual | ~20 min | Package three platforms, publish the release |
| `pages.yml` | push to `main` touching `landing/**`, manual | ~1 min | Deploy the landing page |
| `nightly.yml` | daily 03:00 UTC, manual | ~18 min | Package `main`, move the `nightly` pre-release |
| `codeql.yml` | push, pull request, weekly | ~6 min | Static analysis |
| `dependency-review.yml` | pull request | ~1 min | Block risky new dependencies |
| `lighthouse.yml` | pull request touching `landing/**` | ~2 min | Audit the landing page against a budget |
| `stale.yml` | weekly | ~1 min | Close abandoned issues and pull requests |

## ci.yml

Four jobs, all of which must pass before a pull request is mergeable.

- **verify** — `npm ci`, strict typecheck, the full Vitest suite, a production
  build, bundle-size reporting into the job summary, and the `dist` folder
  uploaded as an artefact for seven days.
- **workflows** — runs `npm run verify:workflows` so a broken YAML file cannot
  land on `main`.
- **hygiene** — three greps that encode project rules: no emoji anywhere in
  source or docs, no `TODO:`/`FIXME:`/`coming soon` in shipped code, and every
  workflow file mentioned in the README (this is why this page exists).
- **audit** — `npm audit --omit=dev --audit-level=high`, allowed to fail so an
  upstream advisory does not block unrelated work.

`concurrency` cancels superseded runs on the same ref, and the top-level
`permissions` is `contents: read`.

## release.yml

Three jobs.

1. **preflight** — resolves the version from the tag or the manual input, warns
   if it disagrees with `package.json`, then runs the gates. Nothing is packaged
   if the tests are red.
2. **build** — a matrix over `windows-latest`, `macos-latest` and
   `ubuntu-latest`. Each installs dependencies, builds the renderer, runs
   `electron-builder --<platform> --publish never`, lists the artefacts into the
   job summary and uploads installers plus update metadata. Linux additionally
   installs `rpm`, `fakeroot` and `libarchive-tools` before packaging.
3. **publish** — downloads all artefacts into one folder, writes
   `SHA256SUMS.txt`, generates `RELEASE_NOTES.md` with `scripts/release-notes.mjs`,
   and creates the GitHub Release.

Signing secrets are read but optional: see [`RELEASING.md`](RELEASING.md).

## pages.yml

Builds the landing page and deploys it to GitHub Pages at
**https://opngo.github.io/flow/**.

- Resolves the newest release tag with `gh release view`, falling back to the
  version in `package.json` when nothing is published yet.
- Runs `scripts/stamp-landing.mjs`, which replaces `__FLOW_VERSION__`,
  `__FLOW_REPO__` and every download URL with the exact asset names that release
  contains, so the page never links to a file that does not exist.
- Asserts the page is self-contained: no external script, stylesheet, font or
  image. That is both a performance budget and a statement of principle.
- Uploads with `actions/upload-pages-artifact` and deploys with
  `actions/deploy-pages`, using the `github-pages` environment.

To enable it once: **Settings, Pages, Source: GitHub Actions**.

## nightly.yml

Runs at 03:00 UTC. Packages `main` on Linux and Windows without publishing them
as releases, uploads them as short-lived artefacts, and force-moves a single
`nightly` pre-release tag. Its purpose is to catch packaging rot between real
releases: if `electron-builder` breaks on a new Node image, you find out the next
morning, not the day you try to ship.

## codeql.yml

Analyses `javascript-typescript` with the `security-and-quality` query pack on
pushes to `main`, on pull requests, and weekly. Findings appear in the Security
tab. It needs `security-events: write`.

## dependency-review.yml

Runs on every pull request. Fails on high-severity advisories and denies
`AGPL-3.0`, `GPL-3.0` and `SSPL-1.0` licences, which are incompatible with
shipping MIT-licensed binaries.

## lighthouse.yml

Audits `landing/` with a static server: performance and best practices at 0.9,
accessibility at 0.95, SEO at 0.9, and size budgets in
[`.github/lighthouse-budget.json`](../.github/lighthouse-budget.json). It is
`continue-on-error`, so a regression is a warning, not a blocker.

## stale.yml

Marks issues stale after 60 days, closes them 21 days later; pull requests at 45
and 14. `pinned`, `security` and `roadmap` are exempt.

## Required secrets

| Secret | Needed by | Required? |
|---|---|---|
| `GITHUB_TOKEN` | all publishing jobs | automatic |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS signing | optional |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarisation | optional |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows signing | optional |

No secret is needed for CI, tests, Pages or a release. Unsigned installers work;
they just prompt once on first launch.

## Local equivalents

```sh
npm run typecheck
npm test
npm run build
npm run verify:workflows
npm run landing:stamp && npm run landing:serve
```

The workflows deliberately run nothing that you cannot run locally, so a red
check is always reproducible on your machine.
