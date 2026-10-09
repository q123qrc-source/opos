/**
 * Typed access to the Electron preload bridge (`window.opos`), with a browser fallback so the
 * shell also runs in a plain browser via `npm run dev:web`.
 */
import type { Mode } from '../types';

export interface DrmStatus {
  provider: 'castlabs-ecs' | 'local-cdm' | 'none' | 'browser';
  status: string;
  detail: string;
  cdmPath?: string | null;
  electron?: string;
  chrome?: string;
}

export interface SystemStats {
  cpu: number;
  perCore: number[];
  cpuModel: string;
  memTotal: number;
  memFree: number;
  uptime: number;
  loadavg: number[];
  platform: string;
  hostname: string;
  metrics: { pid: number; type: string; name: string; cpu: number; memoryKB: number }[];
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

type Unsubscribe = () => void;
export type MediaAction = 'playpause' | 'next' | 'previous' | 'stop';

/* ----------------------------------------------------------- real OS types */

export interface Battery { available: boolean; level?: number; charging?: boolean; full?: boolean; timeToEmpty?: number; timeToFull?: number }
export interface NetworkState { available: boolean; online?: boolean; connecting?: boolean; wifiEnabled?: boolean; wifiHardware?: boolean; primaryType?: string; primaryName?: string; wifi?: { ssid: string; strength: number } | null }
export interface AccessPoint { ssid: string; strength: number; secure: boolean; active: boolean; enterprise: boolean }
export interface BluetoothState { available: boolean; powered: boolean; name?: string; devices: { path: string; name: string; connected: boolean; icon: string; battery: number | null }[] }
export interface VolumeState { available: boolean; level: number; muted: boolean; backend?: string }
export interface BrightnessState { available: boolean; level: number; device?: string }
export interface MediaPlayer { id: string; identity: string; status: string; title: string; artist: string; album: string; artUrl: string; length: number; canGoNext: boolean; canGoPrevious: boolean }
export interface PowerCaps { available: boolean; poweroff: boolean; reboot: boolean; suspend: boolean; hibernate: boolean }
export interface OsInfo { os: string; kernel: string; arch: string; hostname: string; user: string; cpu: string; cores: number; memTotal: number; uptime: number; session: string; desktop: string }
export interface ProcInfo { pid: number; name: string; cmd: string; cpu: number; rss: number; state: string; own: boolean }
export interface FsEntry { name: string; path: string; type: 'dir' | 'file'; size: number; mtime: number; link?: boolean; broken?: boolean }
export interface Place { label: string; path: string; icon: string }
export interface InstalledApp { id: string; name: string; genericName: string; comment: string; keywords: string[]; categories: string[]; icon: string | null; terminal: boolean; actions: { id: string; name: string }[] }
export interface SessionWindow { id: string; title: string; minimized: boolean; active: boolean; maximized: boolean; fullScreen: boolean; dialog: boolean; oposApp: string | null; desktopId: string | null; name: string; icon: string | null; pid: number }

interface OsApi {
  info(): Promise<OsInfo>;
  power(action: 'poweroff' | 'reboot' | 'suspend' | 'hibernate' | 'lock'): Promise<void>;
  powerCaps(): Promise<PowerCaps>;
  battery(): Promise<Battery>;
  onBattery(cb: (b: Battery) => void): Unsubscribe;
  network(): Promise<NetworkState>;
  onNetwork(cb: (n: NetworkState) => void): Unsubscribe;
  wifiScan(): Promise<AccessPoint[]>;
  setWifiEnabled(on: boolean): Promise<void>;
  wifiConnect(ssid: string, password?: string): Promise<void>;
  wifiDisconnect(): Promise<void>;
  bluetooth(): Promise<BluetoothState>;
  setBluetoothPowered(on: boolean): Promise<void>;
  bluetoothDevice(path: string, connect: boolean): Promise<void>;
  volume(): Promise<VolumeState>;
  setVolume(v: number): Promise<void>;
  setMuted(m: boolean): Promise<void>;
  brightness(): Promise<BrightnessState>;
  setBrightness(v: number): Promise<void>;
  media(): Promise<MediaPlayer[]>;
  mediaControl(action: string, id?: string): Promise<boolean>;
  processes(): Promise<ProcInfo[]>;
  kill(pid: number): Promise<void>;
  cpu(): Promise<{ total: number; perCore: number[] }>;
  notificationAction(id: number, key: string): Promise<void>;
  dismissNotification(id: number): Promise<void>;
}

interface FsApi {
  list(dir: string, opts?: { hidden?: boolean }): Promise<FsEntry[]>;
  stat(p: string): Promise<{ type: 'dir' | 'file'; size: number; mtime: number }>;
  readText(p: string): Promise<string>;
  readDataUrl(p: string): Promise<string>;
  writeText(p: string, c: string): Promise<void>;
  writeDataUrl(p: string, d: string): Promise<void>;
  mkdir(p: string): Promise<void>;
  rename(a: string, b: string): Promise<void>;
  copy(a: string, b: string): Promise<void>;
  trash(p: string): Promise<void>;
  places(): Promise<Place[]>;
  home(): Promise<string>;
  open(p: string): Promise<void>;
}

interface PtyApi {
  available(): Promise<boolean>;
  create(opts: { cols: number; rows: number; cwd?: string }): Promise<number>;
  write(id: number, data: string): void;
  resize(id: number, cols: number, rows: number): void;
  kill(id: number): void;
  onData(cb: (id: number, data: string) => void): Unsubscribe;
  onExit(cb: (id: number, code: number) => void): Unsubscribe;
}

interface AppsApi {
  list(): Promise<InstalledApp[]>;
  launch(id: string, opts?: { action?: string; targets?: string[] }): Promise<void>;
  onChange(cb: (apps: InstalledApp[]) => void): Unsubscribe;
}

export interface SessionApi {
  active: boolean;
  initialState: Record<string, unknown> | null;
  patch(p: Record<string, unknown>): void;
  onPatch(cb: (changed: Record<string, unknown>, origin: number) => void): Unsubscribe;
  openApp(appId: string, params?: Record<string, unknown>): Promise<void>;
  window(op: 'activate' | 'minimize' | 'toggleMinimize' | 'close' | 'toggleMaximize', id: string): Promise<void>;
  home(): Promise<void>;
  back(): Promise<void>;
  logout(): Promise<void>;
  onAppParams(cb: (p: Record<string, unknown>) => void): Unsubscribe;
}

interface OposBridge {
  isElectron: boolean;
  platform: string;
  versions: { electron?: string; chrome?: string; node?: string };
  shimPath: string;
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    setFullscreen(value?: boolean): void;
    getState(): Promise<WindowState | null>;
    onState(cb: (s: WindowState) => void): Unsubscribe;
  };
  mode: {
    changed(mode: Mode): void;
    onRequest(cb: (mode: Mode | 'auto') => void): Unsubscribe;
  };
  media: { onKey(cb: (action: MediaAction) => void): Unsubscribe };
  drm: { status(): Promise<DrmStatus> };
  system: { stats(): Promise<SystemStats> };
  openExternal(url: string): void;
  os?: OsApi;
  fs?: FsApi;
  pty?: PtyApi;
  apps?: AppsApi;
  session?: SessionApi;
}

declare global {
  interface Window {
    opos?: OposBridge;
  }
}

const noop = () => {};

const browserFallback: OposBridge = {
  isElectron: false,
  platform: typeof navigator !== 'undefined' ? navigator.platform : 'web',
  versions: {},
  shimPath: '',
  window: {
    minimize: noop,
    maximize: () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(noop);
      else document.documentElement.requestFullscreen?.().catch(noop);
    },
    close: () => window.close(),
    setFullscreen: (value) => {
      const on = value ?? !document.fullscreenElement;
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(noop);
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(noop);
    },
    getState: async () => ({ maximized: false, fullscreen: !!document.fullscreenElement, focused: document.hasFocus() }),
    onState: (cb) => {
      const h = () => cb({ maximized: false, fullscreen: !!document.fullscreenElement, focused: document.hasFocus() });
      document.addEventListener('fullscreenchange', h);
      return () => document.removeEventListener('fullscreenchange', h);
    },
  },
  mode: { changed: noop, onRequest: () => noop },
  media: {
    onKey: (cb) => {
      const map: Record<string, MediaAction> = {
        MediaPlayPause: 'playpause',
        MediaTrackNext: 'next',
        MediaTrackPrevious: 'previous',
        MediaStop: 'stop',
      };
      const h = (e: KeyboardEvent) => {
        if (map[e.key]) {
          e.preventDefault();
          cb(map[e.key]);
        }
      };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    },
  },
  drm: {
    status: async () => {
      let supported = false;
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
          { initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] },
        ]);
        supported = true;
      } catch {
        supported = false;
      }
      return {
        provider: 'browser',
        status: supported ? 'ready' : 'unavailable',
        detail: supported ? 'Widevine provided by the host browser' : 'Host browser has no Widevine CDM',
      };
    },
  },
  system: {
    stats: async () => {
      throw new Error('system stats unavailable in browser');
    },
  },
  openExternal: (url) => window.open(url, '_blank', 'noopener'),
};

export const bridge: OposBridge = typeof window !== 'undefined' && window.opos ? window.opos : browserFallback;
export const isElectron = bridge.isElectron;
/** True when OPOS is the user's desktop session (multi-surface, KWin-managed windows). */
export const isSession = !!bridge.session?.active;
/** Which shell surface this renderer is (desktop, panel, topbar, overlay, toast, app) — or null standalone. */
export const surface: string | null = new URLSearchParams(location.search).get('surface');

/** Call a real OS service; resolves to `fallback` when unavailable or failing. */
export async function osCall<T>(fn: ((api: OsApi) => Promise<T>) | null, fallback: T): Promise<T> {
  if (!bridge.os || !fn) return fallback;
  try {
    return await fn(bridge.os);
  } catch {
    return fallback;
  }
}
