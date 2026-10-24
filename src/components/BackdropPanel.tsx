import { useFlow } from '../store';
import { Backdrop } from './Backdrop';
import { Panel, SectionHead, Slider, Toggle, Icon } from './ui';
import { EFFECTS, getEffect } from '../lib/effects';
import { cn } from '../lib/utils';

/**
 * Settings → Appearance → Backdrop.
 *
 * The whole point is that this is a decision the user makes, not a default they
 * discover. The preview runs the real renderer rather than a picture of it.
 */
export function BackdropPanel() {
  const backdrop = useFlow((s) => s.db.settings.backdrop);
  const reduceMotion = useFlow((s) => s.db.settings.behavior.reduceMotion);
  const updateSettings = useFlow((s) => s.updateSettings);
  const active = getEffect(backdrop.effect);

  const patch = (next: Partial<typeof backdrop>) =>
    updateSettings((s) => ({ ...s, backdrop: { ...s.backdrop, ...next } }));

  return (
    <Panel className="p-4">
      <SectionHead
        title="Backdrop"
        subtitle="Atmosphere behind the interface. Off until you pick one."
        right={<span className="chip">{active.kind === 'canvas' ? 'canvas' : 'overlay'} · {active.cost}</span>}
      />

      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative h-full min-h-[168px] overflow-clip rounded-[12px]"
          style={{ background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--text-faint) 10%, transparent)' }}>
          {active.id !== 'none' ? (
            <Backdrop
              effect={active.id}
              intensity={backdrop.intensity}
              speed={backdrop.speed}
              pixel={backdrop.pixel}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-faint">
              Nothing behind the glass
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] px-3 py-1.5 text-[11px] text-muted backdrop-blur">
            <span>{active.name}</span>
            <span className="num">{Math.round(backdrop.intensity * 100)}% · {backdrop.speed.toFixed(1)}x</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {EFFECTS.map((e) => (
              <button
                key={e.id}
                onClick={() => patch({ effect: e.id })}
                title={e.blurb}
                className={cn(
                  'focusable flex flex-col items-start gap-0.5 rounded-[10px] px-2.5 py-2 text-left text-[11.5px]',
                  backdrop.effect === e.id ? 'text-ink' : 'text-muted hover:text-ink',
                )}
                style={{ background: backdrop.effect === e.id ? 'var(--accent-soft)' : 'var(--surface-2)' }}
              >
                <span className="flex w-full items-center gap-1">
                  {e.name}
                  {backdrop.effect === e.id && <Icon name="Check" size={10} className="ml-auto text-accent" />}
                </span>
                <span className="text-[10px] text-faint">{e.kind === 'css' ? 'overlay' : e.pixelated ? 'pixel' : 'smooth'}</span>
              </button>
            ))}
          </div>

          <p className="min-h-[16px] text-[11.5px] text-faint">{active.blurb}</p>

          <div className="space-y-2.5">
            <div>
              <span className="mb-1 flex items-baseline justify-between text-[11.5px] text-muted">
                Intensity <span className="num text-faint">{Math.round(backdrop.intensity * 100)}%</span>
              </span>
              <Slider value={backdrop.intensity} min={0} max={1} step={0.01} label="Backdrop intensity"
                onChange={(v) => patch({ intensity: v })} />
            </div>
            <div>
              <span className="mb-1 flex items-baseline justify-between text-[11.5px] text-muted">
                Speed <span className="num text-faint">{backdrop.speed.toFixed(2)}x</span>
              </span>
              <Slider value={backdrop.speed} min={0} max={2.5} step={0.05} label="Backdrop speed"
                onChange={(v) => patch({ speed: v })} />
            </div>
            {active.usesPixel && (
              <div>
                <span className="mb-1 flex items-baseline justify-between text-[11.5px] text-muted">
                  Pixel size <span className="num text-faint">{backdrop.pixel}px</span>
                </span>
                <Slider value={backdrop.pixel} min={2} max={12} step={1} label="Backdrop pixel size"
                  stops={[2, 4, 6, 8, 10, 12]} onChange={(v) => patch({ pixel: v })} />
              </div>
            )}
          </div>

          <div className="rounded-[10px] bg-s1 px-2.5 py-1.5">
            <Toggle label="Also in the immersive timer" checked={backdrop.inFullscreen}
              onChange={(v) => patch({ inFullscreen: v })} />
            {reduceMotion && (
              <p className="pt-1 text-[11px] text-warning">Reduced motion is on in Behavior, so this renders a single still frame.</p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
