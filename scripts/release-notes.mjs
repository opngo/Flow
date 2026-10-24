#!/usr/bin/env node
/**
 * Builds RELEASE_NOTES.md for a release.
 *
 * Sources, in order of trust:
 *   1. the matching "## [version]" section of CHANGELOG.md, if present
 *   2. commit subjects since the previous tag (needs a git checkout with tags)
 *   3. a plain fallback
 *
 * Usage: node scripts/release-notes.mjs --version 1.0.0 [--out RELEASE_NOTES.md]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const version = arg('version', process.env.GITHUB_REF_NAME?.replace(/^v/, '') ?? '0.0.0');
const out = arg('out', 'RELEASE_NOTES.md');
const repo = process.env.GITHUB_REPOSITORY ?? 'opngo/flow';
const isPrerelease = /(alpha|beta|rc|nightly)/.test(version);

/** Pull the changelog section for this version. */
function fromChangelog() {
  if (!existsSync('CHANGELOG.md')) return null;
  const text = readFileSync('CHANGELOG.md', 'utf8');
  const marker = new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?.*$`, 'm');
  const start = text.search(marker);
  if (start < 0) return null;
  const rest = text.slice(start);
  const nextHeading = rest.slice(1).search(/^## /m);
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1);
  // Drop the heading line itself; keep the bullets.
  return section.split('\n').slice(1).join('\n').trim() || null;
}

/** Group conventional-commit subjects into readable sections. */
function fromCommits() {
  let range = '';
  try {
    const prev = execFileSync('git', ['describe', '--tags', '--abbrev=0', 'HEAD^'], { encoding: 'utf8' }).trim();
    range = `${prev}..HEAD`;
  } catch {
    range = 'HEAD';
  }
  let log = '';
  try {
    log = execFileSync('git', ['log', '--no-merges', '--pretty=format:%s', range], { encoding: 'utf8' });
  } catch {
    return null;
  }
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const groups = {
    'Features': [], 'Fixes': [], 'Performance': [], 'Documentation': [], 'Build and CI': [], 'Other changes': [],
  };
  for (const line of lines) {
    const m = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/.exec(line);
    if (!m) { groups['Other changes'].push(clean(line)); continue; }
    const [, type, , subject] = m;
    const text = clean(subject);
    if (type === 'feat') groups.Features.push(text);
    else if (type === 'fix') groups.Fixes.push(text);
    else if (type === 'perf') groups.Performance.push(text);
    else if (type === 'docs') groups.Documentation.push(text);
    else if (['build', 'ci', 'chore', 'test', 'refactor'].includes(type)) groups['Build and CI'].push(text);
    else groups['Other changes'].push(text);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([title, items]) => `### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}`)
    .join('\n\n');
}

const clean = (s) => s.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()).trim();

const body = fromChangelog() ?? fromCommits();

const downloadTable = `
## Downloads

| Platform | File | Notes |
|---|---|---|
| Windows 10/11 | \`Flow-${version}-win-x64.exe\` | NSIS installer, per-user, no admin rights needed |
| Windows (portable) | \`Flow-${version}-portable.exe\` | Single executable, no install |
| Windows on ARM | \`Flow-${version}-win-arm64.exe\` | Snapdragon and other ARM64 devices |
| macOS (Apple silicon) | \`Flow-${version}-mac-arm64.dmg\` | M1 and newer |
| macOS (Intel) | \`Flow-${version}-mac-x64.dmg\` | Intel Macs |
| Linux | \`Flow-${version}-linux-x86_64.AppImage\` | \`chmod +x\` then run |
| Linux (Debian/Ubuntu) | \`Flow-${version}-linux-amd64.deb\` | \`sudo dpkg -i\` |
| Linux (archive) | \`Flow-${version}-linux-x64.tar.gz\` | For other distributions |

Verify a download against \`SHA256SUMS.txt\`:

\`\`\`sh
sha256sum -c SHA256SUMS.txt --ignore-missing
\`\`\`

All installers in this release are unsigned unless noted, so Windows SmartScreen and macOS
Gatekeeper will ask for confirmation on first launch. The app makes no network requests.
`;

const header = isPrerelease
  ? `> **Pre-release.** Built from a development branch. Expect rough edges and back up your data.`
  : `> Local-first: everything stays on your machine. No account, no telemetry, no network calls.`;

const notes = `# Flow ${version}

${header}

${body ?? '- Maintenance build. See the commit history for details.'}

${downloadTable}

---

**Full changelog:** https://github.com/${repo}/compare/v${version}...v${version}
**Report a bug:** https://github.com/${repo}/issues/new/choose
`;

writeFileSync(out, notes);
console.log(`Wrote ${out} (${notes.length} bytes) for v${version}`);
