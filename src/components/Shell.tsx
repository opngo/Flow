import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useFlow, useUnreadCount } from '../store';
import { useUI } from '../ui';
import { NAV, navByRoute } from '../lib/nav';
import { Icon, IconBtn } from './ui';
import { isElectron, winAction } from '../lib/platform';
import { cn } from '../lib/utils';
import { useLabels } from './Tooltip';

/** Route → the screens the breadcrumb can offer, deepest last. */
function useTrail() {
  const location = useLocation();
  const db = useFlow((s) => s.db);
  return useMemo(() => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const nav = navByRoute(path) ?? NAV.find((n) => path.startsWith(n.route) && n.route !== '/');
    const trail: Array<{ label: string; to?: string }> = [];

    if (!nav || nav.route === '/') {
      trail.push({ label: 'Dashboard', to: '/' });
      return trail;
    }
    trail.push({ label: nav.label, to: nav.route });

    // Deeper levels: a record or a tab inside the section.
    if (path.startsWith('/todos') && params.get('view') && params.get('view') !== 'list') {
      trail.push({ label: `${params.get('view')} view` });
    }
    if (path.startsWith('/categories/')) {
      const id = path.split('/')[2];
      trail.push({ label: db.categories.find((c) => c.id === id)?.name ?? 'Category' });
    }
    if (path.startsWith('/grades/')) {
      const id = path.split('/')[2];
      const subject = db.subjects.find((s) => s.id === id);
      trail.push({ label: subject?.name ?? 'Subject', to: '/grades' });
      if (params.get('tab')) trail.push({ label: params.get('tab')! });
    }
    if (path.startsWith('/tools/')) {
      const id = path.split('/')[2];
      trail.push({ label: TOOL_LABEL[id] ?? 'Tool', to: '/tools' });
    }
    if (path.startsWith('/settings') && params.get('tab')) {
      const tab = params.get('tab')!;
      trail.push({ label: tab[0].toUpperCase() + tab.slice(1), to: `/settings?tab=${tab}` });
    }
    if (path.startsWith('/habits') && params.get('view')) trail.push({ label: params.get('view')! });
    if (path.startsWith('/focus') && params.get('session')) trail.push({ label: 'Session' });
    return trail;
  }, [location.pathname, location.search, db.categories, db.subjects]);
}

/** Tool ids are slugs; humanise the common ones without importing the catalog. */
const TOOL_LABEL: Record<string, string> = {
  'unit-converter': 'Unit converter',
  'password-generator': 'Password generator',
};

export function Titlebar() {
  const navigate = useNavigate();
  const settings = useFlow((s) => s.db.settings);
  const updateSettings = useFlow((s) => s.updateSettings);
  const unread = useUnreadCount();
  const { openPalette, setQuickAdd, setMiniMode, miniMode, setImmersive } = useUI();
  const labels = useLabels();
  const trail = useTrail();
  const [maximized, setMaximized] = useState(false);
  const [time, setTime] = useState(new Date());
  const compact = labels !== 'full';

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const pinned = settings.behavior.pinOnTop;

  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-2 px-3">
      <div className="no-drag flex min-w-0 items-center gap-1.5">
        <button
          onClick={() => navigate('/')}
          className="focusable flex shrink-0 items-center gap-2 rounded-[10px] px-1.5 py-1 text-[13px] font-semibold tracking-tight hover:bg-s2"
          aria-label="Flow home"
          data-tip={compact ? 'Flow home' : undefined}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ background: 'var(--accent)' }}>
            <Icon name="Waves" size={14} className="text-white" />
          </span>
          <span data-label="minor">Flow</span>
        </button>

        {/* Breadcrumbs: each level that has a destination is a real button, so
            you can step back out of a subject, a tool or a settings tab. */}
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
            {trail.map((step, i) => {
              const last = i === trail.length - 1;
              const clickable = !last && !!step.to;
              return (
                <span key={`${step.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  <span className="text-faint" aria-hidden>/</span>
                  {last ? (
                    <span className="truncate text-[12.5px] text-muted" aria-current="page">{step.label}</span>
                  ) : (
                    <button
                      onClick={() => step.to && navigate(step.to)}
                      disabled={!clickable}
                      className={cn(
                        'focusable max-w-[180px] truncate rounded-[7px] px-1 py-0.5 text-[12.5px]',
                        clickable ? 'text-muted hover:bg-s2 hover:text-ink' : 'text-faint',
                      )}
                      data-tip={clickable ? `Back to ${step.label}` : undefined}
                    >
                      {step.label}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        )}
      </div>

      <div className="no-drag ml-auto flex items-center gap-1">
        <button
          onClick={() => openPalette()}
          className="focusable hidden items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px] text-faint hover:bg-s2 sm:flex"
          aria-label="Search or command"
          data-tip={compact ? 'Search or command' : undefined}
        >
          <Icon name="Search" size={13} />
          <span data-label="minor">Search or command</span>
          <kbd data-label="meta" className="num rounded bg-s2 px-1 py-0.5 text-[10px] text-muted">{navigator.userAgent.includes('Mac') ? 'CMD' : 'CTRL'} K</kbd>
        </button>
        <IconBtn icon="Plus" label="Capture a task" onClick={() => setQuickAdd(true)} />
        <IconBtn icon="Maximize" label="Immersive timer" onClick={() => setImmersive(true)} />
        <IconBtn icon="AppWindow" label="Mini mode" active={miniMode} onClick={() => setMiniMode(!miniMode)} />
        <NotificationBell unread={unread} />
        <div className="mx-1 hidden items-center gap-1 text-[11.5px] text-faint md:flex">
          <Icon name="Clock" size={12} />
          <span className="num">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {isElectron() && (
          <>
            <IconBtn icon="Pin" label={pinned ? 'Unpin window' : 'Pin window on top'} active={pinned}
              onClick={() => { updateSettings((s) => ({ ...s, behavior: { ...s.behavior, pinOnTop: !pinned } })); winAction('pin', !pinned); }} />
            <div className="ml-1 flex items-center">
              <button onClick={() => winAction('minimize')} aria-label="Minimize" data-tip="Minimize" className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-s2">
                <Icon name="Minus" size={14} />
              </button>
              <button onClick={() => { winAction('maximize'); setMaximized((m) => !m); }} aria-label="Maximize" data-tip={maximized ? 'Restore' : 'Maximize'} className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-s2">
                <Icon name={maximized ? 'Minimize2' : 'Maximize2'} size={13} />
              </button>
              <button onClick={() => winAction('close')} aria-label="Close" data-tip="Close" className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-danger/25 hover:text-danger">
                <Icon name="X" size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/** Bell opens a popover. It no longer navigates away from what you were doing. */
function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notifications = useFlow((s) => s.db.notifications);
  const markAllRead = useFlow((s) => s.markAllNotificationsRead);
  const recent = notifications.slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('[data-notif-root]')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" data-notif-root>
      <button
        onClick={() => setOpen((v) => !v)}
        className="focusable relative flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:bg-s2 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        data-tip="Notifications"
      >
        <Icon name="Bell" size={16} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
      </button>

      {open && (
        <div
          className="panel-raised absolute right-0 top-[calc(100%+6px)] z-[70] w-[320px] overflow-hidden p-0"
          style={{ animation: 'tip-in 140ms ease-out' }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px] font-semibold">Notifications</span>
            <button
              onClick={() => markAllRead()}
              className="focusable rounded-[7px] px-1.5 py-0.5 text-[11px] text-faint hover:bg-s2 hover:text-muted"
            >Mark all read</button>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {recent.length === 0 && (
              <div className="px-3 py-8 text-center text-[12px] text-faint">Nothing yet. Reminders land here.</div>
            )}
            {recent.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.route) navigate(n.route);
                  setOpen(false);
                }}
                className="focusable flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-s2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.read ? 'var(--surface-3)' : 'var(--accent)' }} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[12.5px]', n.read ? 'text-muted' : 'text-ink')}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-[11px] text-faint">{n.body}</span>}
                  <span className="mt-0.5 block text-[10px] text-faint">{format(new Date(n.at), 'd MMM, HH:mm')}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { navigate('/notifications'); setOpen(false); }}
            className="focusable flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-2 text-[11.5px] text-muted hover:bg-s2 hover:text-ink"
          >
            Open the notification centre <Icon name="ArrowRight" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onPrefetch }: { onPrefetch?: (route: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useFlow((s) => s.db.settings);
  const unread = useUnreadCount();
  const timers = useFlow((s) => s.db.timers.filter((t) => t.running).length);
  const focus = useFlow((s) => s.db.focus);
  const labels = useLabels();
  const { sidebarHover, setSidebarHover, sidebarPinned, toggleSidebarPinned } = useUI();

  const conf = settings.sidebar;
  const items = (conf.items.length ? conf.items : []).filter((i) => !i.hidden);
  const list = items.length ? items : [];
  const [hovering, setHovering] = useState(false);

  const auto = conf.mode === 'auto';
  const expanded = !auto || sidebarHover || sidebarPinned || hovering;
  const iconOnly = conf.iconsOnly || labels === 'none';
  const minimal = labels === 'minimal';
  const width = iconOnly ? 64 : conf.width;

  const activeTimerCount = timers + (focus?.running ? 1 : 0);

  // Hovering a row starts the route chunk download, so the click is instant.
  const warm = (route: string) => onPrefetch?.(route.split('?')[0]);

  // The home route is reachable from the wordmark, so it does not get a row.
  const visibleList = list.filter((i) => i.route !== '/');

  return (
    <>
      {auto && !expanded && (
        <div
          className="fixed left-0 top-11 z-40 h-[calc(100%-2.75rem)] w-1.5"
          onMouseEnter={() => setSidebarHover(true)}
          aria-hidden
        />
      )}
      <motion.nav
        initial={false}
        animate={{ width: expanded ? width : 0, opacity: expanded ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.55 }}
        onMouseEnter={() => { setHovering(true); setSidebarHover(true); }}
        onMouseLeave={() => { setHovering(false); setSidebarHover(false); }}
        className={cn('no-drag z-40 flex shrink-0 flex-col overflow-hidden', conf.overlay && 'fixed left-0 top-11 h-[calc(100%-2.75rem)]')}
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
        aria-label="Main navigation"
        aria-hidden={!expanded}
      >
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2 no-scrollbar" style={{ width }}>
          {Array.from(new Set(visibleList.map((i) => i.group))).map((group) => (
            <div key={group} className="mb-1">
              {!iconOnly && !minimal && group !== 'Main' && (
                <div className="label px-2.5 pb-1 pt-2" data-label="meta">{group}</div>
              )}
              {visibleList.filter((i) => i.group === group).map((item) => {
                const active = location.pathname === item.route || (item.route !== '/' && location.pathname.startsWith(item.route));
                const badge = item.id === 'notifications' ? unread : item.id === 'timers' || item.id === 'focus' ? activeTimerCount : 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.route)}
                    onPointerEnter={() => warm(item.route)}
                    onFocus={() => warm(item.route)}
                    data-tip={iconOnly ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focusable group relative mb-0.5 flex h-9 w-full items-center gap-2.5 rounded-[11px] px-2.5 text-[13px] transition-colors',
                      active ? 'text-ink' : 'text-muted hover:text-ink hover:bg-s2',
                      iconOnly && 'justify-center px-0',
                    )}
                    style={active ? { background: 'var(--accent-soft)' } : undefined}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute left-1 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full"
                        style={{ background: 'var(--accent)' }}
                      />
                    )}
                    <Icon name={item.icon} size={16} className={active ? 'text-accent' : ''} />
                    {!iconOnly && <span className="flex-1 truncate text-left" data-label="nav">{item.label}</span>}
                    {badge > 0 && !iconOnly && (
                      <span data-label="meta" className="num flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]" style={{ background: 'var(--accent)', color: '#fff' }}>{badge}</span>
                    )}
                    {badge > 0 && iconOnly && (
                      <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-2 pb-2" style={{ width }}>
          <button
            onClick={toggleSidebarPinned}
            data-tip={iconOnly ? (auto ? 'Pin sidebar' : 'Sidebar is always visible') : undefined}
            className={cn('focusable flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] text-faint hover:bg-s2 hover:text-muted', iconOnly && 'justify-center px-0')}
          >
            <Icon name={sidebarPinned ? 'Pin' : 'PanelLeft'} size={14} />
            {!iconOnly && <span data-label="meta">{auto ? (sidebarPinned ? 'Pinned' : 'Auto-hide') : 'Always visible'}</span>}
          </button>
        </div>
      </motion.nav>
    </>
  );
}
