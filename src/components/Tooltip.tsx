import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFlow } from '../store';
import { cn } from '../lib/utils';

/**
 * Tooltips.
 *
 * Two mechanisms, deliberately separate:
 *
 *   TooltipLayer   one delegated listener for `[data-tip]` elements. Used for
 *                  chrome: icon buttons, sidebar rows, the titlebar. It ignores
 *                  anything inside `[data-rich-tip]`, so a task row's own hover
 *                  card always wins.
 *   RichTip        a self-contained hover card for content (a whole task, a
 *                  heatmap day). It owns its own listeners and never registers
 *                  with the layer.
 *
 * Both clamp themselves to the viewport, which is the fix for tooltips that used
 * to be cut off at the edge of a panel.
 */

const OFFSET = 10;
const DELAY = 320;

type TipState = string | null;

function clampBox(
  el: HTMLElement,
  anchor: { left: number; top: number; right: number; bottom: number },
  place: 'top' | 'bottom' | 'right',
) {
  const pad = 8;
  const box = el.getBoundingClientRect();
  let left = anchor.left;
  let top = anchor.bottom + OFFSET;
  if (place === 'top') {
    top = anchor.top - box.height - OFFSET;
    if (top < pad) top = anchor.bottom + OFFSET;
  }
  if (place === 'right') {
    left = anchor.right + OFFSET;
    top = anchor.top + (anchor.bottom - anchor.top) / 2 - box.height / 2;
  }
  left = Math.min(Math.max(pad, left), window.innerWidth - box.width - pad);
  top = Math.min(Math.max(pad, top), window.innerHeight - box.height - pad);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/** One layer, mounted once in App. */
export function TooltipLayer() {
  const [tip, setTip] = useState<TipState>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      setTip(null);
      anchorRef.current = null;
    };

    const onOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!target) return;
      // A richer card owns this subtree; leave it alone.
      if (target.closest('[data-rich-tip]')) return;
      if (anchorRef.current === target) return;
      if (timer.current) window.clearTimeout(timer.current);
      anchorRef.current = target;
      const text = target.getAttribute('data-tip') ?? '';
      if (!text) return;
      timer.current = window.setTimeout(() => setTip(text), DELAY);
    };

    const onOut = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-tip]');
      if (!target) return;
      clear();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', clear, true);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', clear, true);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Placement happens after the bubble exists so its measured size is real.
  useLayoutEffect(() => {
    const el = layerRef.current;
    const anchor = anchorRef.current;
    if (!tip || !el || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const place = anchor.getAttribute('data-tip-place');
    clampBox(el, rect, place === 'right' ? 'right' : place === 'top' ? 'top' : 'bottom');
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={layerRef}
      role="tooltip"
      className="pointer-events-none fixed left-0 top-0 z-[120] max-w-[280px] rounded-[9px] px-2.5 py-1.5 text-[11.5px] leading-snug"
      style={{
        background: 'color-mix(in srgb, var(--surface-3) 94%, transparent)',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-3)',
        animation: 'tip-in 120ms ease-out',
      }}
    >
      {tip}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rich hover card for content, e.g. a whole task.                     */
/* ------------------------------------------------------------------ */

export function RichTip({
  children,
  content,
  className,
  disabled,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const enter = useRef<number | null>(null);
  const leave = useRef<number | null>(null);

  const show = () => {
    if (leave.current) window.clearTimeout(leave.current);
    enter.current = window.setTimeout(() => setOpen(true), 260);
  };
  const hide = () => {
    if (enter.current) window.clearTimeout(enter.current);
    leave.current = window.setTimeout(() => setOpen(false), 140);
  };

  useLayoutEffect(() => {
    const card = cardRef.current;
    const anchor = anchorRef.current;
    if (!open || !card || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const pad = 10;
    let left = rect.right + OFFSET;
    let top = rect.top;
    if (left + box.width > window.innerWidth - pad) left = rect.left - box.width - OFFSET;
    if (left < pad) left = Math.min(window.innerWidth - box.width - pad, rect.left);
    if (top + box.height > window.innerHeight - pad) top = window.innerHeight - box.height - pad;
    top = Math.max(pad, top);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }, [open]);

  useEffect(() => () => {
    if (enter.current) window.clearTimeout(enter.current);
    if (leave.current) window.clearTimeout(leave.current);
  }, []);

  return (
    <div
      ref={anchorRef}
      data-rich-tip
      className={cn('relative', className)}
      onPointerEnter={disabled ? undefined : show}
      onPointerLeave={disabled ? undefined : hide}
      onPointerDown={disabled ? undefined : hide}
    >
      {children}
      {open && !disabled && (
        <div
          ref={cardRef}
          role="tooltip"
          onPointerEnter={show}
          onPointerLeave={hide}
          className="pointer-events-auto fixed left-0 top-0 z-[110] w-[276px] max-h-[70vh] overflow-y-auto rounded-[14px] px-3.5 py-3.5 text-[11.5px] no-scrollbar"
          style={{
            // Opaque enough that the row underneath never shows through the card.
            background: 'color-mix(in srgb, var(--surface-2) 97%, transparent)',
            backdropFilter: 'blur(16px)',
            boxShadow: 'var(--shadow-3)',
            animation: 'tip-in 140ms ease-out',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/** Read the label density once, where components need to branch on it. */
export function useLabels() {
  return useFlow((s) => s.db.settings.ui.labels);
}
