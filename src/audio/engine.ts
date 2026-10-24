/** Procedural Web Audio engine — no audio files anywhere (spec §13).
 *  Noise is generated into looping buffers; nature layers are filtered noise
 *  plus scheduled random events; oscillators are torn down when a layer stops. */

export type LayerKind =
  | 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'grey'
  | 'rain-light' | 'rain-heavy' | 'rain-window' | 'rain-roof' | 'rain-leaves'
  | 'thunder' | 'wind' | 'ocean' | 'stream' | 'fire' | 'crickets' | 'birds' | 'fan'
  | 'train' | 'cafe' | 'typing'
  | 'binaural-delta' | 'binaural-theta' | 'binaural-alpha' | 'binaural-beta' | 'isochronic-alpha';

export type LayerParams = { volume: number; pan: number; tone?: number; randomness?: number; lowpass?: number; highpass?: number; width?: number; lfo?: number };

type LayerNodes = {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  panner: StereoPannerNode;
  filters: BiquadFilterNode[];
  timers: number[];
  lfos: OscillatorNode[];
};

export const LAYER_META: Array<{ kind: LayerKind; label: string; group: string; icon: string; desc: string }> = [
  { kind: 'white', label: 'White noise', group: 'Noise', icon: 'Radio', desc: 'Flat spectrum, masking hiss' },
  { kind: 'pink', label: 'Pink noise', group: 'Noise', icon: 'Radio', desc: 'Softer, natural balance' },
  { kind: 'brown', label: 'Brown noise', group: 'Noise', icon: 'Radio', desc: 'Deep low rumble' },
  { kind: 'blue', label: 'Blue noise', group: 'Noise', icon: 'Radio', desc: 'Bright, airy' },
  { kind: 'violet', label: 'Violet noise', group: 'Noise', icon: 'Radio', desc: 'Sharp high hiss' },
  { kind: 'grey', label: 'Grey noise', group: 'Noise', icon: 'Radio', desc: 'Perceptually flat' },
  { kind: 'rain-light', label: 'Light rain', group: 'Rain', icon: 'CloudRain', desc: 'Soft drizzle' },
  { kind: 'rain-heavy', label: 'Heavy rain', group: 'Rain', icon: 'CloudRain', desc: 'Dense downpour' },
  { kind: 'rain-window', label: 'Rain on window', group: 'Rain', icon: 'CloudRain', desc: 'Taps and drips' },
  { kind: 'rain-roof', label: 'Rain on roof', group: 'Rain', icon: 'CloudRain', desc: 'Broad drumming' },
  { kind: 'rain-leaves', label: 'Rain on leaves', group: 'Rain', icon: 'CloudRain', desc: 'Granular patter' },
  { kind: 'thunder', label: 'Thunder', group: 'Nature', icon: 'CloudLightning', desc: 'Random distant rumbles' },
  { kind: 'wind', label: 'Wind', group: 'Nature', icon: 'Wind', desc: 'Breathing gusts' },
  { kind: 'ocean', label: 'Ocean waves', group: 'Nature', icon: 'Waves', desc: 'Slow swell' },
  { kind: 'stream', label: 'Stream', group: 'Nature', icon: 'Droplet', desc: 'Running water' },
  { kind: 'fire', label: 'Fire crackle', group: 'Nature', icon: 'Flame', desc: 'Crackles and pops' },
  { kind: 'crickets', label: 'Crickets', group: 'Nature', icon: 'Bug', desc: 'Night field' },
  { kind: 'birds', label: 'Birds', group: 'Nature', icon: 'Bird', desc: 'Sparse morning chirps' },
  { kind: 'fan', label: 'Fan', group: 'City', icon: 'Fan', desc: 'Steady airflow hum' },
  { kind: 'train', label: 'Train', group: 'City', icon: 'TrainFront', desc: 'Rolling carriage' },
  { kind: 'cafe', label: 'Cafe murmur', group: 'City', icon: 'Coffee', desc: 'Chatter and clatter' },
  { kind: 'typing', label: 'Keyboard typing', group: 'City', icon: 'Keyboard', desc: 'Random keystrokes' },
  { kind: 'binaural-delta', label: 'Delta 2 Hz', group: 'Tones', icon: 'Headphones', desc: 'Deep sleep — headphones' },
  { kind: 'binaural-theta', label: 'Theta 6 Hz', group: 'Tones', icon: 'Headphones', desc: 'Meditation — headphones' },
  { kind: 'binaural-alpha', label: 'Alpha 10 Hz', group: 'Tones', icon: 'Headphones', desc: 'Calm focus — headphones' },
  { kind: 'binaural-beta', label: 'Beta 18 Hz', group: 'Tones', icon: 'Headphones', desc: 'Alert study — headphones' },
  { kind: 'isochronic-alpha', label: 'Isochronic 10 Hz', group: 'Tones', icon: 'AudioLines', desc: 'Pulsing tone — speakers ok' },
];

function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'grey', seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
    let lastOut = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === 'white') data[i] = white * 0.35;
      else if (color === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (color === 'brown') {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      } else if (color === 'blue') {
        const prev = i > 0 ? data[i - 1] : 0;
        data[i] = (white - prev) * 0.18;
      } else if (color === 'violet') {
        const prev = i > 0 ? data[i - 1] : 0;
        data[i] = (white - prev * 1.4) * 0.16;
      } else {
        // grey: approximate equal-loudness by compensating low frequencies
        const prev = i > 0 ? data[i - 1] : 0;
        data[i] = (white * 0.7 + (white - prev) * 0.5) * 0.22;
      }
    }
  }
  return buffer;
}

export class SoundEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muffle: BiquadFilterNode | null = null;
  analyser: AnalyserNode | null = null;
  private layers = new Map<LayerKind, LayerNodes>();
  private buffers = new Map<string, AudioBuffer>();
  masterVolume = 0.8;
  muted = false;
  sleepTimer: number | null = null;

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 22000;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.muffle);
      this.muffle.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private buffer(color: 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'grey') {
    const ctx = this.ensure();
    const key = color;
    if (!this.buffers.has(key)) this.buffers.set(key, noiseBuffer(ctx, color));
    return this.buffers.get(key)!;
  }

  setMaster(volume: number) {
    this.masterVolume = volume;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : volume, this.ensure().currentTime, 0.05);
  }

  setMuffle(amount: number) {
    if (!this.muffle) return;
    const freq = 22000 - amount * 20500;
    this.muffle.frequency.setTargetAtTime(Math.max(180, freq), this.ensure().currentTime, 0.08);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ensure().currentTime, 0.05);
  }

  /** Duck the master briefly so notification sounds read clearly. */
  duck(ms = 600) {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.masterVolume * 0.35, now + 0.12);
    this.master.gain.linearRampToValueAtTime(this.masterVolume, now + ms / 1000);
  }

  isActive(kind: LayerKind) { return this.layers.has(kind); }
  activeKinds() { return Array.from(this.layers.keys()); }

  start(kind: LayerKind, params: LayerParams) {
    const ctx = this.ensure();
    if (!this.master) return;
    this.stop(kind);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = params.pan ?? 0;
    const filters: BiquadFilterNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];
    const lfos: OscillatorNode[] = [];

    const chain: AudioNode[] = [gain, panner];
    if (params.highpass) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = params.highpass;
      filters.push(hp);
      chain.push(hp);
    }
    if (params.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = params.lowpass;
      filters.push(lp);
      chain.push(lp);
    }
    chain.forEach((node, i) => { if (i < chain.length - 1) node.connect(chain[i + 1]); });
    panner.connect(this.master);

    const noiseSource = (color: 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'grey', extra?: AudioNode) => {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(color);
      src.loop = true;
      if (extra) src.connect(extra); else src.connect(gain);
      src.start();
      sources.push(src);
      return src;
    };

    const lfo = (target: AudioParam, base: number, depth: number, rate: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      target.value = base;
      osc.connect(g);
      g.connect(target);
      osc.start();
      lfos.push(osc);
      return osc;
    };

    const schedule = (fn: () => void, minMs: number, maxMs: number) => {
      const tick = () => {
        if (!this.layers.has(kind)) return;
        fn();
        const id = window.setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
        timers.push(id);
      };
      const id = window.setTimeout(tick, minMs * Math.random());
      timers.push(id);
    };

    const burst = (freq: number, q: number, dur: number, level: number, type: BiquadFilterType = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer('white');
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const env = ctx.createGain();
      env.gain.value = 0;
      src.connect(filter); filter.connect(env); env.connect(gain);
      src.start();
      src.stop(ctx.currentTime + dur + 0.05);
      const t = ctx.currentTime;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(level, t + Math.min(0.05, dur / 3));
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };

    switch (kind) {
      case 'white': case 'pink': case 'brown': case 'blue': case 'violet': case 'grey':
        noiseSource(kind);
        break;
      case 'rain-light':
        noiseSource('pink', undefined);
        lfo(gain.gain, 0, 0.02, 0.07);
        break;
      case 'rain-heavy':
        noiseSource('pink');
        noiseSource('white');
        break;
      case 'rain-window':
        noiseSource('pink');
        schedule(() => burst(1800 + Math.random() * 2400, 8, 0.12, 0.05), 90, 380);
        break;
      case 'rain-roof':
        noiseSource('brown');
        noiseSource('pink');
        schedule(() => burst(600 + Math.random() * 400, 3, 0.2, 0.05), 240, 900);
        break;
      case 'rain-leaves':
        noiseSource('white', undefined);
        schedule(() => burst(3200 + Math.random() * 3000, 12, 0.08, 0.04), 60, 260);
        break;
      case 'thunder':
        schedule(() => {
          const src = ctx.createBufferSource();
          src.buffer = this.buffer('brown');
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 220;
          const env = ctx.createGain();
          env.gain.value = 0;
          src.connect(lp); lp.connect(env); env.connect(gain);
          src.start();
          const t = ctx.currentTime;
          const dur = 1.6 + Math.random() * 2.4;
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.25);
          env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          src.stop(t + dur + 0.1);
        }, 8000, 26000);
        break;
      case 'wind':
        noiseSource('pink');
        lfo(gain.gain, 0.5, 0.35, 0.05);
        break;
      case 'ocean':
        noiseSource('pink');
        noiseSource('brown');
        lfo(gain.gain, 0.5, 0.4, 0.09);
        break;
      case 'stream': {
        // Running water: white noise band-passed around 2.6 kHz, with a slow
        // LFO on the centre frequency so it babbles instead of hissing.
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 2600;
        band.Q.value = 0.9;
        filters.push(band);
        const hiss = ctx.createBiquadFilter();
        hiss.type = 'highpass';
        hiss.frequency.value = 900;
        noiseSource('white', band);
        band.connect(hiss);
        hiss.connect(gain);
        filters.push(hiss);
        lfo(band.frequency, 2600, 900, 0.27);
        break;
      }
      case 'fire':
        noiseSource('brown');
        schedule(() => burst(1200 + Math.random() * 2600, 9, 0.05, 0.12), 60, 420);
        break;
      case 'crickets':
        noiseSource('pink');
        schedule(() => {
          const src = ctx.createBufferSource();
          src.buffer = this.buffer('white');
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 4600;
          bp.Q.value = 18;
          const env = ctx.createGain();
          env.gain.value = 0;
          src.connect(bp); bp.connect(env); env.connect(gain);
          src.start();
          const t = ctx.currentTime;
          for (let i = 0; i < 4; i += 1) {
            env.gain.setValueAtTime(0, t + i * 0.06);
            env.gain.linearRampToValueAtTime(0.25, t + i * 0.06 + 0.012);
            env.gain.linearRampToValueAtTime(0, t + i * 0.06 + 0.05);
          }
          src.stop(t + 0.4);
        }, 700, 2200);
        break;
      case 'birds':
        noiseSource('pink');
        schedule(() => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          const g = ctx.createGain();
          g.gain.value = 0;
          osc.connect(g); g.connect(gain);
          osc.start();
          const t = ctx.currentTime;
          const f0 = 2200 + Math.random() * 1800;
          osc.frequency.setValueAtTime(f0, t);
          osc.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.4), t + 0.14);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.14, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          osc.stop(t + 0.24);
        }, 1500, 6000);
        break;
      case 'fan':
        noiseSource('brown');
        lfo(gain.gain, 0.5, 0.06, 0.35);
        break;
      case 'train':
        noiseSource('brown');
        lfo(gain.gain, 0.5, 0.18, 0.5);
        schedule(() => burst(300, 3, 0.14, 0.05), 380, 700);
        break;
      case 'cafe':
        noiseSource('pink');
        schedule(() => burst(500 + Math.random() * 900, 4, 0.25, 0.05), 300, 1400);
        break;
      case 'typing':
        schedule(() => burst(2200 + Math.random() * 1800, 10, 0.03, 0.1), 90, 300);
        break;
      case 'binaural-delta': case 'binaural-theta': case 'binaural-alpha': case 'binaural-beta': {
        const beats: Record<string, number> = { 'binaural-delta': 2, 'binaural-theta': 6, 'binaural-alpha': 10, 'binaural-beta': 18 };
        const base = 180;
        const beat = beats[kind];
        [-1, 1].forEach((side) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = base + (side > 0 ? beat / 2 : -beat / 2);
          const g = ctx.createGain();
          g.gain.value = 0.16;
          const pan = ctx.createStereoPanner();
          pan.pan.value = side;
          osc.connect(g); g.connect(pan); pan.connect(this.master!);
          osc.start();
          sources.push(osc);
        });
        break;
      }
      case 'isochronic-alpha': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 220;
        const env = ctx.createGain();
        env.gain.value = 0.1;
        const pulse = ctx.createOscillator();
        pulse.frequency.value = 10;
        const depth = ctx.createGain();
        depth.gain.value = 0.1;
        pulse.connect(depth); depth.connect(env.gain);
        osc.connect(env); env.connect(gain);
        osc.start(); pulse.start();
        sources.push(osc);
        lfos.push(pulse);
        break;
      }
      default:
        noiseSource('pink');
    }

    gain.gain.setTargetAtTime(params.volume ?? 0.5, ctx.currentTime, 0.12);
    this.layers.set(kind, { sources, gain, panner, filters, timers, lfos });
  }

  stop(kind: LayerKind) {
    const layer = this.layers.get(kind);
    if (!layer || !this.ctx) return;
    const now = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setTargetAtTime(0, now, 0.08);
    layer.timers.forEach((t) => clearTimeout(t));
    setTimeout(() => {
      layer.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
      layer.lfos.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
      layer.gain.disconnect();
      layer.panner.disconnect();
      layer.filters.forEach((f) => f.disconnect());
    }, 220);
    this.layers.delete(kind);
  }

  stopAll() {
    Array.from(this.layers.keys()).forEach((k) => this.stop(k));
  }

  setVolume(kind: LayerKind, volume: number) {
    const l = this.layers.get(kind);
    if (l && this.ctx) l.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  setPan(kind: LayerKind, pan: number) {
    const l = this.layers.get(kind);
    if (l && this.ctx) l.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05);
  }

  setFilter(kind: LayerKind, which: 'lowpass' | 'highpass', freq: number) {
    const l = this.layers.get(kind);
    if (!l || !this.ctx) return;
    const f = l.filters.find((x) => x.type === which);
    if (f) f.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
  }

  /** Fade to silence over N minutes (sleep timer). */
  fadeOut(minutes: number, onDone?: () => void) {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.masterVolume;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + minutes * 60);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = window.setTimeout(() => {
      this.stopAll();
      this.setMaster(target);
      onDone?.();
    }, minutes * 60000);
  }

  cancelFade() {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  spectrum(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  notificationChime() {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1320, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.55);
  }
}

export const engine = new SoundEngine();
