import { useMemo, useState } from 'react';
import { Search, Power, ChevronRight, ChevronLeft, FileText, Moon, RotateCw, Maximize, Minimize2, LogOut, Lock } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { CATEGORY_LABEL } from '../../apps/manifest';
import { useFs, basename } from '../../lib/vfs';
import { openFile } from '../../lib/openFile';
import { bridge, isSession } from '../../lib/bridge';
import { hasRealOs, sysActions } from '../../lib/system';
import { cx } from '../../lib/hooks';
import { findLaunchable, launch, LaunchableIcon, searchLaunchables, useLaunchables, type Launchable } from '../../session/launcher';

const NATIVE_CATEGORY: Record<string, string> = {
  internet: 'Internet',
  media: 'Sound & Video',
  games: 'Games',
  development: 'Development',
  graphics: 'Graphics',
  office: 'Office',
  system: 'System Tools',
  utilities: 'Utilities',
};

export function StartMenu({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState('');
  const [allApps, setAllApps] = useState(false);
  const [power, setPower] = useState(false);
  const pinned = useOS((s) => s.pinned);
  const installed = useOS((s) => s.installedApps);
  const userName = useOS((s) => s.settings.userName);
  const { setOverlay, openContextMenu, togglePin } = useOS.getState();
  const nodes = useFs((s) => s.nodes);
  const items = useLaunchables();

  const results = useMemo(() => searchLaunchables(items, query), [items, query]);
  const recent = useMemo(
    () =>
      isSession
        ? []
        : Object.entries(nodes)
            .filter(([, n]) => n.type === 'file')
            .sort((a, b) => b[1].mtime - a[1].mtime)
            .slice(0, 6),
    [nodes],
  );
  const pinnedItems = useMemo(() => {
    const keys = [...new Set([...pinned, 'settings', 'files', 'terminal', 'monitor', 'cinema', 'music', 'photo', 'writer', 'calculator', 'notes', 'weather', 'calendar'])];
    const fromPins = keys.map((k) => findLaunchable(k, installed)).filter(Boolean) as Launchable[];
    // Fill with a few installed apps so real software is one click away.
    const natives = items.filter((i) => i.kind === 'native' && !keys.includes(i.key)).slice(0, 6);
    return [...fromPins, ...natives].slice(0, 18);
  }, [pinned, installed, items]);

  const groups = useMemo(() => {
    const map = new Map<string, Launchable[]>();
    for (const i of items) {
      const label = i.kind === 'opos' ? `OPOS · ${CATEGORY_LABEL[i.category as keyof typeof CATEGORY_LABEL] ?? i.category}` : NATIVE_CATEGORY[i.category] ?? 'Other';
      map.set(label, [...(map.get(label) ?? []), i]);
    }
    return [...map.entries()].sort((a, b) => Number(a[0].startsWith('OPOS')) - Number(b[0].startsWith('OPOS')) || a[0].localeCompare(b[0]));
  }, [items]);

  const appContext = (e: React.MouseEvent, item: Launchable) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => launch(item) },
      ...(item.native?.actions ?? []).map((a) => ({ label: a.name, action: () => useOS.getState().launchNative(item.native!.id, { action: a.id }) })),
      { label: pinned.includes(item.key) ? 'Unpin from taskbar' : 'Pin to taskbar', action: () => togglePin(item.key) },
    ]);
  };

  const powerItems = isSession
    ? [
        { label: 'Lock', icon: Lock, action: () => sysActions.power('lock') },
        { label: 'Sleep', icon: Moon, action: () => sysActions.power('suspend') },
        { label: 'Restart', icon: RotateCw, action: () => sysActions.power('reboot') },
        { label: 'Shut down', icon: Power, action: () => sysActions.power('poweroff') },
        { label: 'Log out', icon: LogOut, action: () => useOS.getState().logout() },
      ]
    : [
        { label: 'Sleep (screensaver)', icon: Moon, action: () => launch('screensaver') },
        { label: 'Toggle fullscreen', icon: Maximize, action: () => bridge.window.setFullscreen() },
        { label: 'Minimize shell', icon: Minimize2, action: () => bridge.window.minimize() },
        { label: 'Restart shell', icon: RotateCw, action: () => location.reload() },
        ...(hasRealOs ? [{ label: 'Restart computer', icon: RotateCw, action: () => sysActions.power('reboot') }] : []),
        { label: 'Shut down', icon: LogOut, action: () => bridge.window.close() },
      ];

  const row = (i: Launchable, highlight = false) => (
    <button key={i.key} className={cx('flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10', highlight && 'bg-white/[.06]')} onClick={() => launch(i)} onContextMenu={(e) => appContext(e, i)}>
      <LaunchableIcon item={i} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{i.name}</div>
        {i.description && <div className="truncate text-xs text-white/50">{i.description}</div>}
      </div>
      <span className="ml-auto shrink-0 text-[11px] text-white/35">{i.kind === 'opos' ? 'OPOS' : 'App'}</span>
    </button>
  );

  return (
    <div
      className={cx(
        'glass z-[9500] flex h-[min(680px,calc(100vh-80px))] w-[min(660px,calc(100vw-24px))] animate-slide-up flex-col overflow-hidden rounded-2xl shadow-window',
        embedded ? 'relative' : 'absolute inset-x-0 bottom-[60px] mx-auto',
      )}
      data-nav-scope
      data-nav-priority="30"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-6 pt-6">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2.5 focus-within:border-os-accent/70">
          <Search size={17} className="text-white/50" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) launch(results[0]);
              if (e.key === 'Escape') setOverlay('none');
            }}
            placeholder={isSession ? `Search ${items.length} apps` : 'Search apps, settings and files'}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {query ? (
          <div className="flex flex-col gap-1">
            <div className="mb-1 text-xs font-semibold text-white/50">Best matches</div>
            {results.length === 0 && <div className="py-10 text-center text-sm text-white/40">No results for “{query}”</div>}
            {results.slice(0, 40).map((a, i) => row(a, i === 0))}
          </div>
        ) : allApps ? (
          <div>
            <button className="mb-3 flex items-center gap-1 rounded-md bg-white/[.07] px-2.5 py-1 text-xs text-white/80 hover:bg-white/15" onClick={() => setAllApps(false)}>
              <ChevronLeft size={14} /> Back
            </button>
            {groups.map(([label, apps]) => (
              <div key={label} className="mb-4">
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-white/40">{label}</div>
                {apps.map((a) => (
                  <button key={a.key} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={() => launch(a)} onContextMenu={(e) => appContext(e, a)}>
                    <LaunchableIcon item={a} size={28} />
                    <span className="truncate text-sm text-white/90">{a.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Pinned</span>
              <button className="flex items-center gap-1 rounded-md bg-white/[.07] px-2.5 py-1 text-xs text-white/80 hover:bg-white/15" onClick={() => setAllApps(true)}>
                All apps <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {pinnedItems.map((a) => (
                <button key={a.key} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 hover:bg-white/10" onClick={() => launch(a)} onContextMenu={(e) => appContext(e, a)}>
                  <LaunchableIcon item={a} size={38} />
                  <span className="w-full truncate text-center text-[11px] text-white/80">{a.name.replace('OPOS ', '')}</span>
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <>
                <div className="mb-2 mt-5 text-sm font-semibold text-white">Recommended</div>
                <div className="grid grid-cols-2 gap-1">
                  {recent.map(([path, node]) => (
                    <button key={path} className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10" onClick={() => { openFile(path); setOverlay('none'); }}>
                      <FileText size={26} className="shrink-0 text-sky-300" />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-white/90">{basename(path)}</div>
                        <div className="text-[11px] text-white/40">{new Date(node.mtime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="relative flex items-center justify-between border-t border-white/10 bg-black/20 px-6 py-3">
        <button className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => launch('settings', { section: 'account' })}>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-os-accent to-pink-400 text-sm font-bold text-black">{userName[0]?.toUpperCase()}</div>
          <span className="text-sm text-white/85">{userName}</span>
        </button>
        <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" onClick={() => setPower((v) => !v)} aria-label="Power">
          <Power size={18} />
        </button>
        {power && (
          <div className="glass absolute bottom-14 right-4 w-56 animate-pop-in rounded-xl p-1.5 text-sm shadow-window">
            {powerItems.map((item) => (
              <button key={item.label} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-white/85 hover:bg-white/10" onClick={() => void item.action()}>
                <item.icon size={15} /> {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
