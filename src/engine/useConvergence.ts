/**
 * Wires real input devices into the Convergence State Engine:
 * mouse movement, touch, keyboard / remote / gamepad, viewport resizes, IPC mode requests,
 * media keys, idle screensaver, and TV-mode spatial navigation.
 */
import { useEffect } from 'react';
import { useOS } from '../store/useOS';
import { bridge } from '../lib/bridge';
import { routeMedia } from '../lib/mediaRouter';
import { performBack } from '../lib/backStack';
import { audio, useAudio } from '../lib/audioEngine';
import { getApp } from '../apps/manifest';
import { ensureFocus, handleTvKey, resetSpatial } from './spatialNav';

const MOUSE_DISTANCE = 36; // px of real mouse travel within the window below to count as "mouse in use"
const MOUSE_WINDOW = 450;

function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range');
}

export interface ConvergenceOptions {
  /** Session surfaces: viewport size is not the screen size, so skip resize heuristics, the idle
   * screensaver and fullscreen toggling (the session manager owns those). */
  session?: boolean;
  /** Whether this renderer should react to hardware media keys with the built-in audio engine. */
  mediaKeys?: boolean;
}

export function useConvergence(opts: ConvergenceOptions = {}) {
  const session = !!opts.session;
  const mediaKeys = opts.mediaKeys ?? true;
  const mode = useOS((s) => s.mode);
  const tvFullscreen = useOS((s) => s.settings.tvFullscreen);

  /* ------------------------------------------------------------ input heuristics */
  useEffect(() => {
    const { reportInput, reportResize } = useOS.getState();
    let travel = 0;
    let windowStart = 0;
    let last: { x: number; y: number } | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - windowStart > MOUSE_WINDOW) {
        windowStart = now;
        travel = 0;
      }
      if (last) travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (travel > MOUSE_DISTANCE) {
        travel = 0;
        reportInput('mouse');
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') reportInput('touch');
      else if (e.pointerType === 'mouse') reportInput('mouse');
    };
    const onTouch = () => reportInput('touch');
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && !e.key.startsWith('Arrow')) return;
      if (isEditableTarget(e.target) && e.key !== 'Escape') return;
      reportInput('key', e.key);
    };

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => reportResize(window.innerWidth, window.innerHeight), 120);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    window.addEventListener('touchstart', onTouch, { passive: true, capture: true });
    window.addEventListener('keydown', onKey, true);
    if (!session) window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('touchstart', onTouch, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  /* --------------------------------------------- mode side-effects & IPC sync */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('mode-desktop', 'mode-mobile', 'mode-tv');
    root.classList.add(`mode-${mode}`);
    if (!session) bridge.mode.changed(mode);
    if (mode === 'tv') {
      if (tvFullscreen && !session) bridge.window.setFullscreen(true);
      const t = window.setTimeout(ensureFocus, 60);
      return () => window.clearTimeout(t);
    }
    resetSpatial();
    if (tvFullscreen && !session) bridge.window.setFullscreen(false);
  }, [mode, tvFullscreen, session]);

  useEffect(
    () =>
      bridge.mode.onRequest((requested) => {
        const s = useOS.getState();
        s.setModeLock(requested);
        if (requested === 'auto') s.notify('Automatic Mode', 'Input heuristics re-enabled', 'auto');
      }),
    [],
  );

  /* ---------------------------------------------- TV spatial nav + global back */
  useEffect(() => {
    if (mode === 'tv') {
      window.addEventListener('keydown', handleTvKey, true);
      const id = window.setInterval(ensureFocus, 250);
      return () => {
        window.removeEventListener('keydown', handleTvKey, true);
        window.clearInterval(id);
      };
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (performBack()) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  /* ----------------------------------------------------------------- media keys */
  useEffect(() => (mediaKeys ? bridge.media.onKey(routeMedia) : undefined), [mediaKeys]);

  /* --------------------------------------------- gamepad -> D-pad key events */
  useEffect(() => {
    const MAP: Record<number, string> = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 1: 'Escape', 9: 'ContextMenu' };
    const held = new Map<string, number>();
    let raf = 0;
    const fire = (key: string) => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }));
    };
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const now = performance.now();
      const pressed = new Set<string>();
      for (const pad of pads) {
        if (!pad) continue;
        pad.buttons.forEach((b, i) => b.pressed && MAP[i] && pressed.add(MAP[i]));
        const [ax, ay] = pad.axes;
        if (ax < -0.6) pressed.add('ArrowLeft');
        if (ax > 0.6) pressed.add('ArrowRight');
        if (ay < -0.6) pressed.add('ArrowUp');
        if (ay > 0.6) pressed.add('ArrowDown');
        if (pad.buttons[16]?.pressed) pressed.add('Home');
      }
      for (const key of pressed) {
        const since = held.get(key);
        if (since === undefined) {
          held.set(key, now);
          if (key === 'Home') useOS.getState().goHome();
          else fire(key);
        } else if (key.startsWith('Arrow') && now - since > 420) {
          held.set(key, now - 300); // auto-repeat every ~120ms
          fire(key);
        }
      }
      for (const key of Array.from(held.keys())) if (!pressed.has(key)) held.delete(key);
      raf = requestAnimationFrame(poll);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(poll);
      useOS.getState().notify('Controller connected', 'Use the D-pad to navigate', 'gamepad');
    };
    window.addEventListener('gamepadconnected', start);
    if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener('gamepadconnected', start);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* --------------------------------------------------------- idle screensaver */
  useEffect(() => {
    if (session) return; // the compositor / screen locker handles idle in a real session
    let lastActivity = Date.now();
    const bump = () => (lastActivity = Date.now());
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const id = window.setInterval(() => {
      const s = useOS.getState();
      const minutes = s.settings.screensaverMinutes;
      if (!minutes || Date.now() - lastActivity < minutes * 60000) return;
      if (useAudio.getState().playing) return;
      const fg = s.processes.find((p) => p.pid === s.focusedPid);
      const fgApp = fg && getApp(fg.appId);
      if (fgApp && (fgApp.kind === 'webview' || fgApp.id === 'screensaver' || fgApp.id === 'iptv' || fgApp.id === 'plex')) return;
      lastActivity = Date.now();
      s.launch('screensaver', { idle: true });
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, true));
      window.clearInterval(id);
    };
  }, [session]);

  /* ----------------------------------------------------------- volume binding */
  useEffect(
    () =>
      useOS.subscribe((s, prev) => {
        if (s.settings.volume !== prev.settings.volume) audio.setVolume(s.settings.volume / 100);
      }),
    [],
  );
}
