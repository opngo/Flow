# Security policy

## Supported versions

Flow is a local-first desktop app, so "supported" mostly means "the version we
can still ship a fix to". Only the newest release gets patches.

| Version | Supported |
|---|---|
| 1.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting:

https://github.com/opngo/flow/security/advisories/new

Include, as far as you can:

- what the issue is and what it lets an attacker do
- the version, platform and whether you ran the installer or built from source
- reproduction steps or a proof of concept
- any mitigation you already know of

You can expect an acknowledgement within 72 hours and a decision — fix,
out-of-scope, or needs more information — within seven days. If a fix is
warranted, it ships in the next patch release and you are credited in the
release notes unless you ask not to be.

## Scope

Flow's threat model is a desktop application storing personal data in a local
file. In scope:

- the Electron main process, preload bridge and IPC surface
- the renderer: XSS, injection, unsafe rendering of user data
- the packaging pipeline: workflow permissions, release artefacts, supply chain
- the database layer: migration handling, import parsing, data loss
- the landing page

Explicitly out of scope:

- an attacker who already has code execution or read access to your account
- the fact that the database is not encrypted at rest (a documented limitation;
  an encrypted-at-rest option is on the roadmap)
- unsigned installers triggering SmartScreen or Gatekeeper warnings, which is a
  cost issue, not a vulnerability
- vulnerabilities in Electron or Chromium themselves that do not have a released
  fix; report those upstream, and open an issue here so we can bump the version

## What Flow already does

- `contextIsolation: true`, `nodeIntegration: false`, and a narrow preload bridge
  that exposes six specific functions, not a generic IPC passthrough
- `setWindowOpenHandler` denies in-app window creation and sends `http(s)` links
  to the operating system browser instead
- all user-generated content is rendered through React or a markdown parser, and
  the only `dangerouslySetInnerHTML` in the codebase renders locally written notes
- the scientific calculator uses a recursive-descent parser; there is no `eval`
  and no `new Function` anywhere in the codebase
- the renderer never receives a filesystem path it did not choose itself
- release artefacts are built on GitHub runners and published with SHA-256
  checksums in `SHA256SUMS.txt`
- workflows run with least-privilege `permissions:` blocks, and third-party
  actions are pinned to release tags
- CodeQL, dependency review and `npm audit` run on every pull request

## Verifying a download

```sh
sha256sum -c SHA256SUMS.txt --ignore-missing
```

Every release publishes that file next to the installers. If a checksum does not
match, do not run the file, and please tell us.
