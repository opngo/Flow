# One-time GitHub setup for `opngo/flow`

The repository is complete: code, workflows, templates, docs and the landing
page are all in place. These are the steps that only a repository owner can do,
once, in the GitHub UI or with the `gh` CLI.

## 1. Create and push the repository

```sh
# with the gh CLI (recommended — sets the remote and pushes in one go)
gh repo create opngo/flow --public --source=. --remote=origin --push

# or by hand
git init -b main
git add .
git commit -m "feat: Flow 1.0.0 — local-first productivity desktop suite"
git remote add origin git@github.com:opngo/flow.git
git push -u origin main
```

Use `main` as the default branch: `ci.yml`, `pages.yml`, `codeql.yml` and
`nightly.yml` all key off it.

## 2. Turn on GitHub Pages

**Settings, Pages, Build and deployment, Source: GitHub Actions.**

Nothing else is needed. The next push that touches `landing/**` (or a manual run
of the `pages` workflow) publishes the site to:

**https://opngo.github.io/flow/**

The first deploy can take a minute while the Pages environment is created.

## 3. Repository settings worth changing

| Setting | Value | Why |
|---|---|---|
| Settings, General, Default branch | `main` | workflows trigger on it |
| Settings, General, Features, Discussions | on | `config.yml` in the issue templates points there |
| Settings, General, Features, Issues | on | templates are already in `.github/ISSUE_TEMPLATE` |
| Settings, General, Releases | on | `release.yml` publishes here |
| Settings, Security, Private vulnerability reporting | on | `SECURITY.md` links to it |
| Settings, Branches, Branch protection for `main` | require `verify`, `workflows`, `hygiene` | keeps `main` green |
| Settings, Actions, General, Workflow permissions | Read repository contents | the workflows ask for more only where they need it |

Branch protection status checks appear in the list only after each workflow has
run once, so add them after the first push.

## 4. Optional: signing secrets

Only needed for warning-free installers. See [`RELEASING.md`](RELEASING.md).

```sh
gh secret set WIN_CSC_LINK --body "<base64 of your .pfx>"
gh secret set WIN_CSC_KEY_PASSWORD
gh secret set CSC_LINK --body "<base64 of your .p12>"
gh secret set CSC_KEY_PASSWORD
gh secret set APPLE_ID
gh secret set APPLE_APP_SPECIFIC_PASSWORD
gh secret set APPLE_TEAM_ID
```

Nothing fails if these are absent: builds ship unsigned with a one-time prompt.

## 5. Publish 1.0.0

```sh
git tag v1.0.0
git push origin v1.0.0
```

The release workflow packages all three platforms and publishes the release. It
takes about twenty minutes; follow it under the Actions tab. When it finishes,
the landing page picks up the new tag on the next Pages run (push a `landing/**`
change, or run the workflow manually).

## 6. Tell the landing page who you are

Everything is already parameterised for `opngo/flow`:

- `package.json`: `repository`, `homepage` (`https://opngo.github.io/flow/`) and
  `bugs`
- `electron-builder` `publish`: `provider: github`, `owner: opngo`, `repo: flow`
- `scripts/stamp-landing.mjs`: default repo `opngo/flow`
- `landing/index.html`: `__FLOW_REPO__` and `__FLOW_VERSION__` placeholders,
  resolved at deploy time

If the repository is ever renamed or moved to an organisation, change those four
places and re-stamp the landing page.

## 7. Optional: package managers

The landing page offers `winget install opngo.flow` and
`brew install --cask opngo/tap/flow`. Both need a one-off submission outside this
repository — see the last section of [`RELEASING.md`](RELEASING.md). Remove those
two command lines from `landing/index.html` if you would rather not publish them.

## Checklist

- [ ] Repository created under `opngo`, default branch `main`
- [ ] Pages source set to GitHub Actions
- [ ] Discussions enabled
- [ ] Private vulnerability reporting enabled
- [ ] Branch protection on `main` requires the CI jobs
- [ ] First tag pushed, release published with installers and `SHA256SUMS.txt`
- [ ] Landing page reachable at https://opngo.github.io/flow/
- [ ] Installers smoke-tested on at least one real machine per platform
