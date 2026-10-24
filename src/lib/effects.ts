/**
 * Backdrop effects — the opt-in atmosphere layer.
 *
 * Everything here is pure: the registry, the dither math and the noise helpers
 * have no DOM dependencies, so they are unit tested in Node and reused by the
 * canvas renderer in `components/Backdrop.tsx`.
 *
 * Effects are deliberately cheap. Each one draws into a small backing store and
 * is scaled up with nearest-neighbour sampling, which is both the look we want
 * (chunky pixels) and the reason it costs nothing on a laptop GPU-less path.
 */

export type EffectId = string;

export type EffectMeta = {
  id: EffectId;
  name: string;
  /** One line, shown under the effect name in Settings. */
  blurb: string;
  /** `css` effects are pure overlays; `canvas` effects run a draw loop. */
  kind: 'css' | 'canvas';
  /** True when the effect renders through a low-resolution pixel buffer. */
  pixelated: boolean;
  /** Whether the "pixel size" slider applies. */
  usesPixel: boolean;
  /** Rough frame cost, used to warn on the heavier ones. */
  cost: 'light' | 'medium';
};

export const EFFECTS: EffectMeta[] = [
  {
    id: 'none',
    name: 'None',
    blurb: 'Flat surfaces, no motion behind the interface.',
    kind: 'css',
    pixelated: false,
    usesPixel: false,
    cost: 'light',
  },
  {
    id: 'crt',
    name: 'CRT wrap',
    blurb: 'Scanlines, aperture grille, curved vignette and a slow rolling band.',
    kind: 'css',
    pixelated: false,
    usesPixel: false,
    cost: 'light',
  },
  {
    id: 'dither',
    name: 'Dither',
    blurb: 'Ordered-dither noise field rendered on a coarse pixel grid.',
    kind: 'canvas',
    pixelated: true,
    usesPixel: true,
    cost: 'medium',
  },
  {
    id: 'grid',
    name: 'Dot grid',
    blurb: 'Parallax dot lattice with a slow travelling highlight.',
    kind: 'canvas',
    pixelated: false,
    usesPixel: false,
    cost: 'light',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Three drifting light fields, heavily softened.',
    kind: 'canvas',
    pixelated: false,
    usesPixel: false,
    cost: 'light',
  },
  {
    id: 'hyperspeed',
    name: 'Hyperspeed',
    blurb: 'Stars streaming out of the centre on a perspective grid.',
    kind: 'canvas',
    pixelated: true,
    usesPixel: true,
    cost: 'medium',
  },
  {
    id: 'silk',
    name: 'Silk',
    blurb: 'Layered sine bands that fold past each other.',
    kind: 'canvas',
    pixelated: false,
    usesPixel: false,
    cost: 'medium',
  },
  {
    id: 'grain',
    name: 'Film grain',
    blurb: 'Static noise at low opacity, for paper rather than glass.',
    kind: 'canvas',
    pixelated: true,
    usesPixel: true,
    cost: 'light',
  },
];

export const EFFECT_IDS: EffectId[] = EFFECTS.map((e) => e.id);

/** Unknown ids (older files, hand-edited settings) fall back to `none`. */
export function getEffect(id: string | undefined): EffectMeta {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];
}

/** 4×4 Bayer matrix, normalised to (0, 1). The classic ordered-dither threshold
 *  map: quantising a field against this produces banded, printable gradients. */
export const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

export function bayer4(x: number, y: number): number {
  return BAYER_4[((y % 4) + 4) % 4][((x % 4) + 4) % 4];
}

/** Quantise `value` in 0..1 against the Bayer threshold for (x, y). */
export function dither(value: number, x: number, y: number, levels = 5): number {
  const steps = Math.max(2, levels) - 1;
  const scaled = Math.min(0.999999, Math.max(0, value)) * steps;
  const base = Math.floor(scaled);
  const frac = scaled - base;
  return (base + (frac > bayer4(x, y) ? 1 : 0)) / steps;
}

/** Deterministic 2D hash in 0..1 — no state, no allocation. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothed value noise built from `hash2`. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Two octaves is plenty for a background; more just costs frames. */
export function fbm2(x: number, y: number): number {
  return noise2(x, y) * 0.65 + noise2(x * 2.17 + 5.2, y * 2.17 + 1.3) * 0.35;
}
