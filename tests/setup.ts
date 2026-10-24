import '@testing-library/dom';
import { vi } from 'vitest';

/** jsdom gaps that the app legitimately relies on. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, writable: true });

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({
    clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    closePath() {}, fill() {}, stroke() {}, scale() {}, fillStyle: '', strokeStyle: '', lineWidth: 1,
  }),
  writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: () => Promise.resolve(), writable: true });
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
});
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
