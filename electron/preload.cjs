const { contextBridge, ipcRenderer } = require('electron');

/** Small, typed surface exposed to the renderer. Nothing else crosses the bridge. */
contextBridge.exposeInMainWorld('flow', {
  platform: 'electron',
  load: () => ipcRenderer.invoke('flow:load'),
  save: (json) => ipcRenderer.invoke('flow:save', json),
  loginItem: (enabled) => ipcRenderer.invoke('flow:login-item', enabled),
  window: (action, value) => {
    if (action === 'pin') ipcRenderer.send('flow:pin', value);
    else ipcRenderer.send('flow:window', action);
  },
  behavior: (behavior) => ipcRenderer.send('flow:behavior', behavior),
  notify: (payload) => ipcRenderer.send('flow:notify', payload),
  schedule: (json) => ipcRenderer.send('flow:schedule', json),
  tray: (state) => ipcRenderer.send('flow:tray', state),
  copy: (text) => ipcRenderer.send('flow:copy', text),
  exportFile: (name, content) => ipcRenderer.send('flow:export', name, content),
  onAction: (cb) => {
    /* Returns a disposer: React remounts components, and a listener that can
       never be removed stacks up and fires the action several times. */
    const handler = (_e, action, payload) => cb(action, payload);
    ipcRenderer.on('flow:action', handler);
    return () => ipcRenderer.removeListener('flow:action', handler);
  },
  windowState: () => ipcRenderer.invoke('flow:window-state'),
});
