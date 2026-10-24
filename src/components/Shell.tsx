import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useFlow, useUnreadCount } from '../store';
import { useUI } from '../ui';
import { NAV, navByRoute } from '../lib/nav';
import { Icon, IconBtn } from './ui';
import { isElectron, winAction } from '../lib/platform';
import { cn } from '../lib/utils';

export function Titlebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useFlow((s) => s.db.settings);
  const updateSettings = useFlow((s) => s.updateSettings);
  const unread = useUnreadCount();
  const { openPalette, setQuickAdd, setMiniMode, miniMode, setImmersive } = useUI();
  const [maximized, setMaximized] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const nav = navByRoute(location.pathname) ?? NAV.find((n) => location.pathname.startsWith(n.route) && n.route !== '/');
  const title = nav?.label ?? 'Flow';
  const pinned = settings.behavior.pinOnTop;

  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-2 px-3">
      <div className="no-drag flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="focusable flex items-center gap-2 rounded-[10px] px-1.5 py-1 text-[13px] font-semibold tracking-tight hover:bg-s2"
          aria-label="Flow home"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ background: 'var(--accent)' }}>
            <Icon name="Waves" size={14} className="text-white" />
          </span>
          Flow
        </button>
        <span className="text-faint">/</span>
        <span className="text-[12.5px] text-muted">{title}</span>
      </div>

      <div className="no-drag ml-auto flex items-center gap-1">
        <button
          onClick={() => openPalette()}
          className="focusable hidden items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px] text-faint hover:bg-s2 sm:flex"
        >
          <Icon name="Search" size={13} />
          Search or command
          <kbd className="num rounded bg-s2 px-1 py-0.5 text-[10px] text-muted">{navigator.userAgent.includes('Mac') ? 'CMD' : 'CTRL'} K</kbd>
        </button>
        <button
          onClick={() => setQuickAdd(true)}
          className="focusable flex h-8 items-center gap-1.5 rounded-[10px] bg-s1 px-2.5 text-[12px] text-muted hover:bg-s2 hover:text-ink"
        >
          <Icon name="Plus" size={14} />
          Capture
        </button>
        <IconBtn icon="Maximize" label="Immersive timer" onClick={() => setImmersive(true)} />
        <IconBtn icon="AppWindow" label="Mini mode" active={miniMode} onClick={() => setMiniMode(!miniMode)} />
        <button
          onClick={() => navigate('/notifications')}
          className="focusable relative flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:bg-s2 hover:text-ink"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Icon name="Bell" size={16} />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
        </button>
        <div className="mx-1 hidden items-center gap-1 text-[11.5px] text-faint md:flex">
          <Icon name="Clock" size={12} />
          <span className="num">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {isElectron() && (
          <>
            <IconBtn icon="Pin" label={pinned ? 'Unpin window' : 'Pin window on top'} active={pinned}
              onClick={() => { updateSettings((s) => ({ ...s, behavior: { ...s.behavior, pinOnTop: !pinned } })); winAction('pin', !pinned); }} />
            <div className="ml-1 flex items-center">
              <button onClick={() => winAction('minimize')} aria-label="Minimize" className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-s2">
                <Icon name="Minus" size={14} />
              </button>
              <button onClick={() => { winAction('maximize'); setMaximized((m) => !m); }} aria-label="Maximize" className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-s2">
                <Icon name={maximized ? 'Minimize2' : 'Maximize2'} size={13} />
              </button>
              <button onClick={() => winAction('close')} aria-label="Close" className="focusable flex h-7 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-danger/25 hover:text-danger">
                <Icon name="X" size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useFlow((s) => s.db.settings);
  const unread = useUnreadCount();
  const timers = useFlow((s) => s.db.timers.filter((t) => t.running).length);
  const focus = useFlow((s) => s.db.focus);
  const { sidebarHover, setSidebarHover, sidebarPinned, toggleSidebarPinned } = useUI();

  const conf = settings.sidebar;
  const items = (conf.items.length ? conf.items : []).filter((i) => !i.hidden);
  const list = items.length ? items : [];
  const [, setIdle] = useState(false);
  const [hovering, setHovering] = useState(false);

  const auto = conf.mode === 'auto';
  const expanded = !auto || sidebarHover || sidebarPinned || hovering;

  useEffect(() => {
    if (!auto) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), conf.hideDelay);
    };
    reset();
    window.addEventListener('mousemove', reset);
    return () => { window.removeEventListener('mousemove', reset); clearTimeout(timer); };
  }, [auto, conf.hideDelay]);

  const width = conf.iconsOnly ? 64 : conf.width;
  const visible = expanded;

  const activeTimerCount = timers + (focus?.running ? 1 : 0);

  return (
    <>
      {auto && !visible && (
        <div
          className="fixed left-0 top-11 z-40 h-[calc(100%-2.75rem)] w-1.5"
          onMouseEnter={() => setSidebarHover(true)}
          aria-hidden
        />
      )}
      <motion.nav
        initial={false}
        animate={{
          width: visible ? width : 0,
          opacity: visible ? 1 : 0,
          marginLeft: visible ? 0 : 0,
        }}
        transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }}
        onMouseEnter={() => { setHovering(true); setSidebarHover(true); }}
        onMouseLeave={() => { setHovering(false); setSidebarHover(false); }}
        className={cn('no-drag z-40 flex shrink-0 flex-col overflow-hidden', conf.overlay && 'fixed left-0 top-11 h-[calc(100%-2.75rem)]')}
        style={{ pointerEvents: visible ? 'auto' : 'none' }}
        aria-label="Main navigation"
        aria-hidden={!visible}
      >
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2 no-scrollbar" style={{ width }}>
          {Array.from(new Set(list.map((i) => i.group))).map((group) => (
            <div key={group} className="mb-1">
              {!conf.iconsOnly && group !== 'Main' && <div className="label px-2.5 pb-1 pt-2">{group}</div>}
              {list.filter((i) => i.group === group).map((item) => {
                const active = location.pathname === item.route || (item.route !== '/' && location.pathname.startsWith(item.route));
                const badge = item.id === 'notifications' ? unread : item.id === 'timers' || item.id === 'focus' ? activeTimerCount : 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.route)}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focusable group relative mb-0.5 flex h-9 w-full items-center gap-2.5 rounded-[11px] px-2.5 text-[13px] transition-colors',
                      active ? 'text-ink' : 'text-muted hover:text-ink hover:bg-s2',
                      conf.iconsOnly && 'justify-center px-0',
                    )}
                    style={active ? { background: 'var(--accent-soft)' } : undefined}
                  >
                    {active && (
                      <motion.span layoutId="nav-active" className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" style={{ background: 'var(--accent)' }} />
                    )}
                    <Icon name={item.icon} size={16} className={active ? 'text-accent' : ''} />
                    {!conf.iconsOnly && <span className="flex-1 truncate text-left">{item.label}</span>}
                    {badge > 0 && (
                      <span className="num flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]" style={{ background: 'var(--accent)', color: '#fff' }}>{badge}</span>
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
            className={cn('focusable flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] text-faint hover:bg-s2 hover:text-muted', conf.iconsOnly && 'justify-center px-0')}
            title={auto ? (sidebarPinned ? 'Let sidebar auto-hide' : 'Keep sidebar pinned') : 'Sidebar is always visible'}
          >
            <Icon name={sidebarPinned ? 'Pin' : 'PanelLeft'} size={14} />
            {!conf.iconsOnly && <span>{auto ? (sidebarPinned ? 'Pinned' : 'Auto-hide') : 'Always visible'}</span>}
          </button>
        </div>
      </motion.nav>
    </>
  );
}
