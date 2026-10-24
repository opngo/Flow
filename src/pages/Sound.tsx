import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { create } from 'zustand';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, MenuBtn, Modal, Panel, SectionHead, Segmented,
  Select, Stat, TextInput, Toggle,
} from '../components/ui';
import { engine, LAYER_META, type LayerKind } from '../audio/engine';
import { cn, uuid } from '../lib/utils';
import type { SoundMix } from '../lib/types';

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

export default function Sound() {
  const [params] = useSearchParams();
  const db = useFlow((s) => s.db);
  const saveMix = useFlow((s) => s.saveMix);
  const deleteMix = useFlow((s) => s.deleteMix);
  const toast = useUI((s) => s.toast);
  const sound = useSound();
  const [group, setGroup] = useState<string>('All');
  const [mixName, setMixName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [selected, setSelected] = useState<LayerKind | null>(null);
  const [morphTarget, setMorphTarget] = useState(db.mixes[0]?.id ?? '');

  const groups = ['All', ...Array.from(new Set(LAYER_META.map((l) => l.group)))];

  /** Catalog deep links: /sound?view=presets and ?view=visualizer scroll the
   *  matching panel into view instead of landing at the top of the page. */
  useEffect(() => {
    const view = params.get('view');
    if (!view) return;
    if (view === 'presets') setGroup('All');
    const target = document.getElementById(`sound-${view}`);
    // Some embedders do not ship scrollIntoView; degrade silently rather than throw.
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [params]);

  const activeLayers = sound.active;

  const randomize = () => {
    sound.stopAll();
    const pick = ['brown', 'pink', 'rain-light', 'rain-heavy', 'wind', 'fire', 'ocean', 'cafe'] as LayerKind[];
    pick.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2)).forEach((k) => {
      useSound.getState().toggle(k);
    });
    toast({ title: 'Random mix', body: `${useSound.getState().active.length} layers`, tone: 'success' });
  };

  const save = () => {
    const mix: SoundMix = {
      id: uuid(), name: mixName || 'Untitled mix',
      layers: activeLayers.map((k) => ({ type: k, volume: sound.volumes[k] ?? 0.4, pan: sound.pans[k] ?? 0, params: {}, muted: false, solo: false })),
      masterVolume: sound.master, favorite: false, masterMuffle: sound.muffle,
    };
    saveMix(mix);
    setSaveOpen(false);
    setMixName('');
    toast({ title: 'Mix saved', body: mix.name, tone: 'success' });
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Sound Studio</h1>
          <div className="mt-0.5 text-[12px] text-muted">{activeLayers.length} layers playing · everything synthesised, nothing streamed</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="Shuffle" onClick={randomize}>Randomize</Btn>
          <Btn variant="soft" icon="Save" onClick={() => setSaveOpen(true)}>Save mix</Btn>
          {activeLayers.length > 0 && <Btn variant="danger" icon="Square" onClick={() => sound.stopAll()}>Stop all</Btn>}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Panel className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {groups.map((g) => (
                <button key={g} onClick={() => setGroup(g)} className={cn('focusable chip', group === g && 'text-accent')}
                  style={group === g ? { background: 'var(--accent-soft)' } : undefined}>{g}</button>
              ))}
              <span className="ml-auto text-[11px] text-faint">{LAYER_META.length} generators</span>
            </div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {LAYER_META.filter((l) => group === 'All' || l.group === group).map((l) => {
                const on = activeLayers.includes(l.kind);
                return (
                  <button key={l.kind} onClick={() => sound.toggle(l.kind)}
                    className="focusable flex items-center gap-2.5 rounded-[12px] p-2.5 text-left transition-colors"
                    style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-1)', color: on ? 'var(--accent)' : undefined }}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: on ? 'var(--accent)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-muted)' }}>
                      <Icon name={on ? 'Volume2' : l.icon} size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{l.label}</span>
                      <span className="block truncate text-[10.5px] text-faint">{l.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-3">
            <SectionHead title="Mixer" subtitle="Per-layer volume, pan and tone" right={
              <div className="flex items-center gap-2">
                <Icon name={sound.muted ? 'VolumeX' : 'Volume2'} size={14} className="text-muted" />
                <input type="range" min={0} max={1} step={0.01} value={sound.master} onChange={(e) => { const v = Number(e.target.value); sound.set({ master: v }); engine.setMaster(v); }} className="w-28 accent-[var(--accent)]" aria-label="Master volume" />
                <span className="num w-8 text-right text-[11px] text-faint">{Math.round(sound.master * 100)}</span>
              </div>
            } />
            {!activeLayers.length ? (
              <EmptyState icon="AudioLines" title="No layers yet" body="Turn on a generator above, or load a preset." />
            ) : (
              <div className="space-y-1.5">
                {activeLayers.map((kind) => {
                  const meta = LAYER_META.find((l) => l.kind === kind);
                  const vol = sound.volumes[kind] ?? 0.4;
                  return (
                    <div key={kind} className="flex flex-wrap items-center gap-2 rounded-[11px] bg-s1 px-2.5 py-2">
                      <button onClick={() => sound.toggle(kind)} className="focusable flex h-7 w-7 items-center justify-center rounded-[8px]" style={{ background: 'var(--accent)', color: '#fff' }} aria-label={`Stop ${meta?.label}`}>
                        <Icon name="Pause" size={12} />
                      </button>
                      <span className="w-28 truncate text-[12px]">{meta?.label}</span>
                      <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => sound.setVolume(kind, Number(e.target.value))} className="w-24 accent-[var(--accent)]" aria-label={`${meta?.label} volume`} />
                      <span className="num w-8 text-[10.5px] text-faint">{Math.round(vol * 100)}</span>
                      <span className="text-[10px] text-faint">pan</span>
                      <input type="range" min={-1} max={1} step={0.05} value={sound.pans[kind] ?? 0} onChange={(e) => sound.setPan(kind, Number(e.target.value))} className="w-16 accent-[var(--accent)]" aria-label={`${meta?.label} pan`} />
                      <span className="text-[10px] text-faint">tone</span>
                      <input type="range" min={0} max={1} step={0.02} value={sound.tones[kind] ?? 0.6} onChange={(e) => sound.setTone(kind, Number(e.target.value))} className="w-16 accent-[var(--accent)]" aria-label={`${meta?.label} tone`} />
                      <button onClick={() => { setSelected(kind); }} className="focusable chip ml-auto hover:bg-s3"><Icon name="SlidersHorizontal" size={10} />EQ</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-faint">Muffle</span>
                <input type="range" min={0} max={1} step={0.02} value={sound.muffle} onChange={(e) => { const v = Number(e.target.value); sound.set({ muffle: v }); engine.setMuffle(v); }} className="w-24 accent-[var(--accent)]" aria-label="Master muffle" />
              </div>
              <button onClick={() => { sound.set({ muted: !sound.muted }); engine.setMuted(!sound.muted); }} className={cn('focusable chip', sound.muted && 'text-danger')}>
                <Icon name={sound.muted ? 'VolumeX' : 'Volume2'} size={11} /> {sound.muted ? 'Muted' : 'Mute all'}
              </button>
              <button onClick={() => engine.duck()} className="focusable chip hover:bg-s3"><Icon name="Bell" size={11} />Test duck</button>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-faint">Sleep timer</span>
                <Select
                  value={String(sound.sleepMinutes)}
                  onChange={(v) => {
                    const mins = Number(v);
                    sound.set({ sleepMinutes: mins });
                    if (mins > 0) { engine.fadeOut(mins, () => { useSound.getState().stopAll(); }); toast({ title: `Fading out over ${mins} minutes` }); }
                    else engine.cancelFade();
                  }}
                  options={[{ value: '0', label: 'Off' }, { value: '5', label: '5 min' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '60 min' }]}
                  className="w-24"
                />
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          <div id="sound-visualizer"><Visualizer active={activeLayers.length > 0} /></div>
          <Panel className="p-3">
            <div id="sound-presets" />
            <SectionHead title="Presets" subtitle={`${db.mixes.length} saved mixes`} />
            <div className="space-y-1.5">
              {db.mixes.map((m) => (
                <div key={m.id} className="group flex items-center gap-2 rounded-[11px] bg-s1 p-2">
                  <button onClick={() => { useSound.getState().loadMix(m); toast({ title: `${m.name} loaded`, tone: 'success' }); }} className="focusable flex min-w-0 flex-1 items-center gap-2 text-left">
                    <Icon name="Album" size={14} className="text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{m.name}</span>
                      <span className="block truncate text-[10.5px] text-faint">{m.layers.map((l) => LAYER_META.find((x) => x.kind === l.type)?.label ?? l.type).join(' · ')}</span>
                    </span>
                  </button>
                  <IconBtn icon={m.favorite ? 'Star' : 'Star'} label="Favourite" active={m.favorite} className="h-6 w-6" onClick={() => saveMix({ ...m, favorite: !m.favorite })} />
                  <IconBtn icon="Trash2" label="Delete mix" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteMix(m.id)} />
                </div>
              ))}
              {!db.mixes.length && <div className="py-4 text-center text-[11.5px] text-faint">No presets yet.</div>}
            </div>
            <div className="mt-2 flex gap-1.5">
              <Select value={morphTarget} onChange={setMorphTarget} options={db.mixes.map((m) => ({ value: m.id, label: m.name }))} className="flex-1" />
              <Btn size="sm" variant="soft" icon="Shuffle" onClick={() => {
                const mix = db.mixes.find((m) => m.id === morphTarget);
                if (!mix) return;
                toast({ title: 'Morphing', body: `Blending toward ${mix.name} over 20 seconds` });
                useSound.getState().loadMix(mix);
              }}>Morph</Btn>
            </div>
          </Panel>
          <Panel className="p-3">
            <SectionHead title="Smart linking" subtitle="Auto-play with focus sessions" />
            <div className="space-y-1 text-[11.5px] text-muted">
              <div className="flex items-center gap-2"><Icon name="Timer" size={12} /> Linked profile: {db.settings.timerProfiles.find((p) => p.mixId)?.name ?? 'none'}</div>
              <div className="flex items-center gap-2"><Icon name="Flame" size={12} /> Habits with a mix: {db.habits.filter((h) => h.mixId).length}</div>
              <div className="flex items-center gap-2"><Icon name="Headphones" size={12} /> Binaural tones need headphones</div>
            </div>
            <Btn size="sm" variant="soft" icon="Timer" className="mt-2" onClick={() => { useSound.getState().loadMix(db.mixes[0]); useFlow.getState().startFocus({ mixId: db.mixes[0]?.id }); }}>Start focus with mix</Btn>
          </Panel>
        </div>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this mix" subtitle={`${activeLayers.length} layers`}
        footer={<><Btn variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Btn><Btn variant="primary" icon="Save" onClick={save}>Save mix</Btn></>}>
        <Field label="Name"><TextInput autoFocus value={mixName} onChange={(e) => setMixName(e.target.value)} placeholder="Late night study" /></Field>
        <div className="mt-3 flex flex-wrap gap-1">
          {activeLayers.map((k) => <Chip key={k}>{LAYER_META.find((l) => l.kind === k)?.label}</Chip>)}
        </div>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`${LAYER_META.find((l) => l.kind === selected)?.label ?? 'Layer'} EQ`} subtitle="Shape the layer without touching the mix">
        {selected && (
          <div className="space-y-3">
            {(['lowpass', 'highpass'] as const).map((band) => (
              <Field key={band} label={`${band === 'lowpass' ? 'Low-pass' : 'High-pass'} frequency`}>
                <input type="range" min={band === 'lowpass' ? 300 : 20} max={band === 'lowpass' ? 18000 : 4000} step={20}
                  defaultValue={band === 'lowpass' ? 12000 : 20}
                  onChange={(e) => engine.setFilter(selected, band, Number(e.target.value))}
                  className="w-full accent-[var(--accent)]" />
              </Field>
            ))}
            <div className="rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
              LFO breath modulation and randomness are part of each generator: rain pays attention to randomness, wind and ocean breathe on their own LFOs.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Visualizer({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'bars' | 'wave'>('bars');

  useEffect(() => {
    let raf = 0;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const accent = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c8cff');
      const data = engine.spectrum();
      if (mode === 'bars') {
        const bars = 48;
        const step = Math.floor(data.length / bars) || 1;
        for (let i = 0; i < bars; i += 1) {
          const v = active && data.length ? data[i * step] / 255 : 0.03 + Math.sin((Date.now() / 900) + i / 4) * 0.02;
          const bh = Math.max(2, v * (h - 8));
          ctx.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${(0.25 + v * 0.75).toFixed(3)})`;
          roundedBar(ctx, (i * (w / bars)) + 1, h - bh - 2, (w / bars) - 2, bh, 3);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = `rgb(${accent.r}, ${accent.g}, ${accent.b})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const points = 96;
        for (let i = 0; i < points; i += 1) {
          const v = active && data.length ? data[(i * Math.floor(data.length / points))] / 255 : 0.1 + Math.sin(Date.now() / 400 + i / 6) * 0.05;
          const x = (i / (points - 1)) * w;
          const y = h / 2 + (v - 0.4) * h * 0.7;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, mode]);

  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-medium">Visualizer</span>
        <div className="ml-auto"><Segmented value={mode} onChange={setMode} options={[{ value: 'bars', label: 'Bars' }, { value: 'wave', label: 'Wave' }]} /></div>
      </div>
      <canvas ref={ref} className="h-28 w-full rounded-[12px] bg-s1" />
      <div className="mt-1.5 text-[10.5px] text-faint">Follows your accent colour · analyser runs on the master bus</div>
    </Panel>
  );
}

/** Parse #rgb / #rrggbb / rgb() into channels so canvas never sees color-mix. */
function hexToRgb(value: string): { r: number; g: number; b: number } {
  const v = value.trim();
  if (v.startsWith('rgb')) {
    const nums = v.replace(/[^0-9.,]/g, '').split(',').map(Number);
    return { r: nums[0] ?? 124, g: nums[1] ?? 140, b: nums[2] ?? 255 };
  }
  const hex = v.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.padEnd(6, '0');
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

/** Rounded rectangle path without relying on ctx.roundRect (Chrome 99+ only). */
function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
