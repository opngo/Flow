import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Titlebar } from './components/Shell';
import { CommandPalette } from './components/CommandPalette';
import { QuickCapture } from './components/QuickCapture';
import { Toasts } from './components/Toasts';
import { Onboarding } from './components/Onboarding';
import { LockScreen } from './components/LockScreen';
import { MiniMode } from './components/MiniMode';
import { AppBackdrop } from './components/Backdrop';
import { TimerFullscreen } from './components/TimerFullscreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useFlow } from './store';
import { useUI } from './ui';
import { useGlobalKeys, useScheduler, useThemeSync, useTimerTick, useTraySync } from './hooks/useAppEffects';
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

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
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

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <ErrorBoundary scope={location.pathname}>
      <Suspense fallback={<PageSkeleton />}>
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
      </Suspense>
      </ErrorBoundary>
    </AnimatePresence>
  );
}

function AppBody() {
  const init = useFlow((s) => s.init);
  const ready = useFlow((s) => s.ready);
  const settings = useFlow((s) => s.db.settings);
  const focusMode = useUI((s) => s.focusMode);
  const backdrop = settings.backdrop.effect;
  const miniMode = useUI((s) => s.miniMode);
  const locked = useUI((s) => s.locked);
  const setLocked = useUI((s) => s.setLocked);

  useThemeSync();
  useTimerTick();
  useScheduler();
  useGlobalKeys();
  useTraySync();

  useEffect(() => { void init(); }, [init]);

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

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 text-muted"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px]" style={{ background: 'var(--accent)' }}>
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-white text-sm font-semibold">F</motion.span>
          </span>
          <span className="text-[12.5px]">Opening your local database</span>
        </motion.div>
      </div>
    );
  }

  return (
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
              {!focusMode && <Sidebar />}
              <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-1 md:px-6">
                <AnimatedRoutes />
              </main>
            </div>
          </>
        )}
        <CommandPalette />
        <QuickCapture />
        <Toasts />
        </div>
        {!settings.onboardingComplete && <Onboarding />}
        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
        {!miniMode && <TimerFullscreen />}
    </div>
  );
}

/** Router must wrap the effects layer: the reminder scheduler and the palette
 *  both navigate, and router hooks only exist inside a <Router>. */
export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppBody />
    </HashRouter>
  );
}
