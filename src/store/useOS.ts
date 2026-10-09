/**
 * The Convergence State Engine.
 *
 * One global Zustand store owns:
 *  - the active environment (desktop / mobile / tv) and the heuristics that switch it,
 *  - the process table + desktop window manager (bounds, z-order, min/max),
 *  - persisted user settings, pinned apps and transient UI (toasts, overlays).
 *
 * Heuristics (only applied while modeLock === 'auto'):
 *  - Desktop: real mouse movement, or a resize to a width > 1024px.
 *  - Mobile:  a touch event, or a resize to a narrow portrait viewport.
 *  - TV:      N (default 3) consecutive Arrow / Enter presses. Cursor is hidden while in TV mode.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Bounds, InputKind, Mode, ModeLock, Process, Settings, Toast } from '../types';
import { getApp } from '../apps/manifest';
import { bridge, isSession, type InstalledApp, type SessionWindow } from '../lib/bridge';

export const TASKBAR_HEIGHT = 52;
const TV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);

export const DEFAULT_SETTINGS: Settings = {
  userName: 'Guest',
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
  tvFullscreen: false,
  tvKeyThreshold: 3,
  screensaverMinutes: 10,
  use24h: false,
  notifications: true,
  doNotDisturb: false,
};

export type ShellOverlay = 'none' | 'start' | 'recents' | 'quick' | 'notifications';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  action?: () => void;
}

interface OSState {
  /* convergence */
  mode: Mode;
  modeLock: ModeLock;
  lastInput: InputKind | null;
  keyStreak: number;
  modeReason: string;
  setMode: (mode: Mode, reason?: string) => void;
  setModeLock: (lock: ModeLock) => void;
  reportInput: (kind: InputKind, key?: string) => void;
  reportResize: (w: number, h: number) => void;

  /* processes & window manager */
  processes: Process[];
  focusedPid: string | null;
  zTop: number;
  launch: (appId: string, params?: Record<string, unknown>) => string | null;
  close: (pid: string) => void;
  closeAll: () => void;
  focus: (pid: string) => void;
  minimize: (pid: string) => void;
  toggleMaximize: (pid: string) => void;
  setBounds: (pid: string, bounds: Partial<Bounds>) => void;
  setTitle: (pid: string, title: string) => void;
  goHome: () => void;

  /* real session (OPOS as the desktop): KWin-managed windows + installed Linux apps */
  windows: SessionWindow[];
  screen: { x: number; y: number; w: number; h: number } | null;
  installedApps: InstalledApp[];
  launchNative: (desktopId: string, opts?: { action?: string; targets?: string[] }) => void;
  windowOp: (op: 'activate' | 'minimize' | 'toggleMinimize' | 'close' | 'toggleMaximize', id: string) => void;
  logout: () => void;

  /* settings */
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  pinned: string[];
  togglePin: (appId: string) => void;
  mobileDock: string[];

  /* transient UI */
  overlay: ShellOverlay;
  setOverlay: (o: ShellOverlay) => void;
  toggleOverlay: (o: ShellOverlay) => void;
  toasts: Toast[];
  notify: (title: string, body?: string, icon?: string) => void;
  dismissToast: (id: number) => void;
  history: Toast[];
  clearHistory: () => void;
  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
  interacting: boolean;
  setInteracting: (v: boolean) => void;
}

let pidCounter = 0;
let toastCounter = 0;

function initialMode(): Mode {
  if (typeof window === 'undefined') return 'desktop';
  const { innerWidth: w, innerHeight: h } = window;
  if (isNarrowPortrait(w, h)) return 'mobile';
  if (window.matchMedia?.('(pointer: coarse)').matches && w <= 1024) return 'mobile';
  return 'desktop';
}

export function isNarrowPortrait(w: number, h: number) {
  return w < h && w <= 820;
}

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Initial desktop window bounds: centered, cascaded, clamped to the work area. */
function initialBounds(appId: string, index: number): Bounds {
  const app = getApp(appId);
  const { w: vw, h: vh } = viewport();
  const workH = vh - TASKBAR_HEIGHT;
  const size = app?.defaultSize ?? { w: 860, h: 560 };
  if (app?.launch === 'floating') {
    return { x: vw - size.w - 24, y: workH - size.h - 24, w: size.w, h: size.h };
  }
  const w = Math.min(size.w, vw - 40);
  const h = Math.min(size.h, workH - 40);
  const offset = (index % 8) * 30;
  const x = Math.max(8, Math.min(vw - w - 8, Math.round((vw - w) / 2 - 120 + offset)));
  const y = Math.max(8, Math.min(workH - h - 8, Math.round((workH - h) / 2 - 60 + offset)));
  return { x, y, w, h };
}

export const useOS = create<OSState>()(
  persist(
    (set, get) => ({
      /* ------------------------------------------------------------ convergence */
      mode: initialMode(),
      modeLock: 'auto',
      lastInput: null,
      keyStreak: 0,
      modeReason: 'boot',

      setMode: (mode, reason = 'manual') => {
        const prev = get().mode;
        if (prev === mode) return;
        set((s) => ({
          mode,
          modeReason: reason,
          keyStreak: 0,
          overlay: 'none',
          contextMenu: null,
          // Entering desktop: only the foreground app stays open as a window, the rest go to the taskbar.
          processes:
            mode === 'desktop'
              ? s.processes.map((p) => ({
                  ...p,
                  minimized: getApp(p.appId)?.launch === 'floating' ? false : p.pid !== s.focusedPid,
                }))
              : s.processes,
        }));
        const label = { desktop: 'Desktop', mobile: 'Mobile', tv: 'TV' }[mode];
        const why: Record<string, string> = {
          mouse: 'Mouse detected',
          touch: 'Touch detected',
          keys: 'Remote / D-pad detected',
          resize: 'Display size changed',
          manual: 'Switched manually',
          lock: 'Mode locked',
        };
        get().notify(`${label} Mode`, why[reason] ?? reason, mode);
      },

      setModeLock: (lock) => {
        set({ modeLock: lock });
        if (lock !== 'auto') get().setMode(lock, 'lock');
      },

      reportInput: (kind, key) => {
        const s = get();
        if (kind === 'key') {
          if (key && TV_KEYS.has(key)) {
            const streak = s.keyStreak + 1;
            set({ keyStreak: streak, lastInput: 'key' });
            if (s.modeLock === 'auto' && s.mode !== 'tv' && streak >= s.settings.tvKeyThreshold) {
              s.setMode('tv', 'keys');
            }
          } else if (s.keyStreak !== 0) {
            set({ keyStreak: 0 });
          }
          return;
        }
        if (s.lastInput !== kind || s.keyStreak !== 0) set({ lastInput: kind, keyStreak: 0 });
        if (s.modeLock !== 'auto') return;
        if (kind === 'mouse' && s.mode !== 'desktop') s.setMode('desktop', 'mouse');
        if (kind === 'touch' && s.mode !== 'mobile') s.setMode('mobile', 'touch');
      },

      reportResize: (w, h) => {
        const s = get();
        if (s.modeLock !== 'auto' || s.mode === 'tv') return; // TV owns the big screen (and fullscreen resizes)
        if (isNarrowPortrait(w, h)) {
          if (s.mode !== 'mobile') s.setMode('mobile', 'resize');
        } else if (w > 1024 && s.mode !== 'desktop' && s.lastInput !== 'touch') {
          s.setMode('desktop', 'resize');
        }
      },

      /* ---------------------------------------------------------------- processes */
      processes: [],
      focusedPid: null,
      zTop: 10,

      launch: (appId, params) => {
        const app = getApp(appId);
        if (!app) return null;
        const s = get();
        if (isSession) {
          // In a real session every OPOS app is its own compositor-managed window.
          void bridge.session!.openApp(appId, params);
          if (s.overlay !== 'none') set({ overlay: 'none' });
          return `session:${appId}`;
        }
        if (app.singleInstance) {
          const existing = s.processes.find((p) => p.appId === appId);
          if (existing) {
            if (params) set({ processes: s.processes.map((p) => (p.pid === existing.pid ? { ...p, params } : p)) });
            s.focus(existing.pid);
            return existing.pid;
          }
        }
        const pid = `${appId}-${++pidCounter}-${Date.now().toString(36)}`;
        const z = s.zTop + 1;
        const process: Process = {
          pid,
          appId,
          title: app.name,
          // Overlays (screensaver) remember what was in front so closing them restores it.
          params: app.launch === 'overlay' ? { ...params, returnTo: s.focusedPid } : params,
          bounds: initialBounds(appId, s.processes.length),
          z,
          minimized: false,
          maximized: s.mode === 'desktop' && app.launch === 'immersive' && window.innerWidth < 1280,
          launchedAt: Date.now(),
        };
        set({ processes: [...s.processes, process], focusedPid: pid, zTop: z, overlay: 'none', contextMenu: null });
        return pid;
      },

      close: (pid) =>
        set((s) => {
          const processes = s.processes.filter((p) => p.pid !== pid);
          const closing = s.processes.find((p) => p.pid === pid);
          let focusedPid = s.focusedPid;
          if (closing && getApp(closing.appId)?.launch === 'overlay') {
            const back = closing.params?.returnTo as string | null | undefined;
            if (focusedPid === pid) focusedPid = back && processes.some((p) => p.pid === back) ? back : null;
          } else if (focusedPid === pid) {
            // Desktop: focus the next top-most visible window. Mobile/TV: return home.
            const next =
              s.mode === 'desktop'
                ? [...processes].filter((p) => !p.minimized).sort((a, b) => b.z - a.z)[0]
                : undefined;
            focusedPid = next?.pid ?? null;
          }
          return { processes, focusedPid };
        }),

      closeAll: () => set({ processes: [], focusedPid: null }),

      focus: (pid) =>
        set((s) => {
          const z = s.zTop + 1;
          return {
            zTop: z,
            focusedPid: pid,
            overlay: 'none',
            processes: s.processes.map((p) => (p.pid === pid ? { ...p, z, minimized: false } : p)),
          };
        }),

      minimize: (pid) =>
        set((s) => {
          const processes = s.processes.map((p) => (p.pid === pid ? { ...p, minimized: true } : p));
          const next = processes.filter((p) => !p.minimized && p.pid !== pid).sort((a, b) => b.z - a.z)[0];
          return { processes, focusedPid: s.focusedPid === pid ? next?.pid ?? null : s.focusedPid };
        }),

      toggleMaximize: (pid) =>
        set((s) => ({ processes: s.processes.map((p) => (p.pid === pid ? { ...p, maximized: !p.maximized } : p)) })),

      setBounds: (pid, bounds) =>
        set((s) => ({
          processes: s.processes.map((p) => (p.pid === pid ? { ...p, bounds: { ...p.bounds, ...bounds } } : p)),
        })),

      setTitle: (pid, title) =>
        set((s) => ({ processes: s.processes.map((p) => (p.pid === pid ? { ...p, title } : p)) })),

      goHome: () => {
        if (isSession) {
          set({ overlay: 'none' });
          void bridge.session!.home();
          return;
        }
        set((s) => ({
          focusedPid: null,
          overlay: 'none',
          processes:
            s.mode === 'desktop'
              ? s.processes.map((p) => (getApp(p.appId)?.launch === 'floating' ? p : { ...p, minimized: true }))
              : s.processes,
        }));
      },

      windows: [],
      screen: null,
      installedApps: [],
      launchNative: (desktopId, opts) => {
        set({ overlay: 'none' });
        bridge.apps?.launch(desktopId, opts).catch((e: Error) => get().notify('Could not start app', e.message));
      },
      windowOp: (op, id) => {
        void bridge.session?.window(op, id);
      },
      logout: () => {
        void bridge.session?.logout();
      },

      /* ----------------------------------------------------------------- settings */
      settings: DEFAULT_SETTINGS,
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      pinned: ['files', 'webbrowser', 'terminal', 'code', 'mail', 'settings'],
      togglePin: (appId) =>
        set((s) => ({
          pinned: s.pinned.includes(appId) ? s.pinned.filter((id) => id !== appId) : [...s.pinned, appId],
        })),
      mobileDock: ['dialer', 'messages', 'mobilebrowser', 'camera'],

      /* ------------------------------------------------------------- transient UI */
      overlay: 'none',
      setOverlay: (overlay) => set({ overlay }),
      toggleOverlay: (o) => set((s) => ({ overlay: s.overlay === o ? 'none' : o })),
      toasts: [],
      history: [],
      notify: (title, body, icon) => {
        const s = get();
        const toast: Toast = { id: ++toastCounter, title, body, icon };
        set({ history: [toast, ...s.history].slice(0, 30) });
        if (!s.settings.notifications || s.settings.doNotDisturb) return;
        set({ toasts: [...s.toasts.slice(-2), toast] });
        setTimeout(() => get().dismissToast(toast.id), 3200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      clearHistory: () => set({ history: [] }),
      contextMenu: null,
      openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
      closeContextMenu: () => set({ contextMenu: null }),
      interacting: false,
      setInteracting: (interacting) => set({ interacting }),
    }),
    {
      name: 'opos-shell',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // In a session, preferences live in the main process (~/.config/opos/state.json) instead.
      partialize: (s) => (isSession ? {} : { settings: s.settings, pinned: s.pinned, modeLock: s.modeLock }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OSState>;
        const merged = { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
        if (p.modeLock && p.modeLock !== 'auto') merged.mode = p.modeLock;
        return merged;
      },
    },
  ),
);

/** Foreground (fullscreen) process for Mobile/TV shells — floating/overlay apps are excluded. */
export function selectForeground(s: Pick<OSState, 'processes' | 'focusedPid'>): Process | undefined {
  const p = s.processes.find((x) => x.pid === s.focusedPid);
  if (!p) return undefined;
  const launch = getApp(p.appId)?.launch;
  return launch === 'floating' || launch === 'overlay' ? undefined : p;
}
