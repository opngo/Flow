import { create } from 'zustand';
import { engine, type LayerKind } from '../audio/engine';
import type { SoundMix } from '../lib/types';

/**
 * Sound Studio state, kept out of the page module.
 *
 * It used to live in `pages/Sound.tsx`, which is a lazy route chunk: anything
 * that is not on that page could not reach it without pulling the whole page
 * (and its visualiser) into the boot bundle. The mute action from the tray and
 * the global shortcut needs it, so it lives here instead.
 */
type SoundState = {
  active: LayerKind[];
  volumes: Record<string, number>;
  pans: Record<string, number>;
  tones: Record<string, number>;
  master: number;
  muffle: number;
  muted: boolean;
  sleepMinutes: number;
  set: (patch: Partial<SoundState>) => void;
  toggle: (kind: LayerKind) => void;
  setVolume: (kind: LayerKind, v: number) => void;
  setPan: (kind: LayerKind, v: number) => void;
  setTone: (kind: LayerKind, v: number) => void;
  loadMix: (mix: SoundMix) => void;
  stopAll: () => void;
};

export const useSound = create<SoundState>((set, get) => ({
  active: [],
  volumes: {},
  pans: {},
  tones: {},
  master: 0.8,
  muffle: 0,
  muted: false,
  sleepMinutes: 0,
  set: (patch) => set(patch),
  toggle: (kind) => {
    const { active, volumes } = get();
    if (active.includes(kind)) {
      engine.stop(kind);
      set({ active: active.filter((k) => k !== kind) });
    } else {
      const volume = volumes[kind] ?? 0.4;
      engine.start(kind, { volume, pan: get().pans[kind] ?? 0, tone: get().tones[kind] ?? 0.5 });
      set({ active: [...active, kind] });
    }
  },
  setVolume: (kind, v) => {
    engine.setVolume(kind, v);
    set({ volumes: { ...get().volumes, [kind]: v } });
  },
  setPan: (kind, v) => {
    engine.setPan(kind, v);
    set({ pans: { ...get().pans, [kind]: v } });
  },
  setTone: (kind, v) => {
    engine.setFilter(kind, 'lowpass', 400 + v * 18000);
    set({ tones: { ...get().tones, [kind]: v } });
  },
  loadMix: (mix) => {
    engine.stopAll();
    const volumes: Record<string, number> = {};
    const pans: Record<string, number> = {};
    mix.layers.forEach((l) => {
      volumes[l.type] = l.volume;
      pans[l.type] = l.pan;
      engine.start(l.type as LayerKind, { volume: l.volume, pan: l.pan });
    });
    engine.setMaster(mix.masterVolume);
    engine.setMuffle(mix.masterMuffle);
    set({ active: mix.layers.map((l) => l.type as LayerKind), volumes, pans, master: mix.masterVolume, muffle: mix.masterMuffle });
  },
  stopAll: () => {
    engine.stopAll();
    set({ active: [] });
  },
}));
