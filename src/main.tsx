import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { engine } from './audio/engine';

const el = document.getElementById('root');
if (!el) throw new Error('Flow: missing #root element');

/** Audio contexts may only start after a user gesture; unlock the engine on the
 *  first interaction so presets resume instantly on later launches. */
const unlock = () => {
  engine.ensure();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
