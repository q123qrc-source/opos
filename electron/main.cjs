/**
 * OPOS Shell — Electron main process.
 *
 * Responsibilities:
 *  - Widevine CDM bootstrap (castLabs ECS `components` API, or a manually supplied CDM path).
 *  - The single frameless "device" window that hosts the convergence shell.
 *  - Hardening + compatibility for every <webview> (forced shim preload, plugins, permissions, UA).
 *  - IPC: window state, mode switching, media keys, DRM status, system telemetry.
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Menu,
  session,
  shell,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const SHIM_PATH = path.join(__dirname, 'webview-shim.cjs');
const APP_PARTITION = 'persist:opos-apps';

/* -------------------------------------------------------------------------- */
/* 1. Widevine CDM                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Stock Electron does not ship Widevine. Two supported paths:
 *   a) castLabs "Electron for Content Security" (ECS) — exposes `components`, which downloads and
 *      registers the CDM via Google's component updater. Detected automatically.
 *   b) A local CDM (e.g. from an installed Chrome) passed through the legacy Chromium switches,
 *      either from OPOS_WIDEVINE_PATH / OPOS_WIDEVINE_VERSION or auto-discovered below.
 */
const electronModule = require('electron');
const components = electronModule.components; // only defined on castLabs ECS builds

function findLocalWidevine() {
  if (process.env.OPOS_WIDEVINE_PATH) {
    return { path: process.env.OPOS_WIDEVINE_PATH, version: process.env.OPOS_WIDEVINE_VERSION || '' };
  }
  const libName = { win32: 'widevinecdm.dll', darwin: 'libwidevinecdm.dylib', linux: 'libwidevinecdm.so' }[process.platform];
  const arch = { x64: 'x64', arm64: 'arm64', ia32: 'x86' }[process.arch] || process.arch;
  const plat = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
  const roots = {
    win32: [path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data/WidevineCdm')],
    darwin: [path.join(os.homedir(), 'Library/Application Support/Google/Chrome/WidevineCdm')],
    linux: [path.join(os.homedir(), '.config/google-chrome/WidevineCdm'), '/opt/google/chrome/WidevineCdm'],
  }[process.platform] || [];
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      // Chrome layout: <root>/<version>/_platform_specific/<plat>_<arch>/<lib>  (or directly <root>/_platform_specific)
      const versions = fs.readdirSync(root).filter((d) => /^\d+\./.test(d)).sort().reverse();
      const candidates = versions.length ? versions.map((v) => [path.join(root, v), v]) : [[root, '']];
      for (const [dir, version] of candidates) {
        const lib = path.join(dir, '_platform_specific', `${plat}_${arch}`, libName);
        if (fs.existsSync(lib)) return { path: lib, version };
      }
    } catch {
      /* ignore unreadable roots */
    }
  }
  return null;
}

const drmState = {
  provider: components ? 'castlabs-ecs' : 'none',
  status: 'pending',
  detail: '',
  cdmPath: null,
};

const localCdm = components ? null : findLocalWidevine();
if (localCdm) {
  app.commandLine.appendSwitch('widevine-cdm-path', localCdm.path);
  if (localCdm.version) app.commandLine.appendSwitch('widevine-cdm-version', localCdm.version);
  drmState.provider = 'local-cdm';
  drmState.cdmPath = localCdm.path;
}

// Media / DRM friendly Chromium switches.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,HardwareMediaKeyHandling,MediaSessionService');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

async function initWidevine() {
  if (components) {
    try {
      await components.whenReady();
      const status = components.status();
      drmState.status = 'ready';
      drmState.detail = JSON.stringify(status);
    } catch (err) {
      drmState.status = 'error';
      drmState.detail = String(err && err.message ? err.message : err);
    }
  } else if (localCdm) {
    drmState.status = 'registered';
    drmState.detail = `Local CDM ${localCdm.version || ''} at ${localCdm.path}`;
  } else {
    drmState.status = 'unavailable';
    drmState.detail =
      'No Widevine CDM found. Install the castLabs ECS build of Electron or set OPOS_WIDEVINE_PATH / OPOS_WIDEVINE_VERSION.';
  }
  console.log(`[OPOS] Widevine: provider=${drmState.provider} status=${drmState.status} ${drmState.detail}`);
}

/* -------------------------------------------------------------------------- */
/* 2. Sessions, permissions, user agent                                        */
/* -------------------------------------------------------------------------- */

// Many streaming services refuse UA strings that advertise Electron.
const CLEAN_UA = app.userAgentFallback.replace(/\s?(Electron|opos-shell|OPOS Shell)\/[\d.\w-]+/gi, '');
app.userAgentFallback = CLEAN_UA;

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'mediaKeySystem',
  'geolocation',
  'notifications',
  'fullscreen',
  'pointerLock',
  'clipboard-read',
  'clipboard-sanitized-write',
  'speaker-selection',
  'window-management',
]);

function hardenSession(ses) {
  ses.setUserAgent(CLEAN_UA);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  if (ses.setDevicePermissionHandler) ses.setDevicePermissionHandler(() => true); // gamepads / HID for Cloud Gamer
}

/* -------------------------------------------------------------------------- */
/* 3. Main window                                                              */
/* -------------------------------------------------------------------------- */

/** @type {BrowserWindow | null} */
let mainWindow = null;
let currentMode = 'desktop';

function sendWindowState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen(),
    focused: mainWindow.isFocused(),
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, width),
    height: Math.min(960, height),
    minWidth: 360,
    minHeight: 560,
    frame: false,
    backgroundColor: '#07080d',
    show: false,
    title: 'OPOS Shell',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true, // the Universal App Container
      plugins: true, // required for the Widevine CDM
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur']) {
    mainWindow.on(ev, sendWindowState);
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Every <webview> is forced through the compatibility shim with DRM-capable preferences,
  // regardless of what the renderer asked for.
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    delete webPreferences.preloadURL;
    webPreferences.preload = SHIM_PATH;
    webPreferences.plugins = true;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.sandbox = false; // shim needs ipcRenderer.sendToHost + contextBridge
    webPreferences.webSecurity = true;
    if (!/^(https?|file|about|data):/i.test(params.src || 'about:blank')) params.src = 'about:blank';
  });

  // Media keys arriving while the shell itself is focused (also covered by globalShortcut).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const action = mediaActionForKey(input.key);
    if (action) {
      event.preventDefault();
      mainWindow.webContents.send('opos:media', action);
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function mediaActionForKey(key) {
  switch (key) {
    case 'MediaPlayPause':
      return 'playpause';
    case 'MediaTrackNext':
    case 'MediaNextTrack':
      return 'next';
    case 'MediaTrackPrevious':
    case 'MediaPreviousTrack':
      return 'previous';
    case 'MediaStop':
      return 'stop';
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Guest (webview) contents                                                 */
/* -------------------------------------------------------------------------- */

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // Popups (OAuth, target=_blank) open inside the same container instead of new OS windows.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) contents.loadURL(url);
    return { action: 'deny' };
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !mainWindow) return;
    const action = mediaActionForKey(input.key);
    if (action) {
      event.preventDefault();
      mainWindow.webContents.send('opos:media', action);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. IPC                                                                      */
/* -------------------------------------------------------------------------- */

ipcMain.on('opos:shim-path', (event) => {
  event.returnValue = pathToFileURL(SHIM_PATH).toString();
});

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:fullscreen', (_e, value) => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(typeof value === 'boolean' ? value : !mainWindow.isFullScreen());
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:get-state', () =>
  mainWindow
    ? { maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen(), focused: mainWindow.isFocused() }
    : null,
);

// Renderer notifies main when the convergence engine changes mode.
ipcMain.on('mode:changed', (_e, mode) => {
  currentMode = mode;
  if (!mainWindow) return;
  mainWindow.setTitle(`OPOS Shell — ${mode.toUpperCase()} mode`);
});

// Renderer asks main to request a mode (used by menus / accelerators echo back to renderer).
function requestMode(mode) {
  if (mainWindow) mainWindow.webContents.send('mode:request', mode);
}

ipcMain.handle('drm:status', () => ({ ...drmState, electron: process.versions.electron, chrome: process.versions.chrome }));

let lastCpu = os.cpus();
ipcMain.handle('system:stats', () => {
  const cpus = os.cpus();
  const perCore = cpus.map((cpu, i) => {
    const prev = lastCpu[i] ? lastCpu[i].times : cpu.times;
    const total = (t) => t.user + t.nice + t.sys + t.idle + t.irq;
    const dTotal = total(cpu.times) - total(prev);
    const dIdle = cpu.times.idle - prev.idle;
    return dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0;
  });
  lastCpu = cpus;
  const metrics = app.getAppMetrics().map((m) => ({
    pid: m.pid,
    type: m.type,
    name: m.name || m.serviceName || m.type,
    cpu: m.cpu.percentCPUUsage,
    memoryKB: m.memory.workingSetSize,
  }));
  return {
    cpu: perCore.reduce((a, b) => a + b, 0) / (perCore.length || 1),
    perCore,
    cpuModel: cpus[0] ? cpus[0].model : 'Unknown CPU',
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    hostname: os.hostname(),
    metrics,
  };
});

ipcMain.on('shell:open-external', (_e, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});

/* -------------------------------------------------------------------------- */
/* 6. App menu (hidden) — accelerators for mode switching & dev tools          */
/* -------------------------------------------------------------------------- */

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Mode',
      submenu: [
        { label: 'Automatic', accelerator: 'CmdOrCtrl+Shift+0', click: () => requestMode('auto') },
        { label: 'Desktop', accelerator: 'CmdOrCtrl+Shift+1', click: () => requestMode('desktop') },
        { label: 'Mobile', accelerator: 'CmdOrCtrl+Shift+2', click: () => requestMode('mobile') },
        { label: 'TV', accelerator: 'CmdOrCtrl+Shift+3', click: () => requestMode('tv') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'editMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerMediaKeys() {
  const map = {
    MediaPlayPause: 'playpause',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'previous',
    MediaStop: 'stop',
  };
  for (const [accelerator, action] of Object.entries(map)) {
    try {
      globalShortcut.register(accelerator, () => mainWindow && mainWindow.webContents.send('opos:media', action));
    } catch (err) {
      console.warn(`[OPOS] Could not register ${accelerator}:`, err.message);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 7. Lifecycle                                                                */
/* -------------------------------------------------------------------------- */

app.whenReady().then(async () => {
  await initWidevine();
  hardenSession(session.defaultSession);
  hardenSession(session.fromPartition(APP_PARTITION));
  buildMenu();
  createWindow();
  registerMediaKeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { currentMode: () => currentMode };
