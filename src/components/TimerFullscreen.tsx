import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { useNavigate } from 'react-router-dom';
import { Icon } from './ui';
import { AppBackdrop } from './Backdrop';
import { bucketSessions } from '../lib/analytics';
import { minsToClock, minsToHM, mixHex, endDrift, cn } from '../lib/utils';

/**
 * Immersive clock — the whole screen becomes the time.
 *
 * Three clocks live here, and only one of them is new machinery:
 *   pomodoro  the existing focus engine (phases, cycle, session logging)
 *   timer     a countdown `Timer` row, so it also shows up in Timers
 *   stopwatch a `Timer` row with laps, elapsed derived from the clock
 *
 * Nothing in this file owns time. Every readout is computed from a stored
 * timestamp, which is why a reload, a lid close or a throttled frame cannot
 * make the display drift.
 *
 * While a clock is running the interface recedes: the chrome fades out and
 * leaves the digits and the progress line alone on the surface. Moving the
 * pointer, or touching the keyboard, brings it back at low opacity.
 */

const SEGMENTS = 48;
/** The arch is a section of a wide ellipse whose ends leave the screen instead
 *  of curling back in. 0deg points right, 90deg down: starting at 168 and
 *  sweeping 204 carries the band off the left edge, over the top, and out the
 *  right edge. */
const ARC_START = 168;
const ARC_SWEEP = 204;
/** The band is divided into sections; the gap is the divider. */
const SECTIONS = 26;
const SECTION_GAP = 16;
/** Band thickness. Half of it is the widest a section corner can round. */
const BAND = 30;
const HALF_BAND = BAND / 2;
const HOVER_HOLD_MS = 2400;

type Mode = 'pomodoro' | 'timer' | 'stopwatch';

const MODES: Array<{ id: Mode; label: string; icon: string }> = [
  { id: 'pomodoro', label: 'Pomodoro', icon: 'Timer' },
  { id: 'timer', label: 'Timer', icon: 'Hourglass' },
  { id: 'stopwatch', label: 'Stopwatch', icon: 'Watch' },
];

/** A point on the arch at t in 0..1 of the sweep. */
function archPoint(cx: number, cy: number, rx: number, ry: number, t: number): [number, number] {
  const a = ((ARC_START + ARC_SWEEP * t) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
}

type Pt = [number, number];

const fmtPt = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const addV = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const subV = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mulV = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const unit = (a: Pt): Pt => {
  const len = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / len, a[1] / len];
};

/**
 * One section of the band, as a filled shape rather than a stroked line: its
 * end corners are rounded by hand so the radius can follow the appearance
 * setting (0 for sharp, up to half the band for a full cap).
 *
 * The path walks the first edge forward, rounds the far cap, walks the second
 * edge back and rounds the near cap, so the start point and the closing point
 * are the same point — no sliver where `Z` closes the shape.
 */
function archSection(cx: number, cy: number, rx: number, ry: number, t0: number, t1: number, corner: number) {
  const steps = Math.max(8, Math.round(Math.abs(t1 - t0) * 900));
  const centre: Pt[] = [];
  for (let i = 0; i <= steps; i++) centre.push(archPoint(cx, cy, rx, ry, t0 + ((t1 - t0) * i) / steps));

  // Side normal per sample, taken from the neighbouring points.
  const normal: Pt[] = centre.map((_, i) => {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(steps, i + 1)];
    return [-unit(subV(b, a))[1], unit(subV(b, a))[0]];
  });

  const a0 = centre.map((p, i) => addV(p, mulV(normal[i], HALF_BAND)));  // first edge
  const a1 = centre.map((p, i) => subV(p, mulV(normal[i], HALF_BAND)));  // second edge

  // A stretch shorter than the corner radius would fold its own caps into a
  // point, so the corners shrink with the section. That is what the trailing
  // partial section needs on the very first frame of a block.
  let span = 0;
  for (let i = 1; i <= steps; i++) span += Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]);
  const k = Math.max(0, Math.min(corner, HALF_BAND, span / 2 - 0.25));
  const n0 = normal[0];
  const nEnd = normal[steps];
  const tStart = unit(subV(centre[1], centre[0]));        // forward at the start
  const tEnd = unit(subV(centre[steps], centre[steps - 1])); // forward at the end

  // Corner offsets, all measured from the sharp vertex.
  const A = a0[0];
  const B = a1[0];
  const C = a1[steps];
  const D = a0[steps];

  let d = `M${fmtPt(addV(A, mulV(tStart, k)))}`;
  for (let i = 1; i < steps; i++) d += `L${fmtPt(a0[i])}`;
  d += `L${fmtPt(subV(D, mulV(tEnd, k)))}`;
  d += `Q${fmtPt(D)} ${fmtPt(subV(D, mulV(nEnd, k)))}`;
  d += `L${fmtPt(addV(C, mulV(nEnd, k)))}`;
  d += `Q${fmtPt(C)} ${fmtPt(subV(C, mulV(tEnd, k)))}`;
  for (let i = steps - 1; i > 0; i--) d += `L${fmtPt(a1[i])}`;
  d += `L${fmtPt(addV(B, mulV(tStart, k)))}`;
  d += `Q${fmtPt(B)} ${fmtPt(addV(B, mulV(n0, k)))}`;
  d += `L${fmtPt(subV(A, mulV(n0, k)))}`;
  d += `Q${fmtPt(A)} ${fmtPt(addV(A, mulV(tStart, k)))}`;
  return `${d}Z`;
}

/** Sampled length of the whole sweep, used to keep the dividers an even width. */
function archLength(cx: number, cy: number, rx: number, ry: number) {
  let len = 0;
  let prev = archPoint(cx, cy, rx, ry, 0);
  for (let i = 1; i <= 720; i++) {
    const p = archPoint(cx, cy, rx, ry, i / 720);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return Math.max(1, len);
}

/** Repaints the component on an interval; every value it feeds is derived
 *  from a timestamp, so this is only a redraw hint, never a clock. */
function useNow(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      force((n) => n + 1);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);
}

const pad2 = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');

/** mm:ss below an hour, h:mm:ss above it. */
function clockText(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Hundredths, for a stopwatch that is actually moving. */
function stopwatchText(ms: number) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

export function TimerFullscreen() {
  const open = useUI((s) => s.immersive);
  const setOpen = useUI((s) => s.setImmersive);
  const mode = useUI((s) => s.immersiveMode);
  const setMode = useUI((s) => s.setImmersiveMode);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();

  const db = useFlow((s) => s.db);
  const startFocus = useFlow((s) => s.startFocus);
  const pauseFocus = useFlow((s) => s.pauseFocus);
  const resumeFocus = useFlow((s) => s.resumeFocus);
  const skipPhase = useFlow((s) => s.skipPhase);
  const extendFocus = useFlow((s) => s.extendFocus);
  const finishPhase = useFlow((s) => s.finishPhase);
  const bumpDistraction = useFlow((s) => s.bumpDistraction);
  const startTimer = useFlow((s) => s.startTimer);
  const pauseTimer = useFlow((s) => s.pauseTimer);
  const resumeTimer = useFlow((s) => s.resumeTimer);
  const finishTimer = useFlow((s) => s.finishTimer);
  const addLap = useFlow((s) => s.addLap);
  const removeTimer = useFlow((s) => s.removeTimer);
  const reduceMotion = useFlow((s) => s.db.settings.behavior.reduceMotion);

  const [hint, setHint] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  /* The countdown is typed straight into the clock face. Two fields, minutes
     and seconds, hold the raw digits so a half-typed number never fights the
     formatting; the millisecond value is derived from them. */
  const [typedMin, setTypedMin] = useState('25');
  const [typedSec, setTypedSec] = useState('00');
  const [editing, setEditing] = useState(false);
  const minRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);
  const typedMs = Math.max(1000, ((Number(typedMin) || 0) * 60 + (Number(typedSec) || 0)) * 1000);
  const customMin = typedMs / 60000;
  const hintTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setHint(text);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 1800);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [setOpen]);

  /* --------------------------------------------------------------- state */

  const f = db.focus;
  const profile =
    db.settings.timerProfiles.find((p) => p.id === (f?.profileId ?? db.settings.activeProfileId)) ??
    db.settings.timerProfiles[0];

  /** The countdown / stopwatch row this screen drives, if any. */
  const liveTimer = useMemo(() => {
    const open = db.timers.filter((t) => !t.finished);
    if (mode === 'stopwatch') return open.filter((t) => t.kind === 'stopwatch').at(-1);
    if (mode === 'timer') return open.filter((t) => t.kind === 'countdown').at(-1);
    return undefined;
  }, [db.timers, mode]);

  /* The countdown clock is the one time you set by hand, and only before it
     exists: once it is running the digits belong to the clock. */
  const editableTime = mode === 'timer' && !liveTimer;

  const pomodoroRunning = !!f?.running;
  const timerRunning = !!liveTimer?.running;
  const running =
    mode === 'pomodoro' ? pomodoroRunning : mode === 'stopwatch' ? timerRunning : timerRunning;

  useNow(open && running);

  const now = Date.now();

  const phase = f?.phase ?? 'focus';
  const totalMin = phase === 'focus' ? profile?.focus ?? 25 : phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;

  const pomodoroLeft = f?.running && f.endsAt ? new Date(f.endsAt).getTime() - now : f?.remainingMs ?? totalMin * 60000;
  const timerLeft = liveTimer
    ? liveTimer.running
      ? Math.max(0, (liveTimer.endsAt ? new Date(liveTimer.endsAt).getTime() : 0) - now)
      : Math.max(0, (liveTimer.endsAt ? new Date(liveTimer.endsAt).getTime() : Date.now() + liveTimer.accumulatedMs) - Date.now())
    : typedMs;
  const elapsedMs = liveTimer
    ? liveTimer.accumulatedMs + (liveTimer.running && liveTimer.startedAt ? now - new Date(liveTimer.startedAt).getTime() : 0)
    : 0;

  const digits =
    mode === 'pomodoro'
      ? minsToClock(pomodoroLeft / 60000)
      : mode === 'timer'
        ? clockText(timerLeft)
        : stopwatchText(elapsedMs);

  const pct =
    mode === 'pomodoro'
      ? Math.min(100, Math.max(0, 100 - (pomodoroLeft / (totalMin * 60000)) * 100))
      : mode === 'timer'
        ? Math.min(100, Math.max(0, 100 - (timerLeft / ((liveTimer?.plannedMin ?? customMin) * 60000)) * 100))
        : Math.min(100, Math.max(0, ((elapsedMs % 60000) / 60000) * 100));

  const task = db.todos.find((t) => t.id === (f?.todoId ?? liveTimer?.todoId));
  const subject = db.subjects.find((s) => s.id === (f?.subjectId ?? liveTimer?.subjectId));

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayMinutes = useMemo(() => bucketSessions(db.focusSessions)[today]?.minutes ?? 0, [db.focusSessions, today]);
  const todaySessions = db.focusSessions.filter((s) => s.kind === 'focus' && format(new Date(s.startedAt), 'yyyy-MM-dd') === today).length;
  const cycle = profile?.sessionsBeforeLong ?? 4;
  const cycleDone = (f?.sessionsDone ?? 0) % cycle;
  const laps = liveTimer?.laps ?? [];

  /* Colour: the arc starts on the theme accent and drifts toward the user's
     end colour over the last stretch of the block. The stopwatch never ends, so
     it keeps one colour. */
  const accentHex = mode === 'pomodoro' && phase !== 'focus' ? '#4ec9a0' : db.settings.theme.accent;
  const immersivePrefs = db.settings.immersive;
  const totalMs = mode === 'pomodoro'
    ? totalMin * 60000
    : mode === 'timer'
      ? (liveTimer?.plannedMin ?? customMin) * 60000
      : 0;
  const remainingForColour = mode === 'pomodoro' ? pomodoroLeft : mode === 'timer' ? timerLeft : totalMs;
  const drift = mode === 'stopwatch' ? 0 : endDrift(remainingForColour, totalMs, immersivePrefs.endAt);
  const accent = mixHex(accentHex, immersivePrefs.endColor, drift);
  const arcColor = accent;
  // The arch is drawn in viewport pixels: a stretched viewBox would thin the
  // stroke unevenly, so the geometry is measured against the real screen.
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Section corners follow the appearance setting: sharp zeroes them, rounded
  // follows the radius slider up to a full round cap.
  const cornerRadius = db.settings.theme.corners === 'sharp'
    ? 0
    : Math.min(HALF_BAND, Math.max(0, db.settings.theme.radius) / 2);

  const geom = useMemo(() => {
    // Wider and taller than the frame: the ends run off the sides rather than
    // turning back toward the middle.
    const cx = vp.w / 2;
    // The band sits below the time: its crown clears the digits and both ends
    // cross the side edges low on the glass instead of turning back.
    const rx = Math.max(220, vp.w * 0.52);
    const ry = Math.max(120, vp.h * 0.34);
    const cy = vp.h * 0.6 + ry;
    const total = archLength(cx, cy, rx, ry);
    const gap = SECTION_GAP / total;
    const sections: string[] = [];
    for (let i = 0; i < SECTIONS; i++) {
      sections.push(archSection(cx, cy, rx, ry, i / SECTIONS + gap / 2, (i + 1) / SECTIONS - gap / 2, cornerRadius));
    }
    // The ends leave the frame, so the playhead is parked at the first and last
    // on-screen point instead of vanishing with them.
    // The band fades out over the outer 7% of the width (see .clock-arc), so the
    // ends dissolve instead of being cut off by the frame edge. The playhead is
    // parked where the band is solid again.
    const margin = vp.w * 0.075 + HALF_BAND + 14;
    let tIn = 0;
    let tOut = 1;
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      const [x, y] = archPoint(cx, cy, rx, ry, t);
      if (x >= margin && x <= vp.w - margin && y >= margin && y <= vp.h - margin) { tIn = t; break; }
    }
    for (let i = 400; i >= 0; i--) {
      const t = i / 400;
      const [x, y] = archPoint(cx, cy, rx, ry, t);
      if (x >= margin && x <= vp.w - margin && y >= margin && y <= vp.h - margin) { tOut = t; break; }
    }
    return { cx, cy, rx, ry, sections, gap, tIn, tOut, total };
  }, [vp.w, vp.h, cornerRadius]);
  const arcFraction = Math.max(0, Math.min(1, pct / 100));
  // Progress is drawn as one continuous shape rather than as sections that
  // switch on: lighting a section at a time meant the bar jumped 1/26th of the
  // sweep every few seconds while the clock itself moved smoothly. A sliver is
  // still suppressed when it is shorter than the band is thick, so the tip
  // never reads as a blob.
  const sliver = arcFraction * geom.total;
  const progressPath = sliver > (mode === 'stopwatch' ? 0 : BAND + 6) && arcFraction > 0
    ? archSection(geom.cx, geom.cy, geom.rx, geom.ry, 0, arcFraction, cornerRadius)
    : null;

  /* ------------------------------------------------------------- actions */

  const start = useCallback(() => {
    if (mode === 'pomodoro') {
      if (f?.remainingMs) resumeFocus();
      else startFocus({ todoId: f?.todoId, subjectId: f?.subjectId, mixId: profile?.mixId });
    } else if (mode === 'timer') {
      if (liveTimer) resumeTimer(liveTimer.id);
      else startTimer({ kind: 'countdown', label: `${clockText(typedMs)} timer`, plannedMin: customMin });
    } else if (liveTimer) {
      resumeTimer(liveTimer.id);
    } else {
      startTimer({ kind: 'stopwatch', label: 'Stopwatch', plannedMin: 0, endsAt: undefined, accumulatedMs: 0, laps: [] });
    }
  }, [mode, f?.remainingMs, f?.todoId, f?.subjectId, profile?.mixId, liveTimer, customMin, resumeFocus, startFocus, resumeTimer, startTimer]);

  const toggle = useCallback(() => {
    if (mode === 'pomodoro') {
      if (pomodoroRunning) { pauseFocus(); flash('Paused'); } else { start(); flash(f?.remainingMs ? 'Resumed' : 'Started'); }
      return;
    }
    if (timerRunning && liveTimer) { pauseTimer(liveTimer.id); flash('Paused'); return; }
    start();
    flash(mode === 'stopwatch' ? (liveTimer ? 'Resumed' : 'Stopwatch running') : 'Started');
  }, [mode, pomodoroRunning, timerRunning, liveTimer, pauseFocus, pauseTimer, start, flash, f?.remainingMs]);

  const resetClock = useCallback(() => {
    if (mode === 'pomodoro') {
      useFlow.getState().resetFocus();
      flash('Reset');
      return;
    }
    if (liveTimer) { removeTimer(liveTimer.id); flash('Cleared'); }
  }, [mode, liveTimer, removeTimer, flash]);

  const logClock = useCallback(() => {
    if (mode === 'pomodoro') { finishPhase(); flash('Session logged'); return; }
    if (liveTimer) { finishTimer(liveTimer.id); flash('Logged'); }
  }, [mode, liveTimer, finishPhase, finishTimer, flash]);

  /* ---------------------------------------------------------------- chrome */

  // Any pointer or key activity reveals the interface for a moment.
  const poke = useCallback(() => {
    setHover(true);
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setHover(false), HOVER_HOLD_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    setHover(true);
    poke();
    return () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
    };
  }, [open, poke]);

  useEffect(() => {
    if (!open) return;
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    }
    const onFsChange = () => { if (!document.fullscreenElement) setOpen(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      poke();
      /* The clock face is a text field now: digits typed into it belong to the
         countdown, not to the mode shortcuts. */
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (e.key === 'Escape') { e.preventDefault(); (target as HTMLInputElement).blur(); }
        return;
      }
      const key = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey) {
        if (key === 'enter') { e.preventDefault(); close(); }
        return;
      }
      if (key === 'escape') { e.preventDefault(); close(); return; }
      if (key === ' ' || key === 'k') { e.preventDefault(); toggle(); return; }
      if (key === 'r') { e.preventDefault(); resetClock(); return; }
      if (key === '1' || key === '2' || key === '3') {
        e.preventDefault();
        setMode(MODES[Number(key) - 1].id);
        return;
      }
      if (mode === 'pomodoro') {
        if (key === 's') { e.preventDefault(); skipPhase(); flash('Skipped'); return; }
        if (key === 'n') { e.preventDefault(); bumpDistraction(); flash('Distraction logged'); return; }
        if (key === 'arrowup' || key === '+' || key === '=') { e.preventDefault(); extendFocus(5); flash('+5 minutes'); return; }
        if (key === 'arrowdown' || key === '-') { e.preventDefault(); extendFocus(-5); flash('-5 minutes'); return; }
        if (key === 'f') { e.preventDefault(); logClock(); return; }
      }
      if (mode === 'stopwatch' && key === 'l' && liveTimer) { e.preventDefault(); addLap(liveTimer.id); flash('Lap'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, toggle, skipPhase, bumpDistraction, extendFocus, logClock, resetClock, flash, mode, liveTimer, addLap, setMode, poke]);

  if (!open) return null;

  const chromeVisible = hover || !running;

  return (
    <div
      className="immersive fixed inset-0 z-[90] flex flex-col"
      data-running={running || undefined}
      data-chrome={chromeVisible ? 'on' : 'off'}
      style={{ background: 'var(--surface)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Immersive timer"
      onPointerMove={poke}
      onPointerDown={poke}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
        <AppBackdrop inFullscreen />
      </div>
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 42%, transparent 30%, color-mix(in srgb, var(--surface) 78%, transparent) 100%)' }} />

      {/* top rail */}
      <div className="immersive-chrome relative flex items-start justify-between gap-4" style={{ padding: 'var(--immersive-pad)' }}>
        <div className="mode-switch" role="tablist" aria-label="Clock type">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => { setMode(m.id); flash(`${m.label} mode`); }}
              className={cn('mode-switch-btn', mode === m.id && 'is-active')}
            >
              <Icon name={m.icon} size={13} />
              {m.label}
              <span className="mode-key">{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => toast({ title: 'Keyboard', body: 'Space start or pause · 1/2/3 switch clock · L lap · R reset · F log · Esc exit' })}
            className="focusable flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Keyboard" size={14} /> Keys
          </button>
          <button onClick={close} className="focusable flex h-8 items-center gap-1.5 rounded-[10px] bg-s1 px-2.5 text-[12px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Minimize2" size={14} /> Exit
            <kbd className="num rounded bg-s2 px-1 py-0.5 text-[10px] text-faint">ESC</kbd>
          </button>
        </div>
      </div>

      {/* the clock */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-7"
        style={{ padding: '0 var(--immersive-pad)' }}>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 h-[52vh] -translate-y-1/2"
          style={{ background: `radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, ${accent} 12%, transparent), transparent 72%)` }} />

        <div className={cn('clock-wrap', running && 'is-running')}>
          <svg className="clock-arc" width={vp.w} height={vp.h} viewBox={`0 0 ${vp.w} ${vp.h}`} aria-hidden="true">
            {geom.sections.map((d, i) => (
              <path key={`track-${i}`} d={d} className="clock-arc-track" />
            ))}
            {progressPath && (
              <path
                d={progressPath}
                className="clock-arc-fill"
                style={{
                  fill: arcColor,
                  filter: drift > 0.15 ? `drop-shadow(0 0 18px ${arcColor})` : undefined,
                }}
              />
            )}
          </svg>

          <div className="clock-face">
            {editableTime ? (
              /* The countdown before it starts is a clock you write into:
                 minutes and seconds are the display itself, so there is no
                 second place to set the same number. */
              <div
                className={cn('immersive-digits clock-time', typedMin.length > 2 && 'is-long')}
                style={{ color: editing ? 'var(--text)' : 'var(--text-muted)' }}
              >
                <input
                  ref={minRef}
                  className="clock-time-field"
                  value={typedMin}
                  inputMode="numeric"
                  aria-label="Countdown minutes"
                  onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
                  onBlur={() => { setEditing(false); setTypedMin((v) => (v === '' ? '0' : v)); }}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 3);
                    setTypedMin(next);
                    if (next.length === 2) secRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); setTypedMin((v) => String(Math.min(999, (Number(v) || 0) + 1))); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setTypedMin((v) => String(Math.max(0, (Number(v) || 0) - 1))); }
                  }}
                  style={{ width: `${Math.max(1, typedMin.length)}ch` }}
                />
                <span className="clock-time-colon" aria-hidden="true">:</span>
                <input
                  ref={secRef}
                  className="clock-time-field"
                  value={typedSec}
                  inputMode="numeric"
                  aria-label="Countdown seconds"
                  onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
                  onBlur={() => { setEditing(false); setTypedSec((v) => String(Math.min(59, Number(v) || 0)).padStart(2, '0')); }}
                  onChange={(e) => setTypedSec(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); setTypedSec((v) => String(Math.min(59, (Number(v) || 0) + 1)).padStart(2, '0')); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setTypedSec((v) => String(Math.max(0, (Number(v) || 0) - 1)).padStart(2, '0')); }
                    if (e.key === 'Backspace' && !typedSec) minRef.current?.focus();
                  }}
                  style={{ width: `${Math.max(2, typedSec.length)}ch` }}
                />
              </div>
            ) : (
              <div
                className={cn('immersive-digits', running && 'is-running', digits.length > 5 && 'is-long', digits.length > 7 && 'is-longer')}
                style={{ color: running ? 'var(--text)' : 'var(--text-muted)' }}
              >
                {digits}
              </div>
            )}
            <div className="immersive-chrome mt-3 flex items-center justify-center gap-2 text-[12px] text-muted">
              {mode === 'pomodoro' && (
                <>
                  <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: running ? arcColor : 'var(--text-faint)' }} />
                    {phase.replace('-', ' ')}
                  </span>
                  <span className="text-faint">·</span>
                  <span>{profile?.name}</span>
                </>
              )}
              {mode === 'timer' && (
                <span className="flex items-center gap-1.5">
                  <Icon name="Hourglass" size={12} />
                  {liveTimer ? liveTimer.label : `${clockText(typedMs)} countdown`}
                </span>
              )}
              {mode === 'stopwatch' && (
                <span className="flex items-center gap-1.5">
                  <Icon name="Watch" size={12} />
                  {laps.length
                    ? `${laps.length} ${laps.length === 1 ? 'lap' : 'laps'} · last ${stopwatchText(laps[laps.length - 1] - (laps[laps.length - 2] ?? 0))}`
                    : 'Counting up'}
                </span>
              )}
              {(task || subject) && <span className="text-faint">·</span>}
              {task && <span className="flex max-w-[280px] items-center gap-1.5 truncate"><Icon name="CheckSquare" size={13} /> {task.title}</span>}
              {subject && (
                <span className="flex items-center gap-1.5" style={{ color: subject.color }}>
                  <Icon name={subject.icon} size={13} /> {subject.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* readouts: hidden along with the rest of the chrome while running */}
      <div className="immersive-chrome relative" style={{ padding: '0 var(--immersive-pad)' }}>
        <div className="mx-auto w-full max-w-[720px]">
          <div className="flex items-center justify-between text-[11px] text-faint">
            {mode === 'pomodoro' && (
              <>
                <span className="num">{Math.round(pct)}% of {totalMin} min</span>
                <span className="flex items-center gap-1.5">
                  {Array.from({ length: cycle }, (_, i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full"
                      style={{ background: i < cycleDone ? arcColor : 'color-mix(in srgb, var(--text-faint) 30%, transparent)' }} />
                  ))}
                  <span className="ml-1">{cycleDone}/{cycle} to a long break</span>
                </span>
              </>
            )}
            {mode === 'timer' && (
              <>
                <span className="num">{clockText(timerLeft)} left</span>
                <span className="num">{clockText((liveTimer?.plannedMin ?? customMin) * 60000)} planned</span>
              </>
            )}
            {mode === 'stopwatch' && (
              <>
                <span className="num">{laps.length} {laps.length === 1 ? 'lap' : 'laps'}</span>
                <span className="num">{todayMinutes ? `${minsToHM(todayMinutes)} logged today` : 'nothing logged yet'}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="immersive-chrome relative" style={{ padding: '0 var(--immersive-pad)' }}>
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-2">
          {mode === 'stopwatch' && laps.length > 0 && (
            <div className="flex max-h-[92px] w-full flex-wrap justify-center gap-1.5 overflow-y-auto no-scrollbar">
              {laps.map((lap, i) => (
                <span key={i} className="num rounded-[8px] px-2 py-1 text-[10.5px] text-muted"
                  style={{ background: 'color-mix(in srgb, var(--surface-1) 70%, transparent)' }}>
                  {String(i + 1).padStart(2, '0')} · {stopwatchText(lap - (laps[i - 1] ?? 0))}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="immersive-chrome relative" style={{ padding: '0 var(--immersive-pad) var(--immersive-pad)' }}>
        <div className="mx-auto flex max-w-[720px] flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={toggle}
              className="focusable flex h-12 items-center gap-2 rounded-[14px] px-6 text-[14px] font-medium"
              style={{ background: accent, color: 'var(--surface)' }}>
              <Icon name={running ? 'Pause' : 'Play'} size={17} />
              {running ? 'Pause' : mode === 'pomodoro' ? (f?.remainingMs ? 'Resume' : 'Start') : liveTimer ? 'Resume' : 'Start'}
            </button>

            {mode === 'pomodoro' && (
              <>
                <button onClick={() => { extendFocus(5); flash('+5 minutes'); }} className="ghost-btn"><Icon name="Plus" size={15} /> 5 min</button>
                <button onClick={() => { skipPhase(); flash('Skipped'); }} className="ghost-btn"><Icon name="SkipForward" size={15} /> Skip</button>
                <button onClick={() => { bumpDistraction(); flash('Distraction logged'); }} className="ghost-btn"><Icon name="CircleAlert" size={15} /> {f?.distractions ?? 0}</button>
              </>
            )}
            {mode === 'stopwatch' && liveTimer && (
              <button onClick={() => { addLap(liveTimer.id); flash('Lap'); }} className="ghost-btn"><Icon name="Flag" size={15} /> Lap</button>
            )}
            <button onClick={resetClock} className="ghost-btn"><Icon name="RotateCcw" size={15} /> {mode === 'pomodoro' ? 'Reset' : 'Clear'}</button>
            <button onClick={logClock} className="ghost-btn"><Icon name="Check" size={15} /> Log</button>
            <button onClick={() => { close(); navigate('/sound'); }} className="ghost-btn" data-tip="Open the sound studio">
              <Icon name="AudioLines" size={15} /> Sound
            </button>
          </div>
          <div className="h-4 text-[11.5px] text-faint" aria-live="polite">{hint ?? ''}</div>
        </div>
      </div>

      {/* footer */}
      <div className="immersive-chrome relative flex flex-wrap items-end justify-between gap-3 text-[11.5px] text-faint"
        style={{ padding: '0 var(--immersive-pad) var(--immersive-pad)' }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><Icon name="Timer" size={12} /> {minsToHM(todayMinutes)} today</span>
          <span className="flex items-center gap-1.5"><Icon name="Flame" size={12} /> {todaySessions} {todaySessions === 1 ? 'session' : 'sessions'}</span>
          {profile?.strict && mode === 'pomodoro' && <span className="flex items-center gap-1.5 text-warning"><Icon name="Lock" size={12} /> strict</span>}
        </div>
        <div className="num flex items-center gap-3">
          <span>{format(new Date(), 'EEE d MMM')}</span>
          <span>{format(new Date(), 'HH:mm')}</span>
        </div>
      </div>
    </div>
  );
}
