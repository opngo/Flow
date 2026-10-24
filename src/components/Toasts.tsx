import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../ui';
import { Icon } from './ui';

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  const navigate = useNavigate();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[320px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
            className="panel-raised pointer-events-auto flex items-start gap-2.5 p-3"
          >
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]"
              style={{
                background: t.tone === 'success' ? 'color-mix(in srgb, var(--success) 18%, transparent)'
                  : t.tone === 'danger' ? 'color-mix(in srgb, var(--danger) 18%, transparent)'
                    : t.tone === 'warning' ? 'color-mix(in srgb, var(--warning) 18%, transparent)'
                      : 'var(--accent-soft)',
                color: t.tone === 'success' ? 'var(--success)' : t.tone === 'danger' ? 'var(--danger)' : t.tone === 'warning' ? 'var(--warning)' : 'var(--accent)',
              }}
            >
              <Icon name={t.tone === 'success' ? 'CircleCheck' : t.tone === 'danger' ? 'CircleAlert' : t.tone === 'warning' ? 'CircleAlert' : 'Bell'} size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium leading-snug">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{t.body}</div>}
              {t.actionLabel && (
                <button
                  onClick={() => { t.action?.(); dismissToast(t.id); }}
                  className="focusable mt-2 rounded-[8px] bg-s2 px-2 py-1 text-[11.5px] text-ink hover:bg-s3"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="focusable -mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-[8px] text-faint hover:bg-s2 hover:text-ink">
              <Icon name="X" size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <span className="hidden">{typeof navigate}</span>
    </div>
  );
}
