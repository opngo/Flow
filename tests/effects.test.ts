import { describe, expect, it } from 'vitest';
import { BAYER_4, EFFECTS, EFFECT_IDS, bayer4, dither, fbm2, getEffect, hash2, noise2 } from '../src/lib/effects';
import { DBSchema, SCHEMA_VERSION } from '../src/lib/types';
import { migrate } from '../src/lib/repo';

describe('backdrop registry', () => {
  it('has unique ids and a usable entry for every id', () => {
    expect(new Set(EFFECT_IDS).size).toBe(EFFECT_IDS.length);
    for (const id of EFFECT_IDS) {
      const meta = getEffect(id);
      expect(meta.id).toBe(id);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(0);
    }
  });

  it('ships with no effect enabled', () => {
    expect(getEffect('none').id).toBe('none');
  });

  it('falls back to none for unknown, empty or missing ids', () => {
    expect(getEffect('nieR').id).toBe('none');
    expect(getEffect('').id).toBe('none');
    expect(getEffect(undefined).id).toBe('none');
  });

  it('only advertises the pixel slider for pixelated effects', () => {
    for (const e of EFFECTS) {
      if (e.usesPixel) expect(e.pixelated).toBe(true);
    }
  });
});

describe('dither maths', () => {
  it('builds a normalised 4x4 Bayer matrix', () => {
    expect(BAYER_4).toHaveLength(4);
    for (const row of BAYER_4) {
      expect(row).toHaveLength(4);
      for (const v of row) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
    expect(new Set(BAYER_4.flat()).size).toBe(16);
  });

  it('wraps coordinates in both directions', () => {
    expect(bayer4(4, 4)).toBe(bayer4(0, 0));
    expect(bayer4(-1, -1)).toBe(bayer4(3, 3));
  });

  it('keeps quantised values inside 0..1 and lands on a level boundary', () => {
    for (let i = 0; i <= 40; i += 1) {
      const v = i / 40;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const q = dither(v, x, y, 5);
          expect(q).toBeGreaterThanOrEqual(0);
          expect(q).toBeLessThanOrEqual(1);
          // 4 steps between 5 levels, so every value is a multiple of 0.25
          expect(Math.abs(q * 4 - Math.round(q * 4))).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('dithers a mid tone into a mix of two levels rather than one flat value', () => {
    const values = new Set<number>();
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) values.add(dither(0.6, x, y, 5));
    expect(values.size).toBe(2);
  });

  it('clamps out-of-range input', () => {
    expect(dither(-3, 0, 0)).toBe(0);
    expect(dither(9, 0, 0)).toBe(1);
  });
});

describe('noise', () => {
  it('hashes deterministically into 0..1', () => {
    expect(hash2(3, 9)).toBe(hash2(3, 9));
    expect(hash2(3, 9)).not.toBe(hash2(9, 3));
    for (let i = 0; i < 500; i += 1) {
      const v = hash2(i, i * 7 + 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('interpolates smoothly between lattice points', () => {
    const a = noise2(1.1, 2.1);
    const b = noise2(1.11, 2.1);
    expect(Math.abs(a - b)).toBeLessThan(0.06);
  });

  it('keeps fbm inside 0..1', () => {
    for (let i = 0; i < 400; i += 1) {
      const v = fbm2(i * 0.37, i * 0.11);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('settings migration to backdrop', () => {
  it('defaults the backdrop block and bumps the schema version', () => {
    expect(SCHEMA_VERSION).toBe(6);
    const db = migrate({ version: 3, todos: [], decks: [], activity: [] });
    expect(db.settings.backdrop).toEqual({
      effect: 'none',
      intensity: 0.55,
      speed: 1,
      pixel: 4,
      inFullscreen: true,
    });
    expect(db.version).toBe(SCHEMA_VERSION);
  });

  it('keeps a user-chosen effect through migration', () => {
    const db = migrate({ version: 3, settings: { backdrop: { effect: 'dither', intensity: 0.8, speed: 1.4, pixel: 6, inFullscreen: false } } });
    expect(db.settings.backdrop.effect).toBe('dither');
    expect(db.settings.backdrop.pixel).toBe(6);
  });

  it('accepts a partial backdrop block and fills the gaps', () => {
    const parsed = DBSchema.parse({ settings: { backdrop: { effect: 'crt' } } });
    expect(parsed.settings.backdrop.effect).toBe('crt');
    expect(parsed.settings.backdrop.intensity).toBe(0.55);
  });
});

describe('settings migration to label density and immersive clock', () => {
  it('defaults the new blocks for a version 4 database', () => {
    const db = migrate({ version: 4, todos: [], decks: [], activity: [] });
    expect(db.settings.ui.labels).toBe('full');
    expect(db.settings.immersive).toEqual({ endColor: '#ef4444', endAt: 25, arc: true });
    expect(db.version).toBe(SCHEMA_VERSION);
  });

  it('keeps a chosen density and end colour through migration', () => {
    const db = migrate({
      version: 4,
      settings: { ui: { labels: 'none' }, immersive: { endColor: '#57c9a0', endAt: 40, arc: false } },
    });
    expect(db.settings.ui.labels).toBe('none');
    expect(db.settings.immersive.endColor).toBe('#57c9a0');
    expect(db.settings.immersive.arc).toBe(false);
  });

  it('rejects a density outside the enum instead of leaking it to the DOM', () => {
    expect(() => DBSchema.parse({ settings: { ui: { labels: 'icon' } } })).toThrow();
  });
});
