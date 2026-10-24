# Releasing

A release is a tag push. Everything after that is automated by
[`release.yml`](../.github/workflows/release.yml).

## The two-minute version

```sh
# 1. Make sure main is green and up to date
git checkout main && git pull

# 2. Bump the version in package.json and move CHANGELOG's Unreleased section
npm version 1.0.1 --no-git-tag-version
#    edit CHANGELOG.md: "## [1.0.1] - 2026-10-24"

# 3. Commit, tag, push
git commit -am "chore(release): 1.0.1"
git tag v1.0.1
git push origin main --follow-tags
```

The tag push starts the release workflow, which:

1. runs the preflight gates (typecheck, tests, workflow validation),
2. packages on `windows-latest`, `macos-latest` and `ubuntu-latest` in parallel,
3. collects every installer, writes `SHA256SUMS.txt`,
4. generates release notes from `CHANGELOG.md` (falling back to conventional
   commits since the previous tag), and
5. publishes a GitHub Release named `Flow 1.0.1` with the installers attached.

A version containing `alpha`, `beta`, `rc` or `nightly` is published as a
pre-release and does not become "latest".

## Versioning

Semantic versioning, applied to a desktop app:

| Change | Bump | Examples |
|---|---|---|
| Data format change, removed feature, breaking behaviour | **major** | a schema migration that drops a field, renaming a route |
| New feature, new tool, new view | **minor** | interval presets, a new flashcard import format |
| Fixes, copy, styling, dependency bumps | **patch** | timer drift fix, icon set update |

Schema version and app version are separate. `SCHEMA_VERSION` in
`src/lib/types.ts` only changes when the stored shape changes, and every bump
needs an entry in the `migrations` record in `src/lib/repo.ts`.

## Notes that matter

- **The tag and `package.json` must agree.** The preflight job warns, and the
  workflow publishes under the tag name either way, so a mismatch produces a
  release whose artefact filenames disagree with its own tag.
- **CHANGELOG headings are load-bearing.** `release-notes.mjs` matches
  `## [1.0.1] - YYYY-MM-DD` exactly. If it finds nothing, it falls back to commit
  subjects, which produces worse notes for users.
- **A release cannot be re-run into the same tag** without deleting the release
  first. Prefer bumping to the next patch.
- **Nightly tags are disposable.** `nightly.yml` force-moves that tag every day.

## Signing

Unsigned is the default because certificates cost money. When they exist:

| Platform | Secrets | Effect |
|---|---|---|
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Removes the SmartScreen warning; sets the publisher name |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Signs and notarises; no Gatekeeper prompt |

`CSC_IDENTITY_AUTO_DISCOVERY` is set to `false` in the workflow so a machine with
a stray certificate cannot produce a half-signed build. Add the secrets and the
builds sign themselves; no workflow change is needed.

## Publishing the tap and winget (optional)

The landing page tells people `brew install --cask opngo/tap/flow` and
`winget install opngo.flow`. Both need a one-off submission outside this repo:

- **Homebrew cask**: create `opngo/homebrew-tap` containing
  `Casks/flow.rb` with a `url` pointing at the release DMG and its `sha256`.
- **winget**: submit a manifest to `microsoft/winget-pkgs` under
  `manifests/o/opngo/flow/<version>/`.

If you have not published them yet, remove those two lines from
`landing/index.html` so the page does not promise something that does not work.

## After a release

1. Check the landing page: `pages.yml` restamps the download links to the newest
   tag. If it did not run, the page is stale.
2. Smoke-test one installer per platform. The workflows prove packaging works,
   not that the app launches on a real desktop.
3. Update `docs/PROJECT_STATE.md` with what shipped.

## Rolling back

```sh
gh release delete v1.0.1 --yes --cleanup-tag
gh release edit v1.0.0 --latest
```

Then bump to `1.0.2` for the fix. Deleting a release people already installed is
worse than shipping a patch, so prefer the patch.
