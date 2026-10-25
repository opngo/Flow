import { create } from 'zustand';
import type { LayerKind } from '../audio/engine';

/**
 * The audio graph is imported the first time a sound action actually runs.
 *
 * `useSound` is reached from the shell (the mute action on the tray menu and the
 * global shortcut), so a static import here dragged the whole engine into the
 * entry chunk — a module nothing on the first screen needs. Every call below is
 * already the result of a click or a keypress, which is also when an audio
 * context is allowed to start, so the load has nowhere better to go.
 */
let audio: Promise<typeof import('../audio/engine')> | null = null;
const withEngine = (run: (e: import('../audio/engine').SoundEngine) => void) => {
  audio ??= import('../audio/engine');
  void audio.then(({ engine }) => { try { run(engine); } catch { /* audio is optional */ } }).catch(() => undefined);
};
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
      withEngine((e) => e.stop(kind));
      set({ active: active.filter((k) => k !== kind) });
    } else {
      const volume = volumes[kind] ?? 0.4;
      withEngine((e) => e.start(kind, { volume, pan: get().pans[kind] ?? 0, tone: get().tones[kind] ?? 0.5 }));
      set({ active: [...active, kind] });
    }
  },
  setVolume: (kind, v) => {
    withEngine((e) => e.setVolume(kind, v));
    set({ volumes: { ...get().volumes, [kind]: v } });
  },
  setPan: (kind, v) => {
    withEngine((e) => e.setPan(kind, v));
    set({ pans: { ...get().pans, [kind]: v } });
  },
  setTone: (kind, v) => {
    withEngine((e) => e.setFilter(kind, 'lowpass', 400 + v * 18000));
    set({ tones: { ...get().tones, [kind]: v } });
  },
  loadMix: (mix) => {
    withEngine((e) => e.stopAll());
    const volumes: Record<string, number> = {};
    const pans: Record<string, number> = {};
    mix.layers.forEach((l) => {
      volumes[l.type] = l.volume;
      pans[l.type] = l.pan;
      withEngine((e) => e.start(l.type as LayerKind, { volume: l.volume, pan: l.pan }));
    });
    withEngine((e) => e.setMaster(mix.masterVolume));
    withEngine((e) => e.setMuffle(mix.masterMuffle));
    set({ active: mix.layers.map((l) => l.type as LayerKind), volumes, pans, master: mix.masterVolume, muffle: mix.masterMuffle });
  },
  stopAll: () => {
    withEngine((e) => e.stopAll());
    set({ active: [] });
  },
}));
