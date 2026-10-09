/**
 * IPC surface for the real OS services. Registered in both standalone and session mode;
 * session-only channels (window management, shared state) no-op without a SessionManager.
 */
const { ipcMain, BrowserWindow } = require('electron');
const files = require('./files.cjs');
const pty = require('./pty.cjs');
const { openExternal } = require('./apps.cjs');

function register({ system, catalog, getSession }) {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return { ok: true, value: await fn(event, ...args) };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    });

  /* ------------------------------------------------------------ system */
  handle('sys:info', () => system.info());
  handle('sys:power', (_e, action) => system.power(action));
  handle('sys:power-caps', () => system.powerCapabilities());
  handle('sys:battery', () => system.battery());
  handle('sys:network', () => system.network());
  handle('sys:wifi-scan', () => system.wifiScan());
  handle('sys:wifi-enabled', (_e, on) => system.setWifiEnabled(on));
  handle('sys:wifi-connect', (_e, ssid, password) => system.wifiConnect(ssid, password));
  handle('sys:wifi-disconnect', () => system.wifiDisconnect());
  handle('sys:bluetooth', () => system.bluetooth());
  handle('sys:bt-power', (_e, on) => system.setBluetoothPowered(on));
  handle('sys:bt-device', (_e, devPath, connect) => system.bluetoothDevice(devPath, connect));
  handle('sys:volume', () => system.volume());
  handle('sys:set-volume', (_e, v) => system.setVolume(v));
  handle('sys:set-muted', (_e, m) => system.setMuted(m));
  handle('sys:brightness', () => system.brightness());
  handle('sys:set-brightness', (_e, v) => system.setBrightness(v));
  handle('sys:media', () => system.mediaPlayers());
  handle('sys:media-control', (_e, action, id) => system.mediaControl(action, id));
  handle('sys:processes', () => system.processes());
  handle('sys:kill', (_e, pid) => system.kill(pid));
  handle('sys:cpu', () => system.cpuUsage());
  handle('sys:notification-action', (_e, id, key) => system.invokeNotificationAction(id, key));
  handle('sys:notification-dismiss', (_e, id) => system.closeNotification(id, 2));

  const broadcast = (channel, payload) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
  };
  system.on('battery', (b) => broadcast('sys:battery-changed', b));
  system.on('network', (n) => broadcast('sys:network-changed', n));

  /* ------------------------------------------------------------- files */
  handle('fs:list', (_e, dir, opts) => files.list(dir, opts));
  handle('fs:stat', (_e, p) => files.stat(p));
  handle('fs:read-text', (_e, p) => files.readText(p));
  handle('fs:read-data-url', (_e, p) => files.readDataUrl(p));
  handle('fs:write-text', (_e, p, c) => files.writeText(p, c));
  handle('fs:write-data-url', (_e, p, d) => files.writeDataUrl(p, d));
  handle('fs:mkdir', (_e, p) => files.mkdir(p));
  handle('fs:rename', (_e, a, b) => files.rename(a, b));
  handle('fs:copy', (_e, a, b) => files.copy(a, b));
  handle('fs:trash', (_e, p) => files.trash(p));
  handle('fs:places', () => files.places());
  handle('fs:home', () => files.HOME);
  handle('fs:open', (_e, p) => openExternal(files.resolve(p)));

  /* --------------------------------------------------------------- pty */
  handle('pty:available', () => pty.available());
  handle('pty:create', (e, opts) => pty.create(e.sender, opts));
  ipcMain.on('pty:write', (_e, id, data) => pty.write(id, data));
  ipcMain.on('pty:resize', (_e, id, cols, rows) => pty.resize(id, cols, rows));
  ipcMain.on('pty:kill', (_e, id) => pty.kill(id));

  /* -------------------------------------------------------------- apps */
  handle('apps:list', () => catalog.apps);
  handle('apps:launch', (_e, id, opts) => {
    const s = getSession();
    if (s) return s.launchNative(id, opts);
    return catalog.launch(id, opts);
  });
  catalog.on('changed', (apps) => broadcast('apps:changed', apps));

  /* ----------------------------------------------------------- session */
  handle('session:open-app', (_e, appId, params) => getSession()?.openOposApp(appId, params));
  handle('session:window', (_e, op, id) => getSession()?.windowCommand(op, id));
  handle('session:home', () => getSession()?.home());
  handle('session:back', () => getSession()?.back());
  handle('session:logout', () => getSession()?.quit());
  ipcMain.on('state:get', (e) => {
    e.returnValue = getSession() ? getSession().state.get() : null;
  });
  ipcMain.on('state:patch', (e, p) => getSession()?.state.patch(p, e.sender.id));
}

/** Forward shared-state patches to every renderer. Call once the SessionManager exists. */
function wireStateBroadcast(session) {
  session.state.on('patch', (changed, origin) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('state:patch', changed, origin);
    }
  });
}

module.exports = { register, wireStateBroadcast };
