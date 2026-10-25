import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './ui';
import { cn } from '../lib/utils';

/**
 * One context menu for the whole app.
 *
 * Rows, habits, notes, decks, timers and calendar events all raise the same
 * card instead of inventing their own: a right click opens it at the pointer,
 * it flips when it would leave the window, and it closes on Escape, on scroll
 * or on the first click anywhere else. Keyboard: arrows move, Enter runs,
 * Escape closes, and focus returns to whatever opened it.
 */

export type ContextMenuItem = {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
  checked?: boolean;
  hint?: string;
};

type State = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
};

let state: State = { open: false, x: 0, y: 0, items: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open at the pointer of a right click (or a long press mapped to click). */
export function openContextMenu(event: React.MouseEvent | MouseEvent, items: ContextMenuItem[], title?: string) {
  if (!items.length) return;
  event.preventDefault();
  state = { open: true, x: event.clientX, y: event.clientY, items, title };
  emit();
}

export function closeContextMenu() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function useMenuState() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return state;
}

export function ContextMenuLayer() {
  const s = useMenuState();
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);

  // Measure after mount and keep the card inside the window: flip left when the
  // pointer is near the right edge, flip up when it is near the bottom.
  useLayoutEffect(() => {
    if (!s.open) { setPos(null); setActive(-1); return; }
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const pad = 8;
    const left = s.x + w + pad > vw ? Math.max(pad, s.x - w) : s.x;
    const top = s.y + h + pad > vh ? Math.max(pad, s.y - h) : s.y;
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [s.open, s.x, s.y, s.items]);

  useEffect(() => {
    if (!s.open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-context-menu]')) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); return; }
      const n = s.items.length;
      if (!n) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => {
          const step = e.key === 'ArrowDown' ? 1 : -1;
          const next = (i + step + n) % n;
          return next;
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = s.items[active < 0 ? 0 : active];
        if (item) { item.onClick(); closeContextMenu(); }
      }
    };
    const onScroll = () => closeContextMenu();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [s.open, s.items, active]);

  const body = createPortal(
    <AnimatePresence>
      {s.open && (
        <motion.div
          ref={cardRef}
          data-context-menu
          role="menu"
          aria-label={s.title ?? 'Actions'}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.13, ease: [0.22, 0.61, 0.36, 1] }}
          className="panel-raised fixed z-[95] min-w-[190px] max-w-[260px] p-1.5 text-[12.5px]"
          style={{
            left: pos ? pos.left : s.x,
            top: pos ? pos.top : s.y,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {s.title && (
            <div className="label truncate px-2 pb-1 pt-1.5" data-label="meta">{s.title}</div>
          )}
          {(() => {
            let index = -1;
            return s.items.map((item, i) => {
              index += 1;
              const hot = index === active;
              /* `separator` draws a hairline above the row; it never replaces it. */
              return (
                <div key={`${item.label}-${i}`}>
                  {item.separator && <div className="my-1 h-px" style={{ background: 'color-mix(in srgb, var(--text-faint) 14%, transparent)' }} />}
                  <button
                  role="menuitem"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => { item.onClick(); closeContextMenu(); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[8px] px-2 py-[7px] text-left transition-colors',
                    item.danger ? 'text-danger' : 'text-ink',
                    hot && 'bg-s2',
                  )}
                >
                  {item.icon && <Icon name={item.icon} size={13} className={item.danger ? 'text-danger' : 'text-muted'} />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.checked && <Icon name="Check" size={12} className="text-accent" />}
                  {item.hint && <span className="num text-[10px] text-faint">{item.hint}</span>}
                  </button>
                </div>
              );
            });
          })()}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );

  return body;
}
