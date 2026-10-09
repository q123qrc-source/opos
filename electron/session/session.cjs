/**
 * OPOS session manager — runs when OPOS is the user's desktop session (on KWin/Wayland).
 *
 * Shell surfaces (all real Wayland windows, pinned/positioned by the KWin script):
 *   opos:desktop  wallpaper / desktop icons / mobile home / TV home   (kept below everything)
 *   opos:panel    taskbar (desktop) · navigation bar (mobile)          (kept above)
 *   opos:topbar   status bar (mobile)                                  (kept above)
 *   opos:overlay  start menu, quick settings, notifications, recents   (shown on demand)
 *   opos:toast    notification banners                                 (shown on demand)
 *
 * Built-in OPOS apps open as ordinary app windows; installed Linux apps are launched from their
 * .desktop entries. Every app window — OPOS or native — is managed through KWin.
 */
const path = require('path');
const { BrowserWindow, app, screen: electronScreen } = require('electron');
const { KWinBridge } = require('./kwin/bridge.cjs');
const { SharedState } = require('./state.cjs');

const TASKBAR_H = 52;
const MOBILE_STATUS_H = 30;
const MOBILE_NAV_H = 52; // the panel surface keeps one height in every mode (see createSurface)
const TOAST_W = 500;
const TOAST_H = 330;

const DEFAULT_SETTINGS = {
  userName: require('os').userInfo().username,
  wallpaper: 'aurora',
  accent: 'indigo',
  wifi: true,
  bluetooth: true,
  airplane: false,
  brightness: 100,
  volume: 70,
  resolution: 'auto',
  hdr: false,
  nightLight: false,
  uiScale: 100,
  reduceMotion: false,
  tvFullscreen: true,
  tvKeyThreshold: 3,
  screensaverMinutes: 0,
  use24h: false,
  notifications: true,
  doNotDisturb: false,
};

/** OPOS app metadata needed in the main process (names + default sizes). */
const OPOS_APPS = {
  settings: ['OPOS Settings', 940, 640, true],
  files: ['File Explorer', 960, 600, false],
  terminal: ['Terminal', 820, 500, false],
  code: ['Code Editor', 1100, 700, false],
  writer: ['Office Writer', 940, 700, false],
  monitor: ['System Monitor', 920, 620, true],
  webbrowser: ['Web Browser', 1120, 740, false],
  mail: ['Email', 1100, 700, true],
  photo: ['Photo Editor', 1000, 700, false],
  miniplayer: ['Floating Player', 360, 210, true],
  music: ['OPOS Music', 1040, 680, true],
  plex: ['Local Plex', 1120, 700, true],
  cloudgamer: ['Cloud Gamer', 1180, 720, true],
  iptv: ['Live IPTV', 1180, 720, true],
  weather: ['Weather Station', 1000, 660, true],
  screensaver: ['Screensaver', 0, 0, true],
  dialer: ['Phone', 400, 760, true],
  messages: ['Messages', 420, 760, true],
  mobilebrowser: ['Browser', 440, 780, false],
  camera: ['Camera', 440, 780, true],
  maps: ['Maps', 440, 780, true],
  calendar: ['Calendar', 420, 760, true],
  calculator: ['Calculator', 360, 580, true],
  notes: ['Notes', 440, 720, true],
  social: ['Social Feed', 420, 780, true],
  cinema: ['OPOS Cinema', 1180, 720, true],
  optube: ['OPTube', 1180, 720, true],
  opstream: ['OPStream', 1180, 720, true],
};

class SessionManager {
  constructor({ loadRenderer, preload, catalog, system }) {
    this.loadRenderer = loadRenderer;
    this.preload = preload;
    this.catalog = catalog;
    this.system = system;
    this.kwin = new KWinBridge();
    this.surfaces = {};
    this.appWindows = new Map(); // caption -> { win, appId }
    this.state = new SharedState({
      mode: 'desktop',
      modeLock: 'auto',
      settings: DEFAULT_SETTINGS,
      pinned: [],
      mobileDock: [],
      overlay: 'none',
      toasts: [],
      history: [],
      windows: [],
      screen: null,
    });
  }

  async start() {
    this.kwin.on('windows', (wins, screen) => this.onWindows(wins, screen));
    this.kwin.on('pointer', () => this.onInput('mouse'));
    this.kwin.on('tabletMode', (on) => this.onInput(on ? 'touch' : 'mouse'));
    this.kwin.on('shortcut', (s) => this.onShortcut(s));
    this.kwin.on('screens', () => this.layout());
    this.state.on('patch', (changed) => this.onStatePatch(changed));

    // Surfaces come up immediately; KWin integration attaches as soon as it is ready.
    for (const role of ['desktop', 'panel', 'topbar', 'overlay', 'toast']) this.createSurface(role);
    this.kwin.command('config', { shellPid: process.pid, surfaces: {} });
    const ok = await this.kwin.start();
    if (!ok) console.warn('[OPOS] running session without KWin integration (windows will not be managed)');
    this.layout();
    if (this.state.get().modeLock !== 'auto') this.state.patch({ mode: this.state.get().modeLock });
    else if (this.kwin.tabletMode) this.state.patch({ mode: 'mobile' });

    this.system.on('notification', (n) => this.pushToast({ id: n.id, title: n.summary || n.appName, body: n.body, icon: 'bell', app: n.appName, actions: n.actions }));
    this.system.on('notification-closed', (id) => this.state.patch({ toasts: this.state.get().toasts.filter((t) => t.id !== id) }));
  }

  /* ------------------------------------------------------------ surfaces */

  caption(role) {
    return `opos:${role}`;
  }

  screenRect() {
    if (this.kwin.screen) return this.kwin.screen;
    const b = electronScreen.getPrimaryDisplay().bounds;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Surfaces are created at their final size: transparent Electron windows can't be resized later. */
  surfaceSize(role) {
    const s = this.screenRect();
    switch (role) {
      case 'panel':
        return [s.w, TASKBAR_H];
      case 'topbar':
        return [s.w, MOBILE_STATUS_H];
      case 'toast':
        return [TOAST_W, TOAST_H];
      default:
        return [s.w, s.h];
    }
  }

  createSurface(role) {
    const transparent = role !== 'desktop';
    const [width, height] = this.surfaceSize(role);
    this.surfaceScreen = JSON.stringify(this.screenRect());
    const win = new BrowserWindow({
      title: this.caption(role),
      width,
      height,
      frame: false,
      transparent,
      backgroundColor: transparent ? '#00000000' : '#07080d',
      // Must stay resizable: KWin sizes surfaces, and Electron pins min/max size on fixed windows.
      resizable: true,
      minWidth: 1,
      minHeight: 1,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: role === 'desktop',
        backgroundThrottling: false,
        additionalArguments: [`--opos-surface=${role}`],
      },
    });
    win.on('page-title-updated', (e) => e.preventDefault()); // the caption identifies the surface to KWin
    this.loadRenderer(win, { surface: role });
    this.surfaces[role] = win;
    win.webContents.once('did-finish-load', () => this.layout());
    return win;
  }

  /** Compute geometry + visibility of every surface for the current mode and push it to KWin. */
  layout() {
    const s = this.kwin.screen || { x: 0, y: 0, w: 1920, h: 1080 };
    const st = this.state.get();
    const mode = st.mode;
    const overlayOpen = st.overlay !== 'none';
    const toasts = st.toasts.length;

    if (this.surfaceScreen && this.surfaceScreen !== JSON.stringify(s)) return this.recreateSurfaces();
    const geo = {
      desktop: { x: s.x, y: s.y, w: s.w, h: s.h, visible: true },
      panel: mode === 'tv' ? { visible: false } : { x: s.x, y: s.y + s.h - TASKBAR_H, w: s.w, h: TASKBAR_H, visible: true },
      topbar: mode === 'mobile' ? { x: s.x, y: s.y, w: s.w, h: MOBILE_STATUS_H, visible: true } : { visible: false },
      // The overlay spans the whole output; it draws nothing over the panel area.
      overlay: overlayOpen ? { x: s.x, y: s.y, w: s.w, h: s.h, visible: true } : { visible: false },
      toast: toasts
        ? mode === 'mobile'
          ? { x: s.x + Math.max(0, (s.w - TOAST_W) / 2), y: s.y + MOBILE_STATUS_H + 6, w: TOAST_W, h: TOAST_H, visible: true }
          : { x: s.x + s.w - TOAST_W - 16, y: s.y + 16, w: TOAST_W, h: TOAST_H, visible: true }
        : { visible: false },
    };

    for (const [role, g] of Object.entries(geo)) {
      const win = this.surfaces[role];
      if (!win || win.isDestroyed()) continue;
      if (g.visible) {
        this.kwin.command('surface', { caption: this.caption(role), surface: { role, x: g.x, y: g.y, w: g.w, h: g.h } });
        // Transparent Electron windows ignore compositor resizes, so size them ourselves — also
        // right after mapping, since Wayland may drop sizes requested while unmapped.
        const size = [Math.round(g.w), Math.round(g.h)];
        win.setSize(...size);
        if (!win.isVisible()) {
          role === 'toast' ? win.showInactive() : win.show();
          const surfaceCmd = { caption: this.caption(role), surface: { role, x: g.x, y: g.y, w: g.w, h: g.h } };
          setTimeout(() => {
            if (win.isDestroyed()) return;
            win.setSize(...size);
            this.kwin.command('surface', surfaceCmd); // re-apply once the surface is mapped
          }, 120);
        }
        if (role === 'overlay') win.focus();
      } else if (win.isVisible()) {
        win.hide();
      }
    }

    const area =
      mode === 'mobile'
        ? { x: s.x, y: s.y + MOBILE_STATUS_H, w: s.w, h: s.h - MOBILE_STATUS_H - MOBILE_NAV_H }
        : { x: s.x, y: s.y, w: s.w, h: s.h };
    this.kwin.command('mode', { mode, area });
  }

  /** The output changed size: rebuild every surface at the new size. */
  recreateSurfaces() {
    for (const role of Object.keys(this.surfaces)) {
      const old = this.surfaces[role];
      this.createSurface(role);
      if (old && !old.isDestroyed()) old.destroy();
    }
  }

  /* ------------------------------------------------------------- windows */

  onWindows(wins, screen) {
    const prevScreen = JSON.stringify(this.state.get().screen);
    const list = wins
      .filter((w) => !w.surface && (w.normal || w.dialog) && !w.skipTaskbar)
      .map((w) => {
        const opos = w.shell ? this.appWindows.get(w.caption) : null;
        const native = !w.shell ? this.catalog.matchWindow(w) : null;
        return {
          id: w.id,
          title: w.caption,
          minimized: w.minimized,
          active: w.active,
          maximized: w.maximized,
          fullScreen: w.fullScreen,
          dialog: w.dialog,
          oposApp: opos ? opos.appId : null,
          desktopId: native ? native.id : null,
          name: opos ? OPOS_APPS[opos.appId]?.[0] || w.caption : native ? native.name : w.resourceClass || w.caption,
          icon: native ? native.icon : null,
          pid: w.pid,
        };
      });
    this.state.patch({ windows: list, screen });
    if (JSON.stringify(screen) !== prevScreen) this.layout();
  }

  /** Open (or focus) a built-in OPOS app in its own window. */
  openOposApp(appId, params) {
    const meta = OPOS_APPS[appId];
    if (!meta) throw new Error(`Unknown OPOS app ${appId}`);
    const [name, w, h, single] = meta;
    if (single) {
      for (const [caption, entry] of this.appWindows) {
        if (entry.appId === appId && !entry.win.isDestroyed()) {
          if (params) entry.win.webContents.send('opos:app-params', params);
          const kw = this.state.get().windows.find((x) => x.title === caption);
          if (kw) this.kwin.command('activate', { id: kw.id });
          else entry.win.focus();
          return;
        }
      }
    }
    console.log(`[OPOS] opening ${appId}`);
    let caption = name;
    for (let i = 2; this.appWindows.has(caption); i++) caption = `${name} (${i})`;
    const win = new BrowserWindow({
      title: caption,
      width: w || 1280,
      height: h || 800,
      minWidth: 320,
      minHeight: 240,
      backgroundColor: '#0b0c12',
      // Wayland: hidden windows never paint, so 'ready-to-show' would never fire — map right away.
      show: true,
      autoHideMenuBar: true,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, plugins: true, additionalArguments: ['--opos-surface=app'] },
    });
    win.on('page-title-updated', (e) => e.preventDefault()); // keep the caption stable for window → app mapping
    win.webContents.on('did-fail-load', (_e, code, desc) => console.warn(`[OPOS] ${caption} failed to load: ${desc} (${code})`));
    win.webContents.on('render-process-gone', (_e, d) => console.warn(`[OPOS] ${caption} renderer gone: ${d.reason}`));
    win.on('closed', () => this.appWindows.delete(caption));
    this.appWindows.set(caption, { win, appId });
    this.loadRenderer(win, { surface: 'app', app: appId, params: params ? JSON.stringify(params) : undefined });
    if (appId === 'screensaver') win.setFullScreen(true);
  }

  launchNative(id, opts) {
    this.catalog.launch(id, opts);
    this.state.patch({ overlay: 'none' });
  }

  windowCommand(op, id) {
    this.kwin.command(op, { id });
  }

  /** Back: close an overlay, else in-app back for OPOS apps, else send the active app home. */
  back() {
    const st = this.state.get();
    if (st.overlay !== 'none') return this.state.patch({ overlay: 'none' });
    const active = st.windows.find((w) => w.active && !w.minimized);
    if (!active) return;
    const entry = this.appWindows.get(active.title);
    if (entry && !entry.win.isDestroyed()) entry.win.webContents.send('opos:session-back');
    else if (st.mode !== 'desktop') this.kwin.command('minimize', { id: active.id });
  }

  home() {
    this.state.patch({ overlay: 'none' });
    this.kwin.command('showDesktop');
    this.kwin.command('activateCaption', { caption: this.caption('desktop') });
  }

  /* ------------------------------------------------------- input & modes */

  onInput(kind) {
    const st = this.state.get();
    if (st.modeLock !== 'auto') return;
    if (kind === 'mouse' && st.mode !== 'desktop') this.state.patch({ mode: 'desktop' });
    if (kind === 'touch' && st.mode !== 'mobile') this.state.patch({ mode: 'mobile' });
  }

  onShortcut(s) {
    const st = this.state.get();
    if (s === 'start') this.state.patch({ overlay: st.overlay === 'start' ? 'none' : 'start' });
    else if (s === 'recents') this.state.patch({ overlay: st.overlay === 'recents' ? 'none' : 'recents' });
    else if (s === 'home') this.home();
    else if (s === 'back') this.back();
    else if (s.startsWith('mode:')) {
      const m = s.slice(5);
      this.state.patch(m === 'auto' ? { modeLock: 'auto' } : { modeLock: m, mode: m });
    } else if (s.startsWith('media:')) {
      const action = s.slice(6);
      this.system.mediaControl(action).then((handled) => {
        if (!handled) for (const w of BrowserWindow.getAllWindows()) w.webContents.send('opos:media', action);
      });
    } else if (s === 'lock') this.system.power('lock').catch(() => {});
  }

  onStatePatch(changed) {
    if ('mode' in changed || 'overlay' in changed || 'toasts' in changed) this.layout();
    if ('mode' in changed && changed.mode === 'tv') {
      // Give the TV home keyboard focus so the remote works immediately.
      this.kwin.command('activateCaption', { caption: this.caption('desktop') });
    }
  }

  pushToast(t) {
    const st = this.state.get();
    if (!st.settings.notifications) return;
    const toast = { id: t.id ?? Date.now(), title: t.title, body: t.body, icon: t.icon, app: t.app, actions: t.actions };
    this.state.patch({ history: [toast, ...st.history].slice(0, 50) });
    if (st.settings.doNotDisturb) return;
    this.state.patch({ toasts: [...st.toasts.filter((x) => x.id !== toast.id).slice(-2), toast] });
    setTimeout(() => this.state.patch({ toasts: this.state.get().toasts.filter((x) => x.id !== toast.id) }), 5000);
  }

  quit() {
    app.quit(); // KWin was started with --exit-with-session, so the session ends here.
  }
}

module.exports = { SessionManager, OPOS_APPS, path };
