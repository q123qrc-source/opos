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
// Session Back for OPOS app windows → a DOM event the app surface listens for.
ipcRenderer.on('opos:session-back', () => window.dispatchEvent(new Event('opos-session-back')));
const sessionState = ipcRenderer.sendSync('state:get'); // null unless OPOS is the desktop session

/** Invoke a main-process service; rejects with the service's error message. */
async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

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

  /* ------------------------------------------------ real OS services */
  os: {
    info: () => call('sys:info'),
    power: (action) => call('sys:power', action),
    powerCaps: () => call('sys:power-caps'),
    battery: () => call('sys:battery'),
    onBattery: (cb) => subscribe('sys:battery-changed', cb),
    network: () => call('sys:network'),
    onNetwork: (cb) => subscribe('sys:network-changed', cb),
    wifiScan: () => call('sys:wifi-scan'),
    setWifiEnabled: (on) => call('sys:wifi-enabled', on),
    wifiConnect: (ssid, password) => call('sys:wifi-connect', ssid, password),
    wifiDisconnect: () => call('sys:wifi-disconnect'),
    bluetooth: () => call('sys:bluetooth'),
    setBluetoothPowered: (on) => call('sys:bt-power', on),
    bluetoothDevice: (devPath, connect) => call('sys:bt-device', devPath, connect),
    volume: () => call('sys:volume'),
    setVolume: (v) => call('sys:set-volume', v),
    setMuted: (m) => call('sys:set-muted', m),
    brightness: () => call('sys:brightness'),
    setBrightness: (v) => call('sys:set-brightness', v),
    media: () => call('sys:media'),
    mediaControl: (action, id) => call('sys:media-control', action, id),
    processes: () => call('sys:processes'),
    kill: (pid) => call('sys:kill', pid),
    cpu: () => call('sys:cpu'),
    notificationAction: (id, key) => call('sys:notification-action', id, key),
    dismissNotification: (id) => call('sys:notification-dismiss', id),
  },
  fs: {
    list: (dir, opts) => call('fs:list', dir, opts),
    stat: (p) => call('fs:stat', p),
    readText: (p) => call('fs:read-text', p),
    readDataUrl: (p) => call('fs:read-data-url', p),
    writeText: (p, c) => call('fs:write-text', p, c),
    writeDataUrl: (p, d) => call('fs:write-data-url', p, d),
    mkdir: (p) => call('fs:mkdir', p),
    rename: (a, b) => call('fs:rename', a, b),
    copy: (a, b) => call('fs:copy', a, b),
    trash: (p) => call('fs:trash', p),
    places: () => call('fs:places'),
    home: () => call('fs:home'),
    open: (p) => call('fs:open', p),
  },
  pty: {
    available: () => call('pty:available'),
    create: (opts) => call('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (cb) => {
      const l = (_e, id, data) => cb(id, data);
      ipcRenderer.on('pty:data', l);
      return () => ipcRenderer.removeListener('pty:data', l);
    },
    onExit: (cb) => {
      const l = (_e, id, code) => cb(id, code);
      ipcRenderer.on('pty:exit', l);
      return () => ipcRenderer.removeListener('pty:exit', l);
    },
  },
  apps: {
    list: () => call('apps:list'),
    launch: (id, opts) => call('apps:launch', id, opts),
    onChange: (cb) => subscribe('apps:changed', cb),
  },
  session: {
    active: sessionState !== null,
    initialState: sessionState,
    patch: (p) => ipcRenderer.send('state:patch', p),
    onPatch: (cb) => {
      const l = (_e, changed, origin) => cb(changed, origin);
      ipcRenderer.on('state:patch', l);
      return () => ipcRenderer.removeListener('state:patch', l);
    },
    openApp: (appId, params) => call('session:open-app', appId, params),
    window: (op, id) => call('session:window', op, id),
    home: () => call('session:home'),
    back: () => call('session:back'),
    logout: () => call('session:logout'),
    onAppParams: (cb) => subscribe('opos:app-params', cb),
  },
});
