/** Runs Vite and Electron together: `npm run electron:dev`. */
import { spawn } from 'node:child_process';

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], { stdio: 'inherit', shell: process.platform === 'win32' });

setTimeout(() => {
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    env: { ...process.env, FLOW_DEV_URL: 'http://localhost:5173' },
    shell: process.platform === 'win32',
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}, 2500);

process.on('SIGINT', () => { vite.kill(); process.exit(0); });
