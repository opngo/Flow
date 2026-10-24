const { contextBridge, ipcRenderer } = require('electron');

/** Small, typed surface exposed to the renderer. Nothing else crosses the bridge. */
contextBridge.exposeInMainWorld('flow', {
  platform: 'electron',
  load: () => ipcRenderer.invoke('flow:load'),
  save: (json) => ipcRenderer.invoke('flow:save', json),
  window: (action, value) => {
    if (action === 'pin') ipcRenderer.send('flow:pin', value);
    else ipcRenderer.send('flow:window', action);
  },
  notify: (payload) => ipcRenderer.send('flow:notify', payload),
  schedule: (json) => ipcRenderer.send('flow:schedule', json),
  tray: (state) => ipcRenderer.send('flow:tray', state),
  copy: (text) => ipcRenderer.send('flow:copy', text),
  exportFile: (name, content) => ipcRenderer.send('flow:export', name, content),
  onAction: (cb) => {
    ipcRenderer.on('flow:action', (_e, action, payload) => cb(action, payload));
  },
  windowState: async () => ({ maximized: false }),
});
