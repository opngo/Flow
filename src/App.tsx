import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Sidebar, Titlebar } from './components/Shell';
import { CommandPalette } from './components/CommandPalette';
import { QuickCapture } from './components/QuickCapture';
import { Toasts } from './components/Toasts';
import { Onboarding } from './components/Onboarding';
import { LockScreen } from './components/LockScreen';
import { MiniMode } from './components/MiniMode';
import { AppBackdrop } from './components/Backdrop';
import { TooltipLayer } from './components/Tooltip';
import { ContextMenuLayer } from './components/ContextMenu';
import { TimerFullscreen } from './components/TimerFullscreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useFlow } from './store';
import { useUI } from './ui';
import { useGlobalKeys, useNativeActions, useNativeBehaviorSync, useScheduler, useThemeSync, useTimerTick, useTraySync } from './hooks/useAppEffects';
/* Routes are split per page: the shell, the store and the palette ship in the
 * entry chunk, and each page (plus its chart/canvas/audio dependencies) loads on
 * first visit. Recharts and the Web Audio engine stay out of the boot path. */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Todos = lazy(() => import('./pages/Todos'));
const Habits = lazy(() => import('./pages/Habits'));
const Goals = lazy(() => import('./pages/Goals'));
const Focus = lazy(() => import('./pages/Focus'));
const Timers = lazy(() => import('./pages/Timers'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Grades = lazy(() => import('./pages/Grades'));
const Notes = lazy(() => import('./pages/Notes'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Sound = lazy(() => import('./pages/Sound'));
const Tools = lazy(() => import('./pages/Tools'));
const ToolHost = lazy(() => import('./pages/ToolHost'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));

/* Route chunks are also reachable without rendering: the sidebar warms them on
 * hover, so a click never waits on the network for a page the pointer was
 * already sitting on. */
const CHUNKS: Record<string, () => Promise<unknown>> = {
  '/': () => import('./pages/Dashboard'),
  '/todos': () => import('./pages/Todos'),
  '/habits': () => import('./pages/Habits'),
  '/goals': () => import('./pages/Goals'),
  '/focus': () => import('./pages/Focus'),
  '/timers': () => import('./pages/Timers'),
  '/analytics': () => import('./pages/Analytics'),
  '/grades': () => import('./pages/Grades'),
  '/notes': () => import('./pages/Notes'),
  '/flashcards': () => import('./pages/Flashcards'),
  '/calendar': () => import('./pages/CalendarPage'),
  '/sound': () => import('./pages/Sound'),
  '/tools': () => import('./pages/Tools'),
  '/notifications': () => import('./pages/Notifications'),
  '/settings': () => import('./pages/Settings'),
};
const warmed = new Set<string>();
export function prefetchRoute(path: string) {
  if (warmed.has(path)) return;
  const load = CHUNKS[path];
  if (!load) return;
  warmed.add(path);
  void load().catch(() => warmed.delete(path));
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

/** Shown while a route chunk is in flight — same skeleton shape as the page. */
function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-3 pt-3" aria-busy="true" aria-live="polite">
      <div className="h-6 w-40 rounded-[8px]" style={{ background: 'var(--surface-2)' }} />
      <div className="h-3 w-64 rounded-[6px]" style={{ background: 'var(--surface-2)' }} />
      <div className="grid gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-[16px]" style={{ background: 'var(--surface-1)' }} />)}
      </div>
      <div className="h-64 rounded-[16px]" style={{ background: 'var(--surface-1)' }} />
    </div>
  );
}

/**
 * Keeps the last page on screen while the next chunk loads.
 *
 * A plain <Suspense fallback={<PageSkeleton/>}> at the route level replaces the
 * whole page with grey blocks on every first visit to a tab, which is the one
 * moment the app looks unfinished. Holding the previous page and letting the
 * new one fade in over it removes that flash entirely; the skeleton is still
 * there for a genuinely cold start.
 */
function HeldSuspense({ path, children }: { path: string; children: React.ReactNode }) {
  const [shown, setShown] = useState<React.ReactNode>(children);
  const [loadedPath, setLoadedPath] = useState(path);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (path === loadedPath) return;
    setFirst(false);
    setShown(children);
    setLoadedPath(path);
  }, [path, loadedPath, children]);

  return (
    <Suspense fallback={first ? <PageSkeleton /> : <div className="h-full opacity-0" aria-hidden>{shown}</div>}>
      {children}
    </Suspense>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence initial={false}>
      <ErrorBoundary scope={location.pathname}>
      <HeldSuspense path={location.pathname}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageFrame><Dashboard /></PageFrame>} />
        <Route path="/todos" element={<PageFrame><Todos /></PageFrame>} />
        <Route path="/categories/:id" element={<PageFrame><CategoryPage /></PageFrame>} />
        <Route path="/habits" element={<PageFrame><Habits /></PageFrame>} />
        <Route path="/goals" element={<PageFrame><Goals /></PageFrame>} />
        <Route path="/focus" element={<PageFrame><Focus /></PageFrame>} />
        <Route path="/timers" element={<PageFrame><Timers /></PageFrame>} />
        <Route path="/analytics" element={<PageFrame><Analytics /></PageFrame>} />
        <Route path="/grades" element={<PageFrame><Grades /></PageFrame>} />
        <Route path="/grades/:subjectId" element={<PageFrame><Grades /></PageFrame>} />
        <Route path="/notes" element={<PageFrame><Notes /></PageFrame>} />
        <Route path="/flashcards" element={<PageFrame><Flashcards /></PageFrame>} />
        <Route path="/calendar" element={<PageFrame><CalendarPage /></PageFrame>} />
        <Route path="/sound" element={<PageFrame><Sound /></PageFrame>} />
        <Route path="/tools" element={<PageFrame><Tools /></PageFrame>} />
        <Route path="/tools/:toolId" element={<PageFrame><ToolHost /></PageFrame>} />
        <Route path="/notifications" element={<PageFrame><Notifications /></PageFrame>} />
        <Route path="/settings" element={<PageFrame><Settings /></PageFrame>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </HeldSuspense>
      </ErrorBoundary>
    </AnimatePresence>
  );
}

function AppBody() {
  const init = useFlow((s) => s.init);
  const ready = useFlow((s) => s.ready);
  const settings = useFlow((s) => s.db.settings);
  const focusMode = useUI((s) => s.focusMode);
  const backdrop = settings.backdrop?.effect ?? 'none';
  const miniMode = useUI((s) => s.miniMode);
  const locked = useUI((s) => s.locked);
  const setLocked = useUI((s) => s.setLocked);

  useThemeSync();
  useTimerTick();
  useScheduler();
  useGlobalKeys();
  useTraySync();
  useNativeBehaviorSync();
  useNativeActions();

  useEffect(() => { void init(); }, [init]);

  /* Tell the launch animation in index.html that the database is in memory, so
     it can hand the window over instead of guessing. */
  useEffect(() => {
    if (!ready) return;
    (window as unknown as { __flowBootDone?: () => void }).__flowBootDone?.();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!settings.sidebar.items.length) {
      // settings defaults already seed the sidebar; this guards migrated databases
      import('./lib/nav').then(({ DEFAULT_SIDEBAR }) => {
        useFlow.getState().updateSettings((s) => ({ ...s, sidebar: { ...s.sidebar, items: DEFAULT_SIDEBAR } }));
      });
    }
  }, [ready, settings.sidebar.items.length]);

  useEffect(() => {
    if (settings.behavior.appLock.enabled && settings.behavior.appLock.pin) setLocked(true);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Boot is covered by the launch animation in index.html (it sits above the
     document and leaves when `__flowBootDone` fires), so the shell renders
     nothing louder than its own background here — no second spinner fighting
     the paper plane. */
  if (!ready) {
    return <div className="h-full" style={{ background: 'var(--surface)' }} />;
  }

  return (
    /* One switch for the whole app: every framer-motion animation below honours
       the reduce-motion setting, so "less movement" is not a per-component
       decision that some panel forgets. */
    <MotionConfig reducedMotion={settings.behavior.reduceMotion ? 'always' : 'never'}>
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>
        {/* Opt-in atmosphere layer. It sits under a scrim so text keeps its
            contrast no matter which effect is running. */}
        {!miniMode && <AppBackdrop />}
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col"
          style={backdrop !== 'none' ? { background: 'color-mix(in srgb, var(--surface) 82%, transparent)' } : undefined}>
        {miniMode ? (
          <MiniMode />
        ) : (
          <>
            <Titlebar />
            <div className="flex min-h-0 flex-1">
              {!focusMode && <Sidebar onPrefetch={prefetchRoute} />}
              <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-1 md:px-6">
                <AnimatedRoutes />
              </main>
            </div>
          </>
        )}
        <CommandPalette />
        <QuickCapture />
        <Toasts />
        <TooltipLayer />
      <ContextMenuLayer />
        </div>
        {!settings.onboardingComplete && <Onboarding />}
        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
        {!miniMode && <TimerFullscreen />}
    </div>
    </MotionConfig>
  );
}

/** Router must wrap the effects layer: the reminder scheduler and the palette
 *  both navigate, and router hooks only exist inside a <Router>. */
export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* The outermost net. A fault in the shell itself (a bad database, a
          missing setting) used to leave a blank window and nothing else; now
          it lands on the same panel the routes use, with the data still on
          disk and a report the user can copy. */}
      <ErrorBoundary scope="app shell">
        <AppBody />
      </ErrorBoundary>
    </HashRouter>
  );
}
