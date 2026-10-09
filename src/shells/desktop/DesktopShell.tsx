/** Desktop environment: wallpaper, desktop icons, context menus, taskbar, start menu, tray flyouts. */
import { useEffect, useMemo, useState } from 'react';
import { fsapi } from '../../lib/fsapi';
import type { FsEntry } from '../../lib/bridge';
import { FileText, Folder } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { getApp } from '../../apps/manifest';
import { AppIcon } from '../../components/AppIcon';
import { WALLPAPERS } from '../../lib/theme';
import { HOME, listDir, useFs } from '../../lib/vfs';
import { openFile } from '../../lib/openFile';
import { bridge, isElectron } from '../../lib/bridge';
import { cx } from '../../lib/hooks';
import { Taskbar } from './Taskbar';
import { StartMenu } from './StartMenu';
import { QuickSettings } from '../QuickSettings';
import { NotificationCenter } from './NotificationCenter';

const DESKTOP_APPS = ['files', 'webbrowser', 'terminal', 'code', 'mail', 'settings', 'cinema'];

/** Real ~/Desktop contents when running on the real filesystem. */
function useRealDesktopFiles(enabled: boolean) {
  const [files, setFiles] = useState<FsEntry[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      const home = await fsapi.home();
      const list = await fsapi.list(`${home}/Desktop`).catch(() => []);
      if (alive) setFiles(list);
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled]);
  return files;
}

/** `session`: rendered as the session's desktop surface — the taskbar and flyouts are separate windows. */
export function DesktopShell({ session = false }: { session?: boolean }) {
  const wallpaper = useOS((s) => s.settings.wallpaper);
  const overlay = useOS((s) => s.overlay);
  const { launch, openContextMenu, setModeLock, updateSettings, setOverlay } = useOS.getState();
  const nodes = useFs((s) => s.nodes);
  const realFiles = useRealDesktopFiles(fsapi.real);
  const desktopFiles = useMemo(
    () =>
      fsapi.real
        ? realFiles.map((f) => ({ path: f.path, name: f.name, node: { type: f.type, mtime: f.mtime } }))
        : listDir(nodes, `${HOME}/Desktop`),
    [nodes, realFiles],
  );
  const openDesktopFile = (p: string, type: string) => {
    if (type === 'dir') return launch('files', { path: p });
    if (fsapi.real && fsapi.openExternal) return void fsapi.openExternal(p);
    openFile(p);
  };
  const [selected, setSelected] = useState<string | null>(null);

  const nextWallpaper = () => {
    const keys = Object.keys(WALLPAPERS);
    updateSettings({ wallpaper: keys[(keys.indexOf(wallpaper) + 1) % keys.length] });
  };

  const onDesktopContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const fsApi = useFs.getState();
    const newItem = async (folder: boolean) => {
      if (!fsapi.real) {
        if (folder) fsApi.mkdir(uniqueName(`${HOME}/Desktop/New folder`));
        else fsApi.write(uniqueName(`${HOME}/Desktop/New document`, '.txt'), '');
        return;
      }
      const { uniquePath } = await import('../../lib/fsapi');
      const dir = `${await fsapi.home()}/Desktop`;
      if (folder) await fsapi.mkdir(await uniquePath(dir, 'New folder'));
      else await fsapi.writeText(await uniquePath(dir, 'New document', '.txt'), '');
    };
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Refresh', shortcut: 'F5', action: () => setSelected(null) },
      { label: 'New folder', action: () => void newItem(true) },
      { label: 'New text document', action: () => void newItem(false) },
      { label: '', divider: true },
      { label: 'Open in Terminal', action: () => launch('terminal', { cwd: `${HOME}/Desktop` }) },
      { label: 'Display settings', action: () => launch('settings', { section: 'display' }) },
      { label: 'Next wallpaper', action: nextWallpaper },
      { label: '', divider: true },
      { label: 'Switch to TV mode', action: () => setModeLock('tv') },
      { label: 'Switch to Mobile mode', action: () => setModeLock('mobile') },
      { label: 'Automatic mode', action: () => setModeLock('auto') },
    ]);
  };

  const iconBtn = (key: string, label: string, icon: React.ReactNode, onOpen: () => void, onContext?: (e: React.MouseEvent) => void) => (
    <button
      key={key}
      className={cx(
        'flex w-[84px] flex-col items-center gap-1.5 rounded-lg p-2 text-center outline-none transition',
        selected === key ? 'bg-white/15 ring-1 ring-white/25' : 'hover:bg-white/10',
      )}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(key);
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onContextMenu={(e) => {
        e.stopPropagation();
        setSelected(key);
        onContext?.(e);
      }}
    >
      {icon}
      <span className="line-clamp-2 text-[12px] leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,.9)]">{label}</span>
    </button>
  );

  return (
    <div className="absolute inset-0" data-nav-scope data-nav-priority="0">
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: WALLPAPERS[wallpaper]?.css ?? WALLPAPERS.aurora.css }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,.45))]" />

      {/* Host window drag strip (frameless Electron window) */}
      {isElectron && !session && <div className="absolute inset-x-0 top-0 z-[1] h-1.5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} onDoubleClick={() => bridge.window.maximize()} />}

      <div
        className={cx('absolute inset-0 flex flex-col flex-wrap content-start gap-1 p-3', session ? 'bottom-0' : 'bottom-[52px]')}
        onClick={() => setSelected(null)}
        onContextMenu={onDesktopContext}
        onPointerDown={() => overlay !== 'none' && setOverlay('none')}
      >
        {DESKTOP_APPS.map((id) => {
          const app = getApp(id)!;
          return iconBtn(id, id === 'files' ? 'This PC' : app.name, <AppIcon app={app} size={44} />, () => launch(id), (e) =>
            openContextMenu(e.clientX, e.clientY, [
              { label: 'Open', action: () => launch(id) },
              { label: useOS.getState().pinned.includes(id) ? 'Unpin from taskbar' : 'Pin to taskbar', action: () => useOS.getState().togglePin(id) },
            ]),
          );
        })}
        {desktopFiles.map((f) =>
          iconBtn(
            f.path,
            f.name,
            <div className="grid h-11 w-11 place-items-center">
              {f.node.type === 'dir' ? <Folder size={40} className="fill-amber-300/90 text-amber-400" /> : <FileText size={36} className="text-sky-200" />}
            </div>,
            () => openDesktopFile(f.path, f.node.type),
            (e) =>
              openContextMenu(e.clientX, e.clientY, [
                { label: 'Open', action: () => openDesktopFile(f.path, f.node.type) },
                { label: fsapi.real ? 'Move to Trash' : 'Delete', danger: true, action: () => void fsapi.trash(f.path) },
              ]),
          ),
        )}
      </div>

      {!session && (
        <>
          <Taskbar />
          {overlay === 'start' && <StartMenu />}
          {overlay === 'quick' && (
            <Flyout className="right-3 w-[360px]">
              <QuickSettings />
            </Flyout>
          )}
          {overlay === 'notifications' && (
            <Flyout className="right-3 w-[380px]">
              <NotificationCenter />
            </Flyout>
          )}
        </>
      )}
    </div>
  );
}

export function Flyout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('glass absolute bottom-[60px] z-[9500] animate-slide-up rounded-2xl p-4 shadow-window', className)} data-nav-scope data-nav-priority="30" onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function uniqueName(base: string, ext = '') {
  const nodes = useFs.getState().nodes;
  let name = `${base}${ext}`;
  let i = 2;
  while (nodes[name]) name = `${base} (${i++})${ext}`;
  return name;
}
