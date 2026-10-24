#!/usr/bin/env node
/**
 * Stamps the landing page with the current release.
 *
 * The page is a single self-contained HTML file so it works from a GitHub Pages
 * subpath, from file://, and inside a sandboxed preview iframe with no network.
 * This script replaces the version placeholders and rewrites the download links
 * to the exact release assets, so the page never advertises a file that is not
 * in the release.
 *
 * Usage: node scripts/stamp-landing.mjs [--version 1.0.0] [--repo opngo/flow]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = arg('version', pkg.version).replace(/^v/, '');
const repo = arg('repo', process.env.GITHUB_REPOSITORY ?? 'opngo/flow');
const target = arg('file', 'landing/index.html');

const releaseBase = `https://github.com/${repo}/releases`;

/** Asset names must match electron-builder's artifactName template:
 *  ${productName}-${version}-${os}-${arch}.${ext} */
const assets = {
  win: `${releaseBase}/download/v${version}/Flow-${version}-win-x64.exe`,
  winArm: `${releaseBase}/download/v${version}/Flow-${version}-win-arm64.exe`,
  winPortable: `${releaseBase}/download/v${version}/Flow-${version}-portable.exe`,
  macArm: `${releaseBase}/download/v${version}/Flow-${version}-mac-arm64.dmg`,
  macIntel: `${releaseBase}/download/v${version}/Flow-${version}-mac-x64.dmg`,
  linuxAppImage: `${releaseBase}/download/v${version}/Flow-${version}-linux-x86_64.AppImage`,
  linuxDeb: `${releaseBase}/download/v${version}/Flow-${version}-linux-amd64.deb`,
  sums: `${releaseBase}/download/v${version}/SHA256SUMS.txt`,
};

let html = readFileSync(target, 'utf8');
const before = html;

html = html
  .replaceAll('__FLOW_VERSION__', version)
  .replaceAll('__FLOW_REPO__', repo)
  .replaceAll('__FLOW_RELEASE_URL__', `${releaseBase}/latest`)
  .replaceAll('__FLOW_TAG_URL__', `${releaseBase}/tag/v${version}`);

// Version references are normalised even when the placeholders are already
// gone: the page is committed with real values so it renders correctly when
// opened from disk, and this step moves them forward on every release.
html = html
  .replace(/(releases\/download\/)v\d+\.\d+\.\d+/g, `$1v${version}`)
  .replace(/(releases\/tag\/)v\d+\.\d+\.\d+/g, `$1v${version}`)
  .replace(/(Flow-)\d+\.\d+\.\d+/g, `$1${version}`)
  .replace(/(<span[^>]*data-version[^>]*>)\s*v?\d+\.\d+\.\d+\s*(<\/span>)/g, `$1${version}$2`);

// Any remaining data-download="key" anchor gets its href resolved.
for (const [key, href] of Object.entries(assets)) {
  html = html.replace(new RegExp(`(<a[^>]*data-download="${key}"[^>]*href=")[^"]*(")`, 'g'), `$1${href}$2`);
  html = html.replace(new RegExp(`(<a[^>]*href=")[^"]*("[^>]*data-download="${key}")`, 'g'), `$1${href}$2`);
}

if (html === before) {
  console.warn('stamp-landing: nothing changed — placeholders already resolved?');
}

writeFileSync(target, html);
console.log(`Stamped ${target} for v${version} (repo ${repo})`);
