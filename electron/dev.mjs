/**
 * Runs Vite and Electron together: `npm run electron:dev`.
 *
 * Three things used to make this flaky on a cold machine, and all three are
 * fixed here rather than left to a stopwatch:
 *
 *  - Electron was launched on a fixed 2.5 s timer. A cold Vite start, a slow
 *    disk or a port already in use could beat it, and the window then opened
 *    on ERR_CONNECTION_REFUSED. It now waits for the server to answer.
 *  - `npx` was used for both processes, which can silently decide to download
 *    a package instead of running the local one. Local binaries are resolved
 *    from node_modules directly.
 *  - The server was bound to 127.0.0.1 while Electron was pointed at
 *    `localhost`, which resolves to ::1 first on some machines. One address is
 *    used for both, and it is passed to Electron explicitly.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.FLOW_PORT ?? 5173);
const HOST = '127.0.0.1';
const URL_ = `http://${HOST}:${PORT}`;
const isWin = process.platform === 'win32';

/* Declared up front: the Vite exit handler and shutdown() both look at it, and
   a `const` further down would throw a temporal-dead-zone error there. */
let vite = null;
let electron = null;

/** Resolve a package's CLI next to this repo instead of going through npx. */
function localBin(name) {
  const bin = path.join(root, 'node_modules', '.bin', isWin ? `${name}.cmd` : name);
  return existsSync(bin) ? bin : null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL_, { method: 'GET' });
      if (res.ok) return true;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function shutdown(code = 0) {
  for (const child of [electron, vite]) {
    if (child && !child.killed) {
      try { child.kill(); } catch { /* already gone */ }
    }
  }
  process.exit(code);
}

if (!(await portFree(PORT))) {
  console.error(`\nFlow: port ${PORT} is already in use. Close whatever is on it, or run with FLOW_PORT=<port>.\n`);
  process.exit(1);
}

const viteBin = localBin('vite');
const electronBin = localBin('electron');

if (!viteBin || !electronBin) {
  console.error('\nFlow: dependencies are missing. Run `npm install` first.\n');
  process.exit(1);
}

console.log(`Flow: starting Vite on ${URL_}`);
vite = spawn(viteBin, ['--host', HOST, '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
});

vite.on('exit', (code) => {
  if (code && !electron) console.error(`Flow: Vite exited with code ${code}`);
  if (!electron) shutdown(code ?? 0);
});

if (!(await waitForServer())) {
  console.error(`Flow: Vite never answered on ${URL_}. Giving up instead of opening a blank window.`);
  shutdown(1);
}

console.log('Flow: opening the Electron window');
electron = spawn(electronBin, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FLOW_DEV_URL: URL_ },
  shell: isWin,
});

const startedAt = Date.now();
electron.on('exit', (code) => {
  /* An immediate non-zero exit is almost always the environment, not the code:
     no display, no GTK/AppIndicator, or a sandboxed shell. Say so instead of
     letting the window vanish with no explanation. */
  if (code && Date.now() - startedAt < 5000) {
    console.error(
      `\nFlow: Electron exited immediately (code ${code}).\n` +
      'Flow: this usually means the machine cannot open a window right now — no desktop session,\n' +
      'Flow: or missing system libraries (GTK/AppIndicator on Linux). The browser build still works:\n' +
      'Flow: run `npm run dev` and open the URL it prints.\n',
    );
  }
  shutdown(code ?? 0);
});
electron.on('error', (err) => {
  console.error('Flow: could not launch Electron —', err.message);
  console.error('Flow: try `npm install` again, or run `npm run dev` for the browser version.');
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
