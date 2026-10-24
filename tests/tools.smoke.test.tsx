import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import App from '../src/App';
import { NAV, TOOLS } from '../src/lib/nav';
import { useFlow } from '../src/store';

const TOOL_ROUTES = TOOLS.filter((t) => t.route.startsWith('/tools/'));
const VIEW_ROUTES = TOOLS.filter((t) => !t.route.startsWith('/tools/') && t.route.includes('?'));

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }, writable: true,
  });
  Object.defineProperty(globalThis, 'Notification', {
    value: class { static permission = 'denied'; static requestPermission = () => Promise.resolve('denied'); constructor() {} }, writable: true,
  });
});

afterEach(() => cleanup());

describe('tool host', () => {
  it(`renders all ${TOOL_ROUTES.length} tool pages`, async () => {
    window.location.hash = '#/tools';
    render(<App />);
    await waitFor(() => expect(useFlow.getState().ready).toBe(true), { timeout: 8000 });

    const failures: string[] = [];
    for (const tool of TOOL_ROUTES) {
      window.location.hash = `#${tool.route}`;
      // AnimatePresence runs a 180ms exit before the next page mounts, so the
      // assertion has to wait for that, then look for the tool's own name.
      await new Promise((r) => setTimeout(r, 400));
      const slug = tool.route.replace('/tools/', '');
      if (!document.querySelector(`[data-tool="${slug}"]`)) failures.push(tool.route);
    }
    expect(failures.join('\n')).toBe('');
  }, 60000);

  it('renders catalog routes that point at page views', async () => {
    window.location.hash = '#/tools';
    render(<App />);
    await waitFor(() => expect(useFlow.getState().ready).toBe(true), { timeout: 8000 });
    const failures: string[] = [];
    for (const tool of VIEW_ROUTES) {
      window.location.hash = `#${tool.route}`;
      await new Promise((r) => setTimeout(r, 400));
      // The page heading must be the destination's own title, which proves the
      // router actually left the previous page rather than showing stale DOM.
      const path = tool.route.split('?')[0];
      const label = NAV.find((n) => n.route === path)?.label ?? '';
      const text = document.body.textContent ?? '';
      if (!label || !text.includes(label)) failures.push(`${tool.route} (expected "${label}")`);
    }
    expect(failures.join('\n')).toBe('');
  }, 30000);
});
