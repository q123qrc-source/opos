import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export type Mode = 'desktop' | 'mobile' | 'tv';
export type ModeLock = 'auto' | Mode;
export type InputKind = 'mouse' | 'touch' | 'key';

/** Where an app conceptually belongs — drives grouping in each shell's launcher. */
export type AppCategory = 'system' | 'tv' | 'mobile' | 'desktop';

/**
 * How an app is presented when launched.
 *  - immersive: fullscreen cinematic surface (TV apps); a large window on desktop.
 *  - portrait:  fullscreen portrait wrapper on mobile; a phone-sized window on desktop.
 *  - window:    floating window on desktop; fullscreen on mobile / TV.
 *  - floating:  a mini always-on-top player in every mode.
 *  - overlay:   covers the entire shell in every mode (screensaver).
 */
export type LaunchStyle = 'immersive' | 'portrait' | 'window' | 'floating' | 'overlay';

export type RemoteProfile = 'webos' | 'tizen' | 'none';

export interface AppDefinition {
  id: string;
  name: string;
  category: AppCategory;
  icon: LucideIcon;
  /** CSS background for the icon squircle. */
  gradient: string;
  /** Hex accent used for glows / hero backdrops. */
  accent: string;
  description: string;
  launch: LaunchStyle;
  kind: 'native' | 'webview';
  url?: string;
  userAgent?: string;
  remoteProfile?: RemoteProfile;
  defaultSize?: { w: number; h: number };
  minSize?: { w: number; h: number };
  singleInstance?: boolean;
  /** TV launcher row. */
  tvRow?: 'streaming' | 'media' | 'live' | 'utility';
  keywords?: string[];
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Process {
  pid: string;
  appId: string;
  title: string;
  params?: Record<string, unknown>;
  bounds: Bounds;
  z: number;
  minimized: boolean;
  maximized: boolean;
  launchedAt: number;
}

export interface AppProps {
  pid: string;
  mode: Mode;
  params?: Record<string, unknown>;
}

export type AppComponent = ComponentType<AppProps>;

export interface Settings {
  userName: string;
  wallpaper: string;
  accent: string;
  wifi: boolean;
  bluetooth: boolean;
  airplane: boolean;
  brightness: number;
  volume: number;
  resolution: 'auto' | '720p' | '1080p' | '1440p' | '4k';
  hdr: boolean;
  nightLight: boolean;
  uiScale: number;
  reduceMotion: boolean;
  tvFullscreen: boolean;
  tvKeyThreshold: number;
  screensaverMinutes: number;
  use24h: boolean;
  notifications: boolean;
  doNotDisturb: boolean;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  icon?: string;
}
