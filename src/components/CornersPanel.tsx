import { useFlow } from '../store';
import { Panel, SectionHead, Icon } from './ui';
import { cn } from '../lib/utils';

const PRESETS = [0, 6, 10, 12, 16, 20, 28];

/**
 * Settings → Appearance → Corners.
 *
 * There are two controls because they answer two different questions: "how
 * round" is a scale, "round or square" is a mode the user may want regardless of
 * the scale. Sharp mode zeroes everything, including pills.
 */
export function CornersPanel() {
  const theme = useFlow((s) => s.db.settings.theme);
  const updateSettings = useFlow((s) => s.updateSettings);
  const sharp = theme.corners === 'sharp';

  const patch = (next: Partial<typeof theme>) =>
    updateSettings((s) => ({ ...s, theme: { ...s.theme, ...next } }));

  return (
    <Panel className="p-4">
      <SectionHead
        title="Corners"
        subtitle="One scale for every surface, plus a mode with no rounding at all."
        right={<span className="chip">{sharp ? 'sharp' : `${theme.radius}px`}</span>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'rounded', label: 'Rounded', icon: 'Circle' },
              { id: 'sharp', label: 'Sharp', icon: 'Square' },
            ] as const).map((m) => (
              <button key={m.id} onClick={() => patch({ corners: m.id })}
                className={cn('focusable flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px]',
                  theme.corners === m.id ? 'text-ink' : 'text-muted hover:text-ink')}
                style={{ background: theme.corners === m.id ? 'var(--accent-soft)' : 'var(--surface-2)' }}
                aria-pressed={theme.corners === m.id}>
                <Icon name={m.icon} size={14} />
                {m.label}
                {theme.corners === m.id && <Icon name="Check" size={11} className="ml-auto text-accent" />}
              </button>
            ))}
          </div>

          <label className={cn('block', sharp && 'opacity-45')}>
            <span className="mb-1 flex items-center justify-between text-[11.5px] text-muted">
              Radius
              <span className="num text-faint">{sharp ? 'overridden by sharp mode' : `${theme.radius}px`}</span>
            </span>
            <input type="range" min={0} max={28} step={1} value={theme.radius} disabled={sharp}
              onChange={(e) => patch({ radius: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]" aria-label="Corner radius" />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((r) => (
              <button key={r} onClick={() => patch({ radius: r, corners: 'rounded' })}
                className="focusable chip hover:bg-s3"
                style={theme.radius === r && !sharp ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}>
                {r}px
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[12px] p-3" style={{ background: 'var(--surface-2)' }}>
          <div className="label mb-2">Preview</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2" style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)' }}>
              <div className="h-1.5 w-10" style={{ background: 'var(--text-faint)', borderRadius: 'var(--radius)' }} />
              <div className="mt-1.5 h-1.5 w-16 opacity-40" style={{ background: 'var(--text-faint)', borderRadius: 'var(--radius)' }} />
            </div>
            <div className="h-10 w-10" style={{ background: 'var(--accent)', borderRadius: 'var(--radius)' }} />
            <div className="h-7 w-16" style={{ background: 'var(--surface-1)', borderRadius: '999px' }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            {sharp
              ? 'Sharp mode renders every corner at 0 px. Pills and circles become rectangles.'
              : 'Radius scales panels, inputs, rows and buttons together, keeping their relative shapes.'}
          </p>
        </div>
      </div>
    </Panel>
  );
}
