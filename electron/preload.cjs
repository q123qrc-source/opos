/**
 * OPOS Shell — preload for the shell renderer.
 * Exposes a narrow, typed bridge (`window.opos`) — no Node primitives leak into the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const shimPath = ipcRenderer.sendSync('opos:shim-path');

contextBridge.exposeInMainWorld('opos', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  shimPath,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    setFullscreen: (value) => ipcRenderer.send('window:fullscreen', value),
    getState: () => ipcRenderer.invoke('window:get-state'),
    onState: (cb) => subscribe('window:state', cb),
  },
  mode: {
    changed: (mode) => ipcRenderer.send('mode:changed', mode),
    onRequest: (cb) => subscribe('mode:request', cb),
  },
  media: {
    onKey: (cb) => subscribe('opos:media', cb),
  },
  drm: {
    status: () => ipcRenderer.invoke('drm:status'),
  },
  system: {
    stats: () => ipcRenderer.invoke('system:stats'),
  },
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
});
