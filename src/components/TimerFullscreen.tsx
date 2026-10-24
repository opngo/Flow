import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Icon } from './ui';
import { AppBackdrop } from './Backdrop';
import { bucketSessions } from '../lib/analytics';
import { minsToClock, minsToHM } from '../lib/utils';

/**
 * Immersive timer — the whole screen becomes the clock.
 *
 * Rules it follows from the spec: timers derive from wall-clock timestamps, so
 * this view is just another projection of `db.focus`; nothing here owns time.
 * Native fullscreen is requested on open and released on close, and it is
 * entirely optional: if the platform refuses, the overlay still fills the
 * window.
 */

const SEGMENTS = 44;

export function TimerFullscreen() {
  const open = useUI((s) => s.immersive);
  const setOpen = useUI((s) => s.setImmersive);
  const db = useFlow((s) => s.db);
  const startFocus = useFlow((s) => s.startFocus);
  const pauseFocus = useFlow((s) => s.pauseFocus);
  const resumeFocus = useFlow((s) => s.resumeFocus);
  const skipPhase = useFlow((s) => s.skipPhase);
  const extendFocus = useFlow((s) => s.extendFocus);
  const finishPhase = useFlow((s) => s.finishPhase);
  const bumpDistraction = useFlow((s) => s.bumpDistraction);
  const reduceMotion = useFlow((s) => s.db.settings.behavior.reduceMotion);
  const toast = useUI((s) => s.toast);

  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setHint(text);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 1600);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [setOpen]);

  // Ask for native fullscreen once. Any refusal is fine; the overlay covers the
  // window either way.
  useEffect(() => {
    if (!open) return;
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) setOpen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [open, setOpen]);

  const f = db.focus;
  const profile =
    db.settings.timerProfiles.find((p) => p.id === (f?.profileId ?? db.settings.activeProfileId)) ??
    db.settings.timerProfiles[0];
  const phase = f?.phase ?? 'focus';
  const totalMin = phase === 'focus' ? profile?.focus ?? 25 : phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15;
  const remainingMs = f?.running && f.endsAt ? new Date(f.endsAt).getTime() - Date.now() : f?.remainingMs ?? totalMin * 60000;
  const running = !!f?.running;
  const pct = Math.min(100, Math.max(0, 100 - (remainingMs / (totalMin * 60000)) * 100));
  const filled = Math.round((pct / 100) * SEGMENTS);
  const task = db.todos.find((t) => t.id === f?.todoId);
  const subject = db.subjects.find((s) => s.id === f?.subjectId);
  const phaseColor = phase === 'focus' ? 'var(--accent)' : 'var(--success)';

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayMinutes = useMemo(() => bucketSessions(db.focusSessions)[today]?.minutes ?? 0, [db.focusSessions, today]);
  const cycle = profile?.sessionsBeforeLong ?? 4;
  const cycleDone = (f?.sessionsDone ?? 0) % cycle;

  const toggle = useCallback(() => {
    if (running) {
      pauseFocus();
      flash('Paused');
    } else if (f?.remainingMs) {
      resumeFocus();
      flash('Resumed');
    } else {
      startFocus({ todoId: f?.todoId, subjectId: f?.subjectId, mixId: profile?.mixId });
      flash('Started');
    }
  }, [running, f?.remainingMs, f?.todoId, f?.subjectId, profile?.mixId, pauseFocus, resumeFocus, startFocus, flash]);

  // Keyboard owns the screen while it is open; the global handlers stand down.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey) {
        if (key === 'enter') { e.preventDefault(); close(); }
        return;
      }
      if (key === 'escape') { e.preventDefault(); close(); return; }
      if (key === ' ' || key === 'k') { e.preventDefault(); toggle(); return; }
      if (key === 's') { e.preventDefault(); skipPhase(); flash('Skipped'); return; }
      if (key === 'n') { e.preventDefault(); bumpDistraction(); flash('Distraction logged'); return; }
      if (key === 'arrowup' || key === '+' || key === '=') { e.preventDefault(); extendFocus(5); flash('+5 minutes'); return; }
      if (key === 'arrowdown' || key === '-') { e.preventDefault(); extendFocus(-5); flash('-5 minutes'); return; }
      if (key === 'f') {
        e.preventDefault();
        if (phase === 'focus') { finishPhase(); flash('Session logged'); } else { finishPhase(); flash('Break ended'); }
        return;
      }
      if (key === 'p') { e.preventDefault(); pauseFocus(); flash('Paused'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, toggle, skipPhase, bumpDistraction, extendFocus, finishPhase, pauseFocus, phase, flash]);

  useEffect(() => () => { if (hintTimer.current) window.clearTimeout(hintTimer.current); }, []);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.015 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      className="immersive fixed inset-0 z-[90] flex flex-col"
      style={{ background: 'var(--surface)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Immersive timer"
    >
      {/* The effect runs behind a scrim here: at this size a raw field of
          dithered pixels would fight the digits for attention. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-55">
        <AppBackdrop inFullscreen />
      </div>
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--surface) 62%, transparent)' }} />

      <div className="relative flex items-center justify-between" style={{ padding: 'var(--immersive-pad)' }}>
        <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.16em] text-faint">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: running ? phaseColor : 'var(--text-faint)' }} />
          {phase.replace('-', ' ')}
          <span className="text-faint/60">·</span>
          <span className="normal-case tracking-normal">{profile?.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => toast({ title: 'Keyboard', body: 'Space start/pause · S skip · N distraction · F log · ↑↓ ±5 min · Esc exit' })}
            className="focusable flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Keyboard" size={14} /> Keys
          </button>
          <button onClick={close} className="focusable flex h-8 items-center gap-1.5 rounded-[10px] bg-s1 px-2.5 text-[12px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Minimize2" size={14} /> Exit
            <kbd className="num rounded bg-s2 px-1 py-0.5 text-[10px] text-faint">ESC</kbd>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8" style={{ padding: '0 var(--immersive-pad)' }}>
        <div className="text-center">
          <div className="immersive-digits" style={{ color: running ? 'var(--text)' : 'var(--text-muted)' }}>
            {minsToClock(remainingMs / 60000)}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-muted">
            {task ? (
              <span className="flex items-center gap-1.5"><Icon name="CheckSquare" size={13} /> {task.title}</span>
            ) : (
              <span className="text-faint">No task attached</span>
            )}
            {subject && (
              <>
                <span className="text-faint">·</span>
                <span className="flex items-center gap-1.5" style={{ color: subject.color }}>
                  <Icon name={subject.icon} size={13} /> {subject.name}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="w-full max-w-[680px]">
          <div className="flex items-center gap-[3px]">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span
                key={i}
                className="immersive-seg"
                style={{
                  background: i < filled ? phaseColor : 'color-mix(in srgb, var(--text-faint) 26%, transparent)',
                  opacity: 1,
                }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-faint">
            <span className="num">{Math.round(pct)}% of {totalMin} min</span>
            <span className="flex items-center gap-1">
              {Array.from({ length: cycle }, (_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full"
                  style={{ background: i < cycleDone ? phaseColor : 'var(--surface-3)' }} />
              ))}
              <span className="ml-1.5">{cycleDone}/{cycle} to a long break</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={toggle}
            className="focusable flex h-12 items-center gap-2 rounded-[14px] px-6 text-[14px] font-medium"
            style={{ background: phaseColor, color: '#0b0d12' }}>
            <Icon name={running ? 'Pause' : 'Play'} size={17} />
            {running ? 'Pause' : f?.remainingMs ? 'Resume' : 'Start'}
          </button>
          <button onClick={() => { extendFocus(5); flash('+5 minutes'); }}
            className="focusable flex h-12 items-center gap-2 rounded-[14px] bg-s1 px-4 text-[13px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Plus" size={15} /> 5 min
          </button>
          <button onClick={() => { skipPhase(); flash('Skipped'); }}
            className="focusable flex h-12 items-center gap-2 rounded-[14px] bg-s1 px-4 text-[13px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="SkipForward" size={15} /> Skip
          </button>
          <button onClick={() => { bumpDistraction(); flash('Distraction logged'); }}
            className="focusable flex h-12 items-center gap-2 rounded-[14px] bg-s1 px-4 text-[13px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="CircleAlert" size={15} /> {f?.distractions ?? 0}
          </button>
          <button onClick={() => { finishPhase(); flash('Session logged'); }}
            className="focusable flex h-12 items-center gap-2 rounded-[14px] bg-s1 px-4 text-[13px] text-muted hover:bg-s2 hover:text-ink">
            <Icon name="Check" size={15} /> Log
          </button>
        </div>

        <div className="h-4 text-[11.5px] text-faint" aria-live="polite">{hint ?? ''}</div>
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-3 text-[11.5px] text-faint" style={{ padding: 'var(--immersive-pad)' }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><Icon name="Timer" size={12} /> {minsToHM(todayMinutes)} today</span>
          <span className="flex items-center gap-1.5"><Icon name="Flame" size={12} /> {db.focusSessions.filter((s) => s.kind === 'focus' && format(new Date(s.startedAt), 'yyyy-MM-dd') === today).length}{' '}
            {db.focusSessions.filter((s) => s.kind === 'focus' && format(new Date(s.startedAt), 'yyyy-MM-dd') === today).length === 1 ? 'session' : 'sessions'}</span>
          {profile?.strict && <span className="flex items-center gap-1.5 text-warning"><Icon name="Lock" size={12} /> strict</span>}
        </div>
        <div className="num flex items-center gap-3">
          <span>{format(new Date(), 'EEE d MMM')}</span>
          <span>{format(new Date(), 'HH:mm')}</span>
        </div>
      </div>
    </motion.div>
  );
}
