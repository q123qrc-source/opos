/**
 * Unified launcher model: built-in OPOS apps and installed Linux applications (.desktop) share
 * one item type, one icon component, one search and one "running apps" grouping — so the
 * taskbar, Start menu, mobile launcher and TV home work identically in both runtimes:
 *   standalone  → OPOS processes inside one window
 *   session     → real compositor windows (OPOS app windows + native apps) via KWin
 */
import { useMemo, useState } from 'react';
import { APPS, getApp } from '../apps/manifest';
import { AppIcon } from '../components/AppIcon';
import { useOS } from '../store/useOS';
import { isSession, type InstalledApp, type SessionWindow } from '../lib/bridge';
import type { AppDefinition } from '../types';

export interface Launchable {
  key: string; // "settings" (OPOS) | "desktop:org.mozilla.firefox.desktop" (native)
  kind: 'opos' | 'native';
  name: string;
  description: string;
  category: string;
  keywords: string[];
  opos?: AppDefinition;
  native?: InstalledApp;
}

export const nativeKey = (id: string) => `desktop:${id}`;

function fromOpos(a: AppDefinition): Launchable {
  return { key: a.id, kind: 'opos', name: a.name, description: a.description, category: a.category, keywords: a.keywords ?? [], opos: a };
}

function fromNative(a: InstalledApp): Launchable {
  const cats = a.categories;
  const category = cats.includes('Game') ? 'games' : cats.some((c) => c === 'AudioVideo' || c === 'Audio' || c === 'Video') ? 'media' : cats.includes('Network') ? 'internet' : cats.includes('Development') ? 'development' : cats.includes('Graphics') ? 'graphics' : cats.includes('Office') ? 'office' : cats.some((c) => c === 'Settings' || c === 'System') ? 'system' : 'utilities';
  return { key: nativeKey(a.id), kind: 'native', name: a.name, description: a.comment || a.genericName, category, keywords: [...a.keywords, a.genericName].filter(Boolean), native: a };
}

export function useLaunchables(): Launchable[] {
  const installed = useOS((s) => s.installedApps);
  return useMemo(() => [...APPS.map(fromOpos), ...installed.map(fromNative)], [installed]);
}

export function findLaunchable(key: string, installed: InstalledApp[]): Launchable | null {
  if (key.startsWith('desktop:')) {
    const n = installed.find((a) => nativeKey(a.id) === key);
    return n ? fromNative(n) : null;
  }
  const o = getApp(key);
  return o ? fromOpos(o) : null;
}

export function searchLaunchables(items: Launchable[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const score = (l: Launchable) => {
    const n = l.name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    if (l.keywords.some((k) => k.toLowerCase().includes(q))) return 3;
    if (l.description.toLowerCase().includes(q)) return 4;
    return 99;
  };
  return items
    .map((l) => [l, score(l)] as const)
    .filter(([, s]) => s < 99)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name))
    .map(([l]) => l);
}

export function launch(item: Launchable | string, params?: Record<string, unknown>) {
  const key = typeof item === 'string' ? item : item.key;
  const s = useOS.getState();
  if (key.startsWith('desktop:')) s.launchNative(key.slice('desktop:'.length));
  else s.launch(key, params);
}

/* ------------------------------------------------------------------ icons */

export function NativeIcon({ src, name, size }: { src: string | null; name: string; size: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return (
      <div
        className="grid shrink-0 place-items-center font-bold text-white"
        style={{ width: size, height: size, borderRadius: size * 0.26, fontSize: size * 0.45, background: `linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 50) % 360} 60% 32%))` }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="shrink-0 object-contain drop-shadow" style={{ width: size, height: size }} />;
}

export function LaunchableIcon({ item, size = 48 }: { item: Launchable; size?: number }) {
  if (item.opos) return <AppIcon app={item.opos} size={size} />;
  return <NativeIcon src={item.native?.icon ?? null} name={item.name} size={size} />;
}

/* ----------------------------------------------------------- running apps */

export interface RunningGroup {
  key: string;
  name: string;
  item: Launchable | null;
  windows: { id: string; title: string; active: boolean; minimized: boolean }[];
  active: boolean;
}

export function useRunningGroups(): RunningGroup[] {
  const processes = useOS((s) => s.processes);
  const focusedPid = useOS((s) => s.focusedPid);
  const windows = useOS((s) => s.windows);
  const installed = useOS((s) => s.installedApps);

  return useMemo(() => {
    const groups = new Map<string, RunningGroup>();
    const add = (key: string, name: string, item: Launchable | null, w: RunningGroup['windows'][number]) => {
      const g = groups.get(key) ?? { key, name, item, windows: [], active: false };
      g.windows.push(w);
      g.active = g.active || (w.active && !w.minimized);
      groups.set(key, g);
    };
    if (isSession) {
      for (const w of windows as SessionWindow[]) {
        const key = w.oposApp ?? (w.desktopId ? nativeKey(w.desktopId) : `window:${w.title}`);
        const item = findLaunchable(key, installed);
        add(key, item?.name ?? w.name, item, { id: w.id, title: w.title, active: w.active, minimized: w.minimized });
      }
    } else {
      for (const p of processes) {
        const app = getApp(p.appId);
        if (!app || app.launch === 'overlay') continue;
        add(p.appId, app.name, fromOpos(app), { id: p.pid, title: p.title, active: p.pid === focusedPid, minimized: p.minimized });
      }
    }
    return [...groups.values()];
  }, [processes, focusedPid, windows, installed]);
}

/** Click on a taskbar/dock entry: launch, focus, minimize or cycle windows. */
export function activateGroup(key: string, group: RunningGroup | undefined) {
  if (!group || !group.windows.length) return launch(key);
  const s = useOS.getState();
  const wins = group.windows;
  if (isSession) {
    if (wins.length === 1) return s.windowOp('toggleMinimize', wins[0].id);
    const idx = wins.findIndex((w) => w.active);
    return s.windowOp('activate', wins[(idx + 1) % wins.length].id);
  }
  if (wins.length === 1) {
    const w = wins[0];
    if (w.active && !w.minimized) s.minimize(w.id);
    else s.focus(w.id);
    return;
  }
  const idx = wins.findIndex((w) => w.active);
  s.focus(wins[(idx + 1) % wins.length].id);
}

export function focusWindow(id: string) {
  const s = useOS.getState();
  if (isSession) s.windowOp('activate', id);
  else s.focus(id);
}

export function closeWindow(id: string) {
  const s = useOS.getState();
  if (isSession) s.windowOp('close', id);
  else s.close(id);
}
