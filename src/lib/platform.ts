/** Bridge to the Electron main process when running packaged / electron:dev.
 *  In the browser build every call falls back to an in-page implementation so
 *  the exact same renderer code runs in the live preview. */

export type FlowBridge = {
  platform: 'electron';
  save: (json: string) => Promise<{ ok: boolean }>;
  load: () => Promise<string | null>;
  window: (action: 'minimize' | 'maximize' | 'close' | 'pin', value?: boolean) => void;
  notify: (payload: { title: string; body: string; route?: string; targetId?: string }) => void;
  schedule: (json: string) => void;
  tray: (state: { timerLabel: string; running: boolean }) => void;
  behavior: (behavior: { closeToTray?: boolean; minimizeToTray?: boolean; pinOnTop?: boolean; hotkeys?: Record<string, string> }) => void;
  copy: (text: string) => void;
  exportFile: (name: string, content: string) => void;
  /** Subscribe to main-process actions; returns an unsubscribe function. */
  onAction: (cb: (action: string, payload?: unknown) => void) => (() => void) | void;
  windowState: () => Promise<{ maximized: boolean; focused?: boolean }>;
  loginItem: (enabled: boolean) => Promise<boolean>;
};

declare global {
  interface Window { flow?: FlowBridge }
}

export const isElectron = () => typeof window !== 'undefined' && !!window.flow;

export const platform = () => (isElectron() ? 'electron' : 'web');

/** Only meaningful in the desktop build; the browser reports false. */
export async function setLaunchAtStartup(enabled: boolean): Promise<boolean> {
  if (!window.flow?.loginItem) return false;
  try {
    return await window.flow.loginItem(enabled);
  } catch {
    return false;
  }
}

export function winAction(action: 'minimize' | 'maximize' | 'close' | 'pin', value?: boolean) {
  window.flow?.window(action, value);
}

export function download(name: string, content: string, mime = 'text/plain') {
  if (window.flow) {
    window.flow.exportFile(name, content);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** System notification: Electron main-process Notification when available,
 *  otherwise the Web Notification API (graceful fallback, spec §10.1.3). */
export function systemNotify(payload: { title: string; body: string; route?: string; targetId?: string }) {
  if (window.flow) {
    window.flow.notify(payload);
    return;
  }
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    const n = new Notification(payload.title, { body: payload.body, silent: false });
    n.onclick = () => {
      window.focus();
      if (payload.route) window.location.hash = payload.route;
    };
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export function notifyHealth() {
  const support = typeof Notification !== 'undefined';
  return {
    platform: platform(),
    supported: support,
    permission: support ? Notification.permission : 'unsupported',
    appUserModelId: isElectron() ? 'com.flow.app' : null,
    shortcut: isElectron(),
  };
}
