/** Lazy component table for native apps (code-split per app). */
import { lazy } from 'react';
import type { AppComponent } from '../types';

const L = (loader: () => Promise<{ default: AppComponent }>) => lazy(loader);

export const APP_COMPONENTS: Record<string, AppComponent> = {
  settings: L(() => import('./native/Settings')),
  music: L(() => import('./native/Music')),
  plex: L(() => import('./native/Plex')),
  cloudgamer: L(() => import('./native/CloudGamer')),
  iptv: L(() => import('./native/IPTV')),
  weather: L(() => import('./native/Weather')),
  screensaver: L(() => import('./native/Screensaver')),
  dialer: L(() => import('./native/Dialer')),
  messages: L(() => import('./native/Messages')),
  mobilebrowser: L(() => import('./native/MobileBrowser')),
  camera: L(() => import('./native/Camera')),
  maps: L(() => import('./native/Maps')),
  calendar: L(() => import('./native/Calendar')),
  calculator: L(() => import('./native/Calculator')),
  notes: L(() => import('./native/Notes')),
  social: L(() => import('./native/SocialFeed')),
  files: L(() => import('./native/FileExplorer')),
  terminal: L(() => import('./native/Terminal')),
  code: L(() => import('./native/CodeEditor')),
  writer: L(() => import('./native/Writer')),
  monitor: L(() => import('./native/SystemMonitor')),
  webbrowser: L(() => import('./native/WebBrowser')),
  mail: L(() => import('./native/Mail')),
  photo: L(() => import('./native/PhotoEditor')),
  miniplayer: L(() => import('./native/FloatingPlayer')),
};
