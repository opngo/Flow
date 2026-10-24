#!/usr/bin/env node
/**
 * Validates every GitHub Actions workflow in .github/workflows.
 *
 * Runs in CI on every pull request so a broken YAML file, a typo'd trigger or a
 * missing `permissions` block fails fast instead of silently never running.
 * Deliberately dependency-light: it reuses the `yaml` package that ships with
 * Vite/PostCSS rather than pulling in actionlint.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const DIR = '.github/workflows';
const problems = [];
const summary = [];

if (!existsSync(DIR)) {
  console.error(`missing ${DIR}`);
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();

/** Actions that need explicit repository permissions to work. */
const NEEDS_PAGES = /actions\/(configure-pages|deploy-pages|upload-pages-artifact)/;

for (const file of files) {
  const path = join(DIR, file);
  const raw = readFileSync(path, 'utf8');
  let doc;
  try {
    doc = parse(raw);
  } catch (err) {
    problems.push(`${file}: invalid YAML — ${err.message}`);
    continue;
  }

  if (!doc || typeof doc !== 'object') {
    problems.push(`${file}: empty document`);
    continue;
  }
  if (!doc.name) problems.push(`${file}: missing top-level "name"`);
  const on = doc.on ?? doc.true; // `on:` parses as boolean true under YAML 1.1
  if (!on) problems.push(`${file}: missing "on" trigger`);
  if (!doc.jobs || typeof doc.jobs !== 'object') {
    problems.push(`${file}: missing "jobs"`);
    continue;
  }

  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (!job || typeof job !== 'object') {
      problems.push(`${file}: job "${jobId}" is not a mapping`);
      continue;
    }
    if (!job['runs-on'] && !job.uses) problems.push(`${file}: job "${jobId}" has no runs-on/uses`);
    const steps = job.steps ?? [];
    if (!Array.isArray(steps) || steps.length === 0) {
      problems.push(`${file}: job "${jobId}" has no steps`);
      continue;
    }
    steps.forEach((step, i) => {
      const where = `${file} → ${jobId}[${i}]`;
      if (!step || typeof step !== 'object') {
        problems.push(`${where}: step is not a mapping`);
        return;
      }
      if (!step.name && !step.uses && !step.run) problems.push(`${where}: step has no name/uses/run`);
      if (step.uses && !/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[\w.+-]+$/.test(step.uses)) {
        problems.push(`${where}: "${step.uses}" is not pinned to a ref`);
      }
      if (step.uses && /@(main|master|HEAD)$/.test(step.uses)) {
        problems.push(`${where}: "${step.uses}" is pinned to a branch — pin a tag or SHA`);
      }
      if (step.run && step.shell === undefined && /\|\s*$/.test(step.run.trim())) {
        problems.push(`${where}: multi-line run block without a shell`);
      }
    });
  }

  // Pages workflows must declare the permissions the Pages actions require.
  if (NEEDS_PAGES.test(raw)) {
    const perms = doc.permissions ?? {};
    for (const needed of ['pages', 'id-token']) {
      if (perms[needed] !== 'write') problems.push(`${file}: uses Pages actions but permissions.${needed} is not "write"`);
    }
  }

  // Release workflows that publish artifacts need contents: write.
  // Only actual publishing commands need write access; `gh release view` needs none.
  const publishes = /action-gh-release|gh release (create|upload|edit|delete)/.test(raw);
  if (publishes && (doc.permissions?.contents ?? 'write') !== 'write') {
    problems.push(`${file}: publishes a release but permissions.contents is not "write"`);
  }

  summary.push(`${file.padEnd(28)} ${Object.keys(doc.jobs).length} job(s), triggers: ${describeTriggers(on)}`);
}

function describeTriggers(on) {
  if (typeof on === 'string') return on;
  if (Array.isArray(on)) return on.join(', ');
  if (!on || typeof on !== 'object') return 'unknown';
  return Object.keys(on)
    .map((k) => (k === 'schedule' ? `cron(${(on.schedule ?? []).map((s) => s.cron).join('|')})` : k))
    .join(', ');
}

console.log(summary.join('\n'));

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\nAll ${files.length} workflow files valid.`);
