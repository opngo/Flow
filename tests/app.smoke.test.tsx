import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { useFlow } from '../src/store';

/** Route table mirrors App.tsx; every destination must render without throwing. */
const ROUTES = [
  ['/', 'Good'], ['/todos', 'Todos'], ['/habits', 'Habits'], ['/goals', 'Goals'],
  ['/focus', 'Focus'], ['/timers', 'Timers'], ['/analytics', 'Analytics'],
  ['/grades', 'Grades'], ['/notes', 'Notes'], ['/flashcards', 'Flashcards'],
  ['/calendar', 'Calendar'], ['/sound', 'Sound'], ['/tools', 'Tools'],
  ['/notifications', 'Notifications'], ['/settings', 'Settings'],
];

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } },
    writable: true,
  });
  Object.defineProperty(globalThis, 'Notification', {
    value: class { static permission = 'default'; static requestPermission = () => Promise.resolve('default'); constructor() {} },
    writable: true,
  });
  Object.defineProperty(globalThis, 'AudioContext', { value: class { state = 'running'; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } createGain() { return { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; } createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0, setTargetAtTime() {} }, Q: { value: 1 }, connect() {}, disconnect() {} }; } createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData() {}, getByteTimeDomainData() {}, connect() {} }; } createBuffer() { return { getChannelData: () => new Float32Array(44100) }; } createBufferSource() { return { buffer: null, loop: false, connect() {}, start() {}, stop() {} }; } createOscillator() { return { frequency: { value: 0 }, type: 'sine', connect() {}, start() {}, stop() {} }; } createStereoPanner() { return { pan: { value: 0, setTargetAtTime() {} }, connect() {} }; } createDynamicsCompressor() { return { connect() {} }; } createConvolver() { return { buffer: null, connect() {} }; } createChannelMerger() { return { connect() {} }; } close() { return Promise.resolve(); } } });
});

afterEach(() => cleanup());

describe('app shell', () => {
  it('boots, seeds the database and renders every route', async () => {
    window.location.hash = '#/';
    render(<App />);

    await waitFor(() => expect(useFlow.getState().ready).toBe(true), { timeout: 8000 });

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.map(String).join(' ')); });

    for (const [route] of ROUTES) {
      window.location.hash = `#${route}`;
      await new Promise((r) => setTimeout(r, 60));
      expect(document.body.textContent?.length ?? 0).toBeGreaterThan(20);
    }

    spy.mockRestore();
    // React logs duplicate-key / invalid-prop warnings through console.error too,
    // so only fail on genuine render exceptions.
    const fatal = errors.filter((e) => /is not a function|Cannot read|undefined is not|Minified React error/.test(e));
    expect(fatal).toEqual([]);
  }, 30000);

  it('seeds a non-empty database', () => {
    const db = useFlow.getState().db;
    expect(db.todos.length).toBeGreaterThan(0);
    expect(db.habits.length).toBeGreaterThan(0);
    expect(db.subjects.length).toBeGreaterThan(0);
    expect(db.settings.timerProfiles.length).toBeGreaterThan(0);
  });
});
