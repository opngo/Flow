import { useEffect, useRef } from 'react';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { applyTheme } from '../lib/theme';
import { dueReminders } from '../lib/scheduler';
import { systemNotify } from '../lib/platform';
import { useNavigate } from 'react-router-dom';

/** Applies theme + typography tokens live whenever settings change. */
export function useThemeSync() {
  const settings = useFlow((s) => s.db.settings);
  useEffect(() => {
    applyTheme({
      preset: settings.theme.preset,
      mode: settings.theme.mode,
      accent: settings.theme.accent,
      overrides: settings.theme.overrides,
      density: settings.theme.density,
      radius: settings.theme.radius,
      corners: settings.theme.corners,
      blur: settings.theme.blur,
      reduceMotion: settings.behavior.reduceMotion,
      typography: settings.typography,
    });
  }, [settings]);

  // load custom imported fonts via the FontFace API
  const loaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const font of settings.typography.customFonts) {
      if (loaded.current.has(font.name)) continue;
      loaded.current.add(font.name);
      const face = new FontFace(font.name, `url(${font.dataUrl})`);
      face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
    }
  }, [settings.typography.customFonts]);
}

/** Clock-authority tick: timers derive from wall-clock timestamps so they stay
 *  exact across sleep, reloads and throttling (spec §10.2, §11). */
export function useTimerTick() {
  const tick = useFlow((s) => s.tick);
  useEffect(() => {
    tick();
    const id = setInterval(() => tick(), 500);
    return () => clearInterval(id);
  }, [tick]);
}

/** Main-process-style reminder loop. Runs while the window is hidden because it
 *  lives in the renderer store; the Electron build mirrors it in main.ts. */
export function useScheduler() {
  const reminders = useFlow((s) => s.db.reminders);
  const settings = useFlow((s) => s.db.settings);
  const deliver = useFlow((s) => s.deliverReminder);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const busy = useRef<Set<string>>(new Set());

  useEffect(() => {
    const run = () => {
      const due = dueReminders(reminders, new Date(), settings);
      for (const { reminder, missed } of due) {
        if (busy.current.has(reminder.id)) continue;
        busy.current.add(reminder.id);
        deliver(reminder.id, missed);
        systemNotify({ title: missed ? `Missed: ${reminder.title}` : reminder.title, body: reminder.body, route: reminder.route, targetId: reminder.targetId });
        toast({
          title: missed ? `Missed: ${reminder.title}` : reminder.title,
          body: reminder.body,
          tone: missed ? 'warning' : 'default',
          actionLabel: reminder.route ? 'Open' : undefined,
          action: reminder.route ? () => navigate(reminder.route!) : undefined,
        });
      }
    };
    run();
    const id = setInterval(run, 15000);
    return () => clearInterval(id);
  }, [reminders, settings, deliver, toast, navigate]);
}

/** Global keyboard shortcuts. */
export function useGlobalKeys() {
  const { openPalette, setQuickAdd, setFocusMode, setMiniMode, setImmersive, immersive } = useUI();
  const undo = useFlow((s) => s.undo);
  const redo = useFlow((s) => s.redo);
  const ready = useFlow((s) => s.ready);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'space') {
        e.preventDefault();
        setQuickAdd(true);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'enter') {
        e.preventDefault();
        setImmersive(!immersive);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setMiniMode(true);
        return;
      }
      if (e.key === '?' && !typing) {
        e.preventDefault();
        openPalette('?');
        return;
      }
      if (e.key === 'Escape' && !typing) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, setQuickAdd, setFocusMode, setMiniMode, setImmersive, immersive, undo, redo, ready]);
}

/** Keep the Electron tray label and main-process schedule in sync. */
export function useTraySync() {
  const focus = useFlow((s) => s.db.focus);
  const timers = useFlow((s) => s.db.timers);
  const reminders = useFlow((s) => s.db.reminders);
  useEffect(() => {
    if (!window.flow) return;
    const running = timers.filter((t) => t.running);
    const label = focus?.running ? `${focus.phase}` : running[0]?.label ?? 'No timer';
    window.flow.tray({ timerLabel: label, running: !!(focus?.running || running.length) });
    window.flow.schedule(JSON.stringify(reminders.filter((r) => !r.delivered)));
  }, [focus, timers, reminders]);
}
