import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Btn, Icon, IconBtn, ProgressRing, Slider } from './ui';
import { minsToClock } from '../lib/utils';

/** Always-on-top mini widget: timer, current task, sound + restore. */
export function MiniMode() {
  const setMiniMode = useUI((s) => s.setMiniMode);
  // Shallow-compared selectors: filtering inside a selector creates a new array
  // every call, which useSyncExternalStore would otherwise see as a new snapshot.
  const { focus, startFocus, pauseFocus, resumeFocus, finishPhase } = useFlow(useShallow((s) => ({
    focus: s.db.focus,
    startFocus: s.startFocus,
    pauseFocus: s.pauseFocus,
    resumeFocus: s.resumeFocus,
    finishPhase: s.finishPhase,
  })));
  const timers = useFlow(useShallow((s) => s.db.timers.filter((t) => t.running)));
  const todos = useFlow(useShallow((s) => s.db.todos.filter((t) => t.status !== 'done')));
  const profiles = useFlow((s) => s.db.settings.timerProfiles);
  const profile = profiles.find((p) => p.id === focus?.profileId);
  const [opacity, setOpacity] = useState(100);

  const running = !!focus?.running;
  const remainingMs = focus?.running && focus.endsAt
    ? new Date(focus.endsAt).getTime() - Date.now()
    : focus?.remainingMs ?? (profile?.focus ?? 25) * 60000;
  const total = (focus?.phase === 'focus' ? profile?.focus ?? 25 : focus?.phase === 'short-break' ? profile?.shortBreak ?? 5 : profile?.longBreak ?? 15) ?? 25;
  const progress = 100 - (remainingMs / (total * 60000)) * 100;
  const currentTodo = todos.find((t) => t.id === focus?.todoId) ?? todos[0];

  return (
    <div className="flex h-full items-center justify-center" style={{ background: 'var(--surface)' }}>
      <div className="panel-raised w-[360px] p-4" style={{ opacity: opacity / 100 }}>
        <div className="flex items-center gap-2">
          <Icon name="Waves" size={14} className="text-accent" />
          <span className="text-[12px] font-semibold">Flow mini</span>
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn icon="Minimize2" label="Leave mini mode" onClick={() => setMiniMode(false)} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <ProgressRing value={progress} size={64} stroke={6}>
            <span className="num text-[10px] font-semibold">{Math.round(progress)}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <div className="num text-[26px] font-semibold leading-none">{minsToClock(remainingMs / 60000)}</div>
            <div className="mt-1 truncate text-[12px] text-muted">{focus?.phase?.replace('-', ' ') ?? 'ready'}</div>
            <div className="truncate text-[11.5px] text-faint">{currentTodo?.title ?? 'No task attached'}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {running
            ? <Btn size="sm" variant="soft" icon="Pause" onClick={pauseFocus}>Pause</Btn>
            : <Btn size="sm" variant="primary" icon="Play" onClick={() => (focus?.phase ? resumeFocus() : startFocus({ todoId: currentTodo?.id }))}>Start</Btn>}
          <Btn size="sm" variant="soft" icon="SkipForward" onClick={() => finishPhase()}>Finish</Btn>
          <Btn size="sm" variant="ghost" icon="Headphones" onClick={() => setMiniMode(false)}>Studio</Btn>
        </div>
        {timers.length > 0 && (
          <div className="mt-2 space-y-1">
            {timers.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5 text-[11.5px]">
                <Icon name="AlarmClock" size={12} className="text-muted" />
                <span className="flex-1 truncate">{t.label}</span>
                <span className="num text-muted">
                  {t.kind === 'stopwatch' ? 'running' : minsToClock(Math.max(0, ((t.endsAt ? new Date(t.endsAt).getTime() : Date.now()) - Date.now()) / 60000))}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Icon name="Contrast" size={12} className="text-faint" />
          <Slider value={opacity} min={40} max={100} step={1} onChange={setOpacity} label="Window opacity" format={(v) => `${v}%`} showValue />
        </div>
      </div>
    </div>
  );
}
