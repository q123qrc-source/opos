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
