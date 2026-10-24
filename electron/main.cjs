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
    mainWindow.loadURL(VITE_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (process.env.FLOW_START_HIDDEN === '1') return;
    mainWindow.show();
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
  // 16x16 template-ish icon drawn from a data URL so no asset pipeline is needed
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="4" fill="#7c8cff"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function buildTrayMenu(label = 'No timer', running = false) {
  return Menu.buildFromTemplate([
    { label: `Flow — ${label}`, enabled: false },
    { type: 'separator' },
    { label: running ? 'Pause timer' : 'Start focus', click: () => mainWindow?.webContents.send('flow:action', 'toggle-timer') },
    { label: 'Quick add task', click: () => showWindow('/todos') },
    { label: 'Open Sound Studio', click: () => showWindow('/sound') },
    { label: 'Mute all sound', click: () => mainWindow?.webContents.send('flow:action', 'mute-sound') },
    { type: 'separator' },
    { label: 'Show Flow', click: () => showWindow() },
    { label: 'Hide window', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Flow');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => (mainWindow?.isVisible() ? mainWindow.hide() : showWindow()));
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
    mainWindow?.webContents.send('flow:action', 'reminder-delivered', reminder.id);
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
    mainWindow?.webContents.send('flow:action', 'complete-reminder', reminder?.targetId);
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

/* Start with the system. Hidden launch keeps the app out of the way until it is
 * wanted; the tray icon is the way back in. */
ipcMain.handle('flow:login-item', (e, enabled) => {
  if (e) { /* sender kept for symmetry with the renderer bridge */ }
  const app = require('electron').app;
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

/* ---------------------------------------------------------------- shortcuts */
function registerShortcuts() {
  const shortcuts = {
    'CommandOrControl+Shift+Space': 'quick-add',
    'CommandOrControl+Shift+P': 'toggle-timer',
    'CommandOrControl+Shift+F': 'mini-mode',
    'CommandOrControl+Shift+M': 'mute-sound',
    'CommandOrControl+Shift+D': 'focus-mode',
  };
  for (const [accel, action] of Object.entries(shortcuts)) {
    globalShortcut.register(accel, () => {
      showWindow();
      mainWindow?.webContents.send('flow:action', action);
    });
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
      mainWindow?.webContents.send('flow:action', 'resume');
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
