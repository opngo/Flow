import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Popover as _P } from '@headlessui/react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export type HeatmapProps = {
  weeks: Date[][];
  values: Record<string, number>;
  thresholds?: number[];
  color?: string;
  cell?: number;
  gap?: number;
  onDayClick?: (date: string, value: number) => void;
  showMonthLabels?: boolean;
  showWeekdayLabels?: boolean;
  formatTooltip?: (date: string, value: number) => React.ReactNode;
  emptyLabel?: string;
  displayMask?: (value: number, date: string) => string;
  weekStart?: number;
};

/** GitHub-style contribution grid: 53 x 7, five intensity levels (spec §9). */
export function Heatmap({
  weeks, values, thresholds = [15, 30, 60, 120], color = 'var(--accent)', cell = 11, gap = 3,
  onDayClick, showMonthLabels = true, showWeekdayLabels = true, formatTooltip, emptyLabel = 'No activity',
  displayMask, weekStart = 1,
}: HeatmapProps) {
  const [hover, setHover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const level = (v: number) => {
    if (v <= 0) return 0;
    if (v >= thresholds[3]) return 4;
    if (v >= thresholds[2]) return 3;
    if (v >= thresholds[1]) return 2;
    return 1;
  };

  const bg = (lvl: number) => {
    if (lvl === 0) return 'color-mix(in srgb, var(--text-faint) 14%, transparent)';
    const opacities = [0, 0.28, 0.5, 0.72, 1];
    return `color-mix(in srgb, ${color} ${opacities[lvl] * 100}%, transparent)`;
  };

  const monthLabels = useMemo(() => {
    const out: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const d = week[0];
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        if (i > 0 || d.getDate() <= 7) out.push({ label: format(d, 'MMM'), col: i });
      }
    });
    return out;
  }, [weeks]);

  const weekdayNames = weekStart === 1
    ? ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
    : ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

  return (
    <div ref={wrapRef} className="relative inline-block">
      {showMonthLabels && (
        <div className="relative mb-1 h-3.5" style={{ marginLeft: showWeekdayLabels ? 26 : 0 }}>
          {monthLabels.map((m) => (
            <span key={`${m.label}-${m.col}`} className="absolute text-[10px] text-faint" style={{ left: m.col * (cell + gap) }}>{m.label}</span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        {showWeekdayLabels && (
          <div className="flex flex-col justify-between pr-0.5 text-[9.5px] text-faint" style={{ height: 7 * (cell + gap) }}>
            {weekdayNames.map((n, i) => <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>{n}</span>)}
          </div>
        )}
        <div className="flex" style={{ gap }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap }}>
              {week.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const v = values[key] ?? 0;
                const lvl = level(v);
                return (
                  <motion.button
                    key={key}
                    onClick={() => onDayClick?.(key, v)}
                    onMouseEnter={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      const wrap = wrapRef.current?.getBoundingClientRect();
                      setHover({ x: rect.left - (wrap?.left ?? 0), y: rect.top - (wrap?.top ?? 0), date: key, value: v });
                    }}
                    onMouseLeave={() => setHover(null)}
                    whileHover={{ scale: 1.25 }}
                    transition={{ duration: 0.12 }}
                    className="focusable rounded-[2.5px]"
                    style={{ width: cell, height: cell, background: bg(lvl) }}
                    aria-label={`${key}: ${displayMask ? displayMask(v, key) : v}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hover && (
        <div
          className="panel-raised pointer-events-none absolute z-50 min-w-[150px] p-2 text-[11px]"
          style={{ left: Math.max(0, hover.x - 60), top: hover.y - 8, transform: 'translateY(-100%)' }}
        >
          {formatTooltip ? formatTooltip(hover.date, hover.value) : (
            <>
              <div className="font-medium">{format(new Date(`${hover.date}T12:00:00`), 'EEEE, MMM d, yyyy')}</div>
              <div className="text-muted">{hover.value > 0 ? displayMask?.(hover.value, hover.date) ?? `${hover.value}` : emptyLabel}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function HeatLegend({ thresholds, color, unit = 'min' }: { thresholds: number[]; color?: string; unit?: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-faint">
      <span>Less</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <span key={l} className="rounded-[2.5px]" style={{
          width: 10, height: 10,
          background: l === 0 ? 'color-mix(in srgb, var(--text-faint) 14%, transparent)' : `color-mix(in srgb, ${color ?? 'var(--accent)'} ${[0, 28, 50, 72, 100][l]}%, transparent)`,
        }} />
      ))}
      <span>More</span>
      <span className="ml-2 text-faint">{thresholds.map((t, i) => `${t}${i < thresholds.length - 1 ? ' · ' : ''}`).join('')} {unit}</span>
    </div>
  );
}

export function HourHeatmap({ matrix, color }: { matrix: number[][]; color?: string }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="inline-block">
      <div className="flex gap-1 pl-8 text-[9.5px] text-faint">
        {Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? <span key={h} className="w-[14px] text-center">{h}</span> : <span key={h} className="w-[14px]" />))}
      </div>
      {matrix.map((row, d) => (
        <div key={d} className="mt-1 flex items-center gap-1">
          <span className="w-7 text-right text-[9.5px] text-faint">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}</span>
          {row.map((v, h) => (
            <span
              key={h}
              title={`${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]} ${h}:00 — ${v} min`}
              className="rounded-[3px]"
              style={{
                width: 14, height: 14,
                background: v === 0 ? 'color-mix(in srgb, var(--text-faint) 12%, transparent)' : `color-mix(in srgb, ${color ?? 'var(--accent)'} ${Math.round((v / max) * 85) + 15}%, transparent)`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export { cn };
