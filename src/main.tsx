import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useFlow } from './store';

const el = document.getElementById('root');
if (!el) throw new Error('Flow: missing #root element');

/* The database read starts here, before the first render, so it overlaps React's
 * own boot instead of queueing behind it. `init()` is guarded, so the shell's
 * effect joins this same promise rather than loading twice. */
void useFlow.getState().init();

/**
 * Audio contexts may only start after a user gesture. The engine is imported on
 * that first gesture rather than up front: it is a large module (graph, presets,
 * impulse responses) and nothing on the first screen needs it, so keeping it out
 * of the entry chunk is a straight win on launch.
 */
let audioWarm = false;
const unlock = () => {
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
  if (audioWarm) return;
  audioWarm = true;
  void import('./audio/engine').then(({ engine }) => engine.ensure()).catch(() => undefined);
};
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
