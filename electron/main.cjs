/* Flow — Electron main process.
 * All disk, tray, notification, global-shortcut and timer-authority logic lives here.
 * The renderer is untouchable: contextIsolation on, nodeIntegration off, narrow preload bridge.
 */
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, globalShortcut, powerMonitor, nativeImage, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/* 1. AppUserModelID must be set before anything can raise a notification (spec §10.1).
 *    It has to match "appId" in electron-builder config. */
app.setAppUserModelId('com.flow.app');

const isDev = !app.isPackaged;
const VITE_URL = process.env.FLOW_DEV_URL || 'http://localhost:5173';

const userData = () => app.getPath('userData');
const dbPath = () => path.join(userData(), 'flow.db.json');
const statePath = () => path.join(userData(), 'window-state.json');
const backupDir = () => path.join(userData(), 'backups');
const remindersPath = () => path.join(userData(), 'reminders.json');

let mainWindow = null;
let tray = null;
let quitting = false;
let scheduledTimer = null;
let reminders = [];
let closeToTray = true;
let minimizeToTray = false;

/* ---------------------------------------------------------------- storage */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function windowState() {
  const saved = readJSON(statePath(), null);
  return saved || { width: 1360, height: 900, x: undefined, y: undefined, maximized: false };
}
function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  writeJSON(statePath(), { ...bounds, maximized: mainWindow.isMaximized() });
}

/** Rolling local backups: newest 10 kept (spec §5 autosave + retention). */
function backup(dbJson) {
  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(backupDir(), `flow-${stamp}.json`), dbJson);
  const files = fs.readdirSync(backupDir()).filter((f) => f.startsWith('flow-')).sort();
  while (files.length > 10) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(backupDir(), oldest)); } catch { /* ignore */ }
  }
}

/* ---------------------------------------------------------------- window */

/** A dev server that is not listening yet must not leave a blank window.
 *  Retry for ~20s, then say what is wrong in the window itself. */
function loadDevUrl(win, attempt = 0) {
  win.loadURL(VITE_URL).catch(() => {
    if (win.isDestroyed()) return;
    if (attempt < 40) {
      setTimeout(() => loadDevUrl(win, attempt + 1), 500);
      return;
    }
    console.error(`Flow: could not reach the dev server at ${VITE_URL}`);
    win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(devFailurePage()),
    );
    win.show();
  });
}

function devFailurePage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Flow</title>
  <style>
    html,body{height:100%;margin:0;background:#0b0d12;color:#e7e9f2;
      font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    main{max-width:520px;margin:0 auto;padding:64px 24px}
    h1{font-size:16px;font-weight:600;margin:0 0 8px}
    p{color:#9aa1b8;margin:0 0 12px}
    code{background:#151925;border-radius:6px;padding:2px 6px;color:#b9c1ff}
  </style></head><body><main>
    <h1>The dev server is not running</h1>
    <p>Flow's window opened, but nothing answered at <code>${VITE_URL}</code>.</p>
    <p>Start the app with <code>npm run electron:dev</code>, which runs Vite and Electron together,
       or start <code>npm run dev</code> and reload this window.</p>
    <p>If port ${VITE_URL.split(':').pop()} is taken by another program, run
       <code>FLOW_PORT=5180 npm run electron:dev</code>.</p>
  </main></body></html>`;
}

function createWindow() {
  const state = windowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0b0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  if (isDev) {
    loadDevUrl(mainWindow);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (process.env.FLOW_START_HIDDEN === '1') return;
    mainWindow.show();
  });

  /* Never leave the user with an invisible window if the first paint never
     happens (a failed load, a renderer crash). */
  mainWindow.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || !isDev || code === -3) return; // -3 = aborted, our own retry
    console.error(`Flow: renderer failed to load ${url} (${code} ${description})`);
    mainWindow.show();
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Flow: renderer process gone —', details.reason);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.reload();
  });

  mainWindow.on('close', (event) => {
    saveWindowState();
    if (!quitting && closeToTray) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'win32') flashTray();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  /* Double-clicking the titlebar, Win+Up or a window manager gesture all
     maximize the window without touching the renderer's own toggle, so the
     shell is told what actually happened. */
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    mainWindow.on(event, () => sendToRenderer('window-state', currentWindowState()));
  }

  // open external links in the OS browser, never in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow(route) {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
  if (route) mainWindow.webContents.send('flow:action', 'navigate', route);
}

/* ---------------------------------------------------------------- tray */
function trayIcon() {
  /* nativeImage cannot decode SVG — it returns an empty image, and an empty
     image makes `new Tray()` fail on Windows and Linux, which killed the app
     before its window ever appeared. These are real PNGs shipped beside the
     main process, with a generated fallback so the tray can never be the
     reason Flow refuses to start. */
  for (const name of ['tray-32.png', 'tray-16.png']) {
    const file = path.join(__dirname, 'assets', name);
    if (!fs.existsSync(file)) continue;
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) return image;
  }
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    buffer[i * 4] = 0x7c; buffer[i * 4 + 1] = 0x8c; buffer[i * 4 + 2] = 0xff; buffer[i * 4 + 3] = 0xff;
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function buildTrayMenu(label = 'No timer', running = false) {
  return Menu.buildFromTemplate([
    { label: `Flow — ${label}`, enabled: false },
    { type: 'separator' },
    { label: running ? 'Pause timer' : 'Start focus', click: () => sendToRenderer('toggle-timer') },
    { label: 'Quick add task', click: () => showWindow('/todos') },
    { label: 'Open Sound Studio', click: () => showWindow('/sound') },
    { label: 'Mute all sound', click: () => sendToRenderer('mute-sound') },
    { type: 'separator' },
    { label: 'Show Flow', click: () => showWindow() },
    { label: 'Hide window', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  try {
    tray = new Tray(trayIcon());
  } catch (err) {
    /* No tray on this desktop? Flow still runs, it just cannot live in the
       corner — quitting on close would be a surprise, so don't. */
    console.error('Flow: tray unavailable, continuing without it', err);
    closeToTray = false;
    return;
  }
  tray.setToolTip('Flow');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => (mainWindow?.isVisible() ? mainWindow.hide() : showWindow()));
}

/** Sends to the renderer only when there is a live renderer to send to. */
function sendToRenderer(action, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const contents = mainWindow.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send('flow:action', action, payload);
}

function flashTray() {
  if (!tray) return;
  tray.setToolTip('Flow — reminders waiting');
}

/* ------------------------------------------------- notifications + scheduler */
/** Scheduler authority: single precise timer for the next reminder plus a 30s
 *  safety tick. Persisted so reminders survive restarts; resumed on wake. */
function loadReminders() {
  reminders = readJSON(remindersPath(), []);
  reschedule();
}

function reschedule() {
  if (scheduledTimer) clearTimeout(scheduledTimer);
  const now = Date.now();
  const next = reminders
    .filter((r) => !r.delivered)
    .map((r) => new Date(r.snoozedUntil ?? r.fireAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)[0];
  const delay = next ? Math.max(250, Math.min(next - now, 2147483647)) : 30000;
  scheduledTimer = setTimeout(fireDue, delay);
}

function fireDue() {
  const now = Date.now();
  const due = reminders.filter((r) => !r.delivered && new Date(r.snoozedUntil ?? r.fireAt).getTime() <= now);
  for (const reminder of due) {
    const missed = now - new Date(reminder.snoozedUntil ?? reminder.fireAt).getTime() > 5 * 60 * 1000;
    toast(reminder.title, reminder.body, reminder, missed);
    reminder.delivered = true;
    sendToRenderer('reminder-delivered', reminder.id);
  }
  writeJSON(remindersPath(), reminders);
  clearTimeout(scheduledTimer);
  scheduledTimer = setTimeout(fireDue, 30000); // safety tick
}

function toast(title, body, reminder, missed) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: missed ? `Missed: ${title}` : title,
    body: body || '',
    silent: false,
    actions: reminder?.actions?.includes('complete') ? [{ type: 'button', text: 'Complete' }] : [],
    closeButtonText: 'Dismiss',
  });
  n.on('click', () => showWindow(reminder?.route));
  n.on('action', () => {
    sendToRenderer('complete-reminder', reminder?.targetId);
    showWindow(reminder?.route);
  });
  n.show();
}

/* ---------------------------------------------------------------- ipc */
ipcMain.handle('flow:load', () => {
  try { return fs.readFileSync(dbPath(), 'utf8'); } catch { return null; }
});

ipcMain.handle('flow:save', (_e, json) => {
  try {
    writeJSON(dbPath(), JSON.parse(json));
    backup(json);
    return { ok: true };
  } catch (err) {
    console.error('Flow: save failed', err);
    return { ok: false };
  }
});

ipcMain.on('flow:window', (_e, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'close') mainWindow.close();
});

ipcMain.on('flow:pin', (_e, value) => mainWindow?.setAlwaysOnTop(!!value));

ipcMain.on('flow:behavior', (_e, behavior) => applyBehavior(behavior));

ipcMain.handle('flow:window-state', () => currentWindowState());

/* Start with the system. Hidden launch keeps the app out of the way until it is
 * wanted; the tray icon is the way back in. */
ipcMain.handle('flow:login-item', (_e, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: !!enabled,
    path: process.execPath,
  });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('flow:notify', (_e, payload) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: payload.title, body: payload.body });
  n.on('click', () => showWindow(payload.route));
  n.show();
});

ipcMain.on('flow:schedule', (_e, json) => {
  try {
    reminders = JSON.parse(json);
    writeJSON(remindersPath(), reminders);
    reschedule();
  } catch (err) {
    console.error('Flow: bad schedule payload', err);
  }
});

ipcMain.on('flow:tray', (_e, state) => {
  if (tray) tray.setContextMenu(buildTrayMenu(state?.timerLabel, state?.running));
});

ipcMain.on('flow:copy', (_e, text) => {
  require('electron').clipboard.writeText(text);
});

ipcMain.on('flow:export', (_e, name, content) => {
  const target = dialog.showSaveDialogSync(mainWindow, { defaultPath: path.join(app.getPath('downloads'), name) });
  if (target) fs.writeFileSync(target, content);
});

/* ---------------------------------------------------------------- behaviour */
/* closeToTray / minimizeToTray / pinOnTop and the hotkey map live in the
 * database, so the main process has to be told about them. Before this, the
 * two tray switches in Settings changed a stored boolean that nothing read. */
function applyBehavior(behavior) {
  if (!behavior || typeof behavior !== 'object') return;
  if (typeof behavior.closeToTray === 'boolean') closeToTray = behavior.closeToTray;
  if (typeof behavior.minimizeToTray === 'boolean') minimizeToTray = behavior.minimizeToTray;
  if (typeof behavior.pinOnTop === 'boolean' && mainWindow) mainWindow.setAlwaysOnTop(behavior.pinOnTop);
  if (behavior.hotkeys && typeof behavior.hotkeys === 'object') registerShortcuts(behavior.hotkeys);
}

function currentWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false, focused: false };
  return { maximized: mainWindow.isMaximized(), focused: mainWindow.isFocused() };
}

/* ---------------------------------------------------------------- shortcuts */
function registerShortcuts(overrides = {}) {
  const keys = {
    quickAdd: 'CommandOrControl+Shift+Space',
    toggleTimer: 'CommandOrControl+Shift+P',
    toggleWindow: 'CommandOrControl+Shift+F',
    toggleSound: 'CommandOrControl+Shift+M',
    focusMode: 'CommandOrControl+Shift+D',
    ...overrides,
  };
  const shortcuts = {
    [keys.quickAdd]: 'quick-add',
    [keys.toggleTimer]: 'toggle-timer',
    [keys.toggleWindow]: 'mini-mode',
    [keys.toggleSound]: 'mute-sound',
    [keys.focusMode]: 'focus-mode',
  };
  globalShortcut.unregisterAll();
  for (const [accel, action] of Object.entries(shortcuts)) {
    const ok = globalShortcut.register(accel, () => {
      showWindow();
      sendToRenderer(action);
    });
    if (!ok) console.warn(`Flow: shortcut ${accel} is taken by another app`);
  }
}

/* ---------------------------------------------------------------- lifecycle */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    createWindow();
    createTray();
    loadReminders();
    registerShortcuts();

    powerMonitor.on('resume', () => {
      // recompute everything after sleep: timers are clock-derived in the renderer
      sendToRenderer('resume');
      reschedule();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (closeToTray) return;
      app.quit();
    }
  });

  app.on('before-quit', () => { quitting = true; });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (scheduledTimer) clearTimeout(scheduledTimer);
  });
}

module.exports = { closeToTray };
