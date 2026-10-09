/**
 * OPOS Compatibility Shim — injected (forcibly, by main.cjs `will-attach-webview`) into every <webview>.
 *
 *  1. Remote-control emulation: translates WebOS / Tizen remote keycodes into standard DOM key events,
 *     and standard keyboard keys into the remote keycodes TV web apps expect. Exposes minimal
 *     `webOS` / `tizen` globals so TV apps boot.
 *  2. Touch translation: swipes -> arrow keys (for TV-style apps), long-press -> contextmenu,
 *     bottom-edge swipe-up -> host "home" gesture.
 *  3. Host bridge: reports input activity (mouse/touch/keys) so the shell's convergence engine can see
 *     input that happens inside guests; forwards unhandled Back; executes host media commands.
 *  4. TV fallback spatial navigation for pages that don't handle arrow keys themselves.
 */
const { ipcRenderer, contextBridge, webFrame } = require('electron');

const state = {
  profile: 'none', // 'webos' | 'tizen' | 'none'
  mode: 'desktop',
  spatialFallback: false,
};

/* ------------------------------------------------------------------ keymaps */

// Remote keycode -> standard key semantics.
const REMOTE_KEYS = {
  // WebOS
  461: { key: 'GoBack', code: 'BrowserBack', action: 'back' },
  // Tizen
  10009: { key: 'XF86Back', code: 'BrowserBack', action: 'back' },
  10182: { key: 'XF86Exit', code: 'BrowserHome', action: 'home' },
  // Shared media keys (both platforms use the HbbTV / CE-HTML numbering)
  415: { key: 'MediaPlay', code: 'MediaPlay', action: 'play' },
  19: { key: 'MediaPause', code: 'MediaPause', action: 'pause' },
  10252: { key: 'MediaPlayPause', code: 'MediaPlayPause', action: 'playpause' },
  413: { key: 'MediaStop', code: 'MediaStop', action: 'stop' },
  412: { key: 'MediaRewind', code: 'MediaRewind', action: 'rewind' },
  417: { key: 'MediaFastForward', code: 'MediaFastForward', action: 'forward' },
  10232: { key: 'MediaTrackPrevious', code: 'MediaTrackPrevious', action: 'previous' },
  10233: { key: 'MediaTrackNext', code: 'MediaTrackNext', action: 'next' },
  427: { key: 'ChannelUp', code: 'ChannelUp', action: 'channelup' },
  428: { key: 'ChannelDown', code: 'ChannelDown', action: 'channeldown' },
  403: { key: 'ColorF0Red', code: 'ColorF0Red' },
  404: { key: 'ColorF1Green', code: 'ColorF1Green' },
  405: { key: 'ColorF2Yellow', code: 'ColorF2Yellow' },
  406: { key: 'ColorF3Blue', code: 'ColorF3Blue' },
  457: { key: 'Info', code: 'Info' },
};

// Standard key -> remote keycode per profile (so TV apps that check keyCode keep working on a PC keyboard).
const STANDARD_TO_REMOTE = {
  webos: { Escape: 461, BrowserBack: 461, MediaPlayPause: 415, MediaPlay: 415, MediaPause: 19, MediaStop: 413, MediaRewind: 412, MediaFastForward: 417 },
  tizen: { Escape: 10009, BrowserBack: 10009, MediaPlayPause: 10252, MediaPlay: 415, MediaPause: 19, MediaStop: 413, MediaRewind: 412, MediaFastForward: 417, MediaTrackPrevious: 10232, MediaTrackNext: 10233 },
};

/**
 * Dispatch a KeyboardEvent in the page's *main world*. With contextIsolation, a keyCode override
 * defined from this isolated preload would be invisible to page scripts, so the event is built and
 * dispatched via webFrame.executeJavaScript. Resolves to whether the page called preventDefault().
 * Synthetic events have isTrusted === false, which is how the shim ignores its own output.
 */
function synthesizeKey(type, init, keyCode) {
  const k = Number(keyCode) || 0;
  const src = `(() => {
    const ev = new KeyboardEvent(${JSON.stringify(type)}, Object.assign({ bubbles: true, cancelable: true, composed: true }, ${JSON.stringify(init)}));
    Object.defineProperty(ev, 'keyCode', { get: () => ${k} });
    Object.defineProperty(ev, 'which', { get: () => ${k} });
    (document.activeElement || document.body || document.documentElement).dispatchEvent(ev);
    return ev.defaultPrevented;
  })()`;
  return webFrame.executeJavaScript(src).then(Boolean, () => false);
}

/* ------------------------------------------------------------- media control */

function activeMedia() {
  const all = Array.from(document.querySelectorAll('video, audio'));
  return all.find((m) => !m.paused) || all.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
}

function runMediaAction(action) {
  const media = activeMedia();
  if (!media) return false;
  switch (action) {
    case 'play':
      media.play().catch(() => {});
      return true;
    case 'pause':
      media.pause();
      return true;
    case 'playpause':
      if (media.paused) media.play().catch(() => {});
      else media.pause();
      return true;
    case 'stop':
      media.pause();
      media.currentTime = 0;
      return true;
    case 'rewind':
      media.currentTime = Math.max(0, media.currentTime - 10);
      return true;
    case 'forward':
      media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 10);
      return true;
    default:
      return false;
  }
}

/* --------------------------------------------------------- host reporting */

let lastReport = 0;
function reportInput(type, detail) {
  const now = Date.now();
  if (type === 'mouse' && now - lastReport < 250) return;
  lastReport = now;
  ipcRenderer.sendToHost('opos:input', { type, detail });
}

/* -------------------------------------------------------------- keyboard */

window.addEventListener(
  'keydown',
  (e) => {
    if (!e.isTrusted) return; // our own synthetic events (and page-generated ones)
    const remote = REMOTE_KEYS[e.keyCode];

    if (remote) {
      // A hardware remote keycode -> emit the standard DOM equivalent for modern web apps.
      e.preventDefault();
      e.stopImmediatePropagation();
      synthesizeKey('keydown', { key: remote.key, code: remote.code }, e.keyCode).then((prevented) => {
        if (prevented || !remote.action) return;
        if (remote.action === 'back') ipcRenderer.sendToHost('opos:back');
        else if (remote.action === 'home') ipcRenderer.sendToHost('opos:gesture', 'home');
        else if (!runMediaAction(remote.action)) ipcRenderer.sendToHost('opos:media-unhandled', remote.action);
      });
      return;
    }

    reportInput('key', e.key);
    const isArrow = e.key.startsWith('Arrow');

    // Standard key -> TV remote keycode shadow event (only for TV-profiled apps), so apps written
    // against WebOS (461) / Tizen (10009) key codes also work on a PC keyboard.
    const remoteCode = STANDARD_TO_REMOTE[state.profile] && STANDARD_TO_REMOTE[state.profile][e.key];
    const shadow = remoteCode ? synthesizeKey('keydown', { key: e.key, code: e.code }, remoteCode) : Promise.resolve(false);

    if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') {
      afterPageHandled(e, () =>
        shadow.then((prevented) => {
          if (!prevented && !document.fullscreenElement) ipcRenderer.sendToHost('opos:back');
        }),
      );
    } else if (e.key === 'BrowserHome') {
      ipcRenderer.sendToHost('opos:gesture', 'home');
    } else if (isArrow && state.spatialFallback) {
      afterPageHandled(e, () => spatialMove(e.key.slice(5).toLowerCase()));
    } else if (e.key === 'Enter' && state.spatialFallback && focusedByShim) {
      afterPageHandled(e, () => focusedByShim && focusedByShim.click());
    }
  },
  true,
);

/** Run `fallback` only if no page handler called preventDefault during dispatch. */
function afterPageHandled(event, fallback) {
  setTimeout(() => {
    if (!event.defaultPrevented) fallback();
  }, 0);
}

/* ---------------------------------------------------------------- pointer */

window.addEventListener('mousemove', (e) => {
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  reportInput('mouse');
}, { passive: true, capture: true });

let touch = null;
let longPressTimer = null;

window.addEventListener(
  'touchstart',
  (e) => {
    reportInput('touch');
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, t: Date.now(), edge: t.clientY > window.innerHeight - 28, moved: false };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!touch || touch.moved) return;
      const target = document.elementFromPoint(touch.x, touch.y);
      if (target) {
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: touch.x, clientY: touch.y, button: 2 }));
      }
    }, 600);
  },
  { passive: true, capture: true },
);

window.addEventListener(
  'touchmove',
  (e) => {
    if (!touch) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) touch.moved = true;
  },
  { passive: true, capture: true },
);

window.addEventListener(
  'touchend',
  (e) => {
    clearTimeout(longPressTimer);
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const dt = Date.now() - touch.t;
    const wasEdge = touch.edge;
    touch = null;
    if (wasEdge && dy < -60) {
      ipcRenderer.sendToHost('opos:gesture', 'home');
      return;
    }
    // Quick flicks become arrow keys for TV-profiled apps (they are built for D-pads, not touch).
    if (state.profile !== 'none' && dt < 450 && Math.max(Math.abs(dx), Math.abs(dy)) > 48) {
      const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowLeft' : 'ArrowRight') : dy > 0 ? 'ArrowUp' : 'ArrowDown';
      const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
      synthesizeKey('keydown', { key, code: key }, codes[key]);
      synthesizeKey('keyup', { key, code: key }, codes[key]);
    }
  },
  { passive: true, capture: true },
);

/* -------------------------------------------------- fallback spatial nav */

let focusedByShim = null;
const FOCUSABLE = 'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"]), [onclick]';

function spatialMove(dir) {
  const current = focusedByShim && document.contains(focusedByShim) ? focusedByShim : document.activeElement;
  const cRect = current && current !== document.body ? current.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
  const cx = cRect.left + cRect.width / 2;
  const cy = cRect.top + cRect.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of document.querySelectorAll(FOCUSABLE)) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 2) continue;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const primary = { left: -dx, right: dx, up: -dy, down: dy }[dir];
    if (primary <= 1) continue;
    const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) return;
  if (focusedByShim) focusedByShim.style.outline = focusedByShim.__oposOutline || '';
  focusedByShim = best;
  best.__oposOutline = best.style.outline;
  best.style.outline = '4px solid #7c9cff';
  best.style.outlineOffset = '3px';
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

/* ------------------------------------------------------- host commands */

ipcRenderer.on('opos:config', (_e, config) => {
  Object.assign(state, config);
});

ipcRenderer.on('opos:media', (_e, action) => {
  if (!runMediaAction(action)) {
    const key = { playpause: 'MediaPlayPause', next: 'MediaTrackNext', previous: 'MediaTrackPrevious', stop: 'MediaStop' }[action];
    if (key) synthesizeKey('keydown', { key, code: key }, (STANDARD_TO_REMOTE[state.profile] || {})[key]);
  }
});

/* -------------------------------------------- platform API emulation */

const registeredKeys = new Set();
const tizenKeyCodes = {
  MediaPlayPause: 10252, MediaPlay: 415, MediaPause: 19, MediaStop: 413, MediaRewind: 412,
  MediaFastForward: 417, MediaTrackPrevious: 10232, MediaTrackNext: 10233, ColorF0Red: 403,
  ColorF1Green: 404, ColorF2Yellow: 405, ColorF3Blue: 406, ChannelUp: 427, ChannelDown: 428, Info: 457,
};

try {
  contextBridge.exposeInMainWorld('webOS', {
    platform: { tv: true },
    deviceInfo: (cb) => cb({ modelName: 'OPOS-TV', version: '6.0.0', sdkVersion: '6.0.0', screenWidth: screen.width, screenHeight: screen.height }),
    platformBack: () => ipcRenderer.sendToHost('opos:back'),
    fetchAppId: () => 'org.opos.guest',
    keyboard: { isShowing: () => false },
  });
  contextBridge.exposeInMainWorld('tizen', {
    tvinputdevice: {
      registerKey: (name) => registeredKeys.add(name),
      unregisterKey: (name) => registeredKeys.delete(name),
      registerKeyBatch: (names) => names.forEach((n) => registeredKeys.add(n)),
      getSupportedKeys: () => Object.entries(tizenKeyCodes).map(([name, code]) => ({ name, code })),
      getKey: (name) => (tizenKeyCodes[name] ? { name, code: tizenKeyCodes[name] } : null),
    },
    application: {
      getCurrentApplication: () => ({ exit: () => ipcRenderer.sendToHost('opos:back'), hide: () => ipcRenderer.sendToHost('opos:gesture', 'home') }),
    },
    systeminfo: { getCapability: () => null },
  });
} catch {
  /* exposeInMainWorld fails if contextIsolation is disabled — not expected */
}

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.sendToHost('opos:ready', { title: document.title, url: location.href });
});
