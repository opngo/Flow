import { useEffect, useMemo, useRef } from 'react';
import { useFlow } from '../store';
import { dither, fbm2, getEffect, hash2, type EffectId } from '../lib/effects';
import { cn } from '../lib/utils';

export type BackdropProps = {
  effect: EffectId;
  /** 0..1 — how present the layer is. */
  intensity: number;
  /** Multiplier on the animation clock. 0 freezes the frame. */
  speed: number;
  /** Cell size in CSS pixels for the pixelated effects. */
  pixel: number;
  /** Freeze (reduced motion, backgrounded window, settings preview). */
  paused?: boolean;
  className?: string;
};

type DrawOpts = { intensity: number; accent: string; pixel: number };

const MAX_CELLS = 24000;
const FPS_CAP = 30;

/** Pull a CSS custom property so the backdrop always matches the active theme. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* ------------------------------------------------------------------ */
/* Renderers. Each one gets a low-resolution context and draws in its   */
/* own coordinate space; the CSS upscale does the rest.                 */
/* ------------------------------------------------------------------ */

function drawDither(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const tone = o.accent;
  const rgb = hexToRgb(tone);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const field = fbm2(x * 0.055 + t * 0.22, y * 0.075 - t * 0.14);
      // bias the field so the effect reads as a gradient, not a grey wall
      const shaped = Math.pow(field, 1.7) * 1.35;
      const value = dither(shaped, x, y, 5);
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = Math.round(value * 255 * (0.16 + 0.5 * o.intensity));
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  ctx.clearRect(0, 0, w, h);
  const step = 14;
  const cx = w * (0.5 + Math.sin(t * 0.11) * 0.3);
  const cy = h * (0.5 + Math.cos(t * 0.09) * 0.28);
  const radius = Math.min(w, h) * 0.55;
  ctx.fillStyle = o.accent;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      const glow = Math.max(0, 1 - d);
      // breathing dots: two phases so the lattice never pulses in lockstep
      const breathe = 0.55 + 0.45 * Math.sin(t * 1.4 + x * 0.12 + y * 0.07);
      ctx.globalAlpha = (0.05 + glow * glow * 0.55 * breathe) * o.intensity;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  ctx.clearRect(0, 0, w, h);
  const blobs = [
    { x: 0.28 + Math.sin(t * 0.13) * 0.14, y: 0.36 + Math.cos(t * 0.17) * 0.12, r: 0.62, c: o.accent },
    { x: 0.68 + Math.cos(t * 0.11 + 1.7) * 0.16, y: 0.58 + Math.sin(t * 0.15) * 0.14, r: 0.55, c: '#4ec9a0' },
    { x: 0.5 + Math.sin(t * 0.07 + 3.1) * 0.22, y: 0.8 + Math.cos(t * 0.12) * 0.1, r: 0.48, c: '#e5b567' },
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, Math.max(w, h) * b.r);
    g.addColorStop(0, hexToRgba(b.c, 0.5 * o.intensity));
    g.addColorStop(1, hexToRgba(b.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawHyperspeed(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(cx, cy);
  const count = Math.round(90 + 120 * o.intensity);
  ctx.strokeStyle = o.accent;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    const angle = hash2(i, 7) * Math.PI * 2;
    const seed = hash2(i, 31);
    // z cycles 0..1; stars accelerate as they approach the viewer
    const z = ((seed + t * (0.14 + seed * 0.1)) % 1);
    const r = Math.pow(z, 2.4) * maxR;
    const tail = Math.max(0, r - (3 + 26 * z * z * (0.4 + o.intensity)));
    ctx.globalAlpha = Math.min(1, z * 1.6) * (0.12 + 0.55 * o.intensity);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * tail, cy + Math.sin(angle) * tail);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSilk(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  ctx.clearRect(0, 0, w, h);
  const bands = 7;
  for (let i = 0; i < bands; i += 1) {
    const p = i / (bands - 1);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const u = x / w;
      const y =
        h * (0.18 + p * 0.64) +
        Math.sin(u * 5.2 + t * 0.7 + i * 0.9) * h * 0.055 +
        Math.sin(u * 11.7 - t * 0.45 + i * 1.6) * h * 0.022;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 2 ? o.accent : '#4ec9a0';
    ctx.globalAlpha = (0.12 + 0.3 * o.intensity) * (0.5 + 0.5 * Math.sin(p * Math.PI));
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) {
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const frame = Math.floor(t * 12);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const n = hash2(x + frame * 37, y - frame * 11);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = n > 0.86 ? Math.round(28 * o.intensity) : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: DrawOpts) => void> = {
  dither: drawDither,
  grid: drawGrid,
  aurora: drawAurora,
  hyperspeed: drawHyperspeed,
  silk: drawSilk,
  grain: drawGrain,
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const [r, g, b] = clean.split('').map((c) => parseInt(c + c, 16));
    return [r || 0, g || 0, b || 0];
  }
  const value = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(value)) return [124, 140, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function Backdrop({ effect, intensity, speed, pixel, paused = false, className }: BackdropProps) {
  const meta = getEffect(effect);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const accent = useMemo(() => (typeof window === 'undefined' ? '#7c8cff' : token('--accent', '#7c8cff')), [effect]);
  const reduceMotion = useFlow((s) => s.db.settings.behavior.reduceMotion);
  const frozen = paused || reduceMotion || meta.kind === 'css';

  useEffect(() => {
    if (meta.kind !== 'canvas') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = RENDERERS[meta.id];
    if (!render) return;

    let raf = 0;
    let stopped = false;
    let last = 0;
    let clock = 0;
    const cell = Math.max(2, Math.min(12, Math.round(pixel)));

    const size = () => {
      const parent = canvas.parentElement;
      const cssW = parent?.clientWidth || window.innerWidth;
      const cssH = parent?.clientHeight || window.innerHeight;
      // Pixelated effects use `cell` CSS pixels per buffer pixel; the smooth
      // ones use 2 so gradients do not band on a wide monitor.
      let scale = meta.pixelated ? cell : 2;
      let w = Math.max(1, Math.ceil(cssW / scale));
      let h = Math.max(1, Math.ceil(cssH / scale));
      while (w * h > MAX_CELLS) {
        scale += 1;
        w = Math.max(1, Math.ceil(cssW / scale));
        h = Math.max(1, Math.ceil(cssH / scale));
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return { w, h };
    };

    let dims = size();
    const draw = (t: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = !meta.pixelated;
      ctx.clearRect(0, 0, dims.w, dims.h);
      render(ctx, dims.w, dims.h, t, { intensity, accent, pixel: cell });
    };

    const loop = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const minDelta = 1000 / FPS_CAP;
      if (now - last < minDelta) return;
      const dt = last ? Math.min(now - last, 120) : minDelta;
      last = now;
      clock += (dt / 1000) * speed;
      draw(clock);
    };

    const ro = new ResizeObserver(() => {
      dims = size();
      draw(clock);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    draw(0);
    if (!frozen && speed > 0) raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!stopped && !frozen && speed > 0) {
        last = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [meta.id, meta.kind, meta.pixelated, intensity, speed, pixel, frozen, accent]);

  if (meta.id === 'none') return null;

  const wrapper = cn('pointer-events-none absolute inset-0 overflow-hidden', className);

  if (meta.kind === 'css') {
    const strength = 0.35 + 0.65 * Math.max(0, Math.min(1, intensity));
    return (
      <div className={wrapper} aria-hidden="true" data-backdrop="crt" style={{ opacity: strength }}>
        <div className="flow-crt-scanlines absolute inset-0" />
        <div className="flow-crt-grille absolute inset-0" />
        <div className="flow-crt-vignette absolute inset-0" />
        <div className="flow-crt-roll absolute inset-x-0" style={{ animationDuration: `${9 / Math.max(0.2, speed)}s` }} />
      </div>
    );
  }

  return (
    <div className={wrapper} aria-hidden="true" data-backdrop={meta.id}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: meta.pixelated ? 'pixelated' : 'auto' }}
      />
    </div>
  );
}

/** The app-wide layer: reads settings, honours reduced motion. */
export function AppBackdrop({ inFullscreen = false }: { inFullscreen?: boolean }) {
  const backdrop = useFlow((s) => s.db.settings.backdrop);
  const effect = getEffect(backdrop.effect);
  if (effect.id === 'none') return null;
  if (inFullscreen && !backdrop.inFullscreen) return null;
  return (
    <Backdrop
      effect={effect.id}
      intensity={backdrop.intensity}
      speed={backdrop.speed}
      pixel={backdrop.pixel}
    />
  );
}
