import { create } from 'zustand';

export type ToastItem = { id: string; title: string; body?: string; tone?: 'default' | 'success' | 'warning' | 'danger'; route?: string; actionLabel?: string; action?: () => void };

type UIState = {
  paletteOpen: boolean;
  paletteQuery: string;
  quickAddOpen: boolean;
  notificationOpen: boolean;
  sidebarHover: boolean;
  sidebarPinned: boolean;
  miniMode: boolean;
  focusMode: boolean;
  immersive: boolean;
  /** Which clock the full-screen view is showing. Session-only. */
  immersiveMode: 'pomodoro' | 'timer' | 'stopwatch';
  locked: boolean;
  toasts: ToastItem[];
  openPalette: (query?: string) => void;
  closePalette: () => void;
  setQuickAdd: (open: boolean) => void;
  setNotificationOpen: (open: boolean) => void;
  setSidebarHover: (v: boolean) => void;
  toggleSidebarPinned: () => void;
  setMiniMode: (v: boolean) => void;
  setFocusMode: (v: boolean) => void;
  setImmersive: (v: boolean) => void;
  setImmersiveMode: (m: 'pomodoro' | 'timer' | 'stopwatch') => void;
  setLocked: (v: boolean) => void;
  toast: (t: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
};

export const useUI = create<UIState>((set, get) => ({
  paletteOpen: false,
  paletteQuery: '',
  quickAddOpen: false,
  notificationOpen: false,
  sidebarHover: false,
  sidebarPinned: false,
  miniMode: false,
  focusMode: false,
  immersive: false,
  immersiveMode: 'pomodoro',
  locked: false,
  toasts: [],
  openPalette: (query = '') => set({ paletteOpen: true, paletteQuery: query }),
  closePalette: () => set({ paletteOpen: false, paletteQuery: '' }),
  setQuickAdd: (open) => set({ quickAddOpen: open }),
  setNotificationOpen: (open) => set({ notificationOpen: open }),
  setSidebarHover: (v) => set({ sidebarHover: v }),
  toggleSidebarPinned: () => set({ sidebarPinned: !get().sidebarPinned }),
  setMiniMode: (v) => set({ miniMode: v }),
  setFocusMode: (v) => set({ focusMode: v }),
  setImmersive: (v) => set({ immersive: v }),
  setImmersiveMode: (m) => set({ immersiveMode: m }),
  setLocked: (v) => set({ locked: v }),
  toast: (t) => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), t.actionLabel ? 6500 : 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));
