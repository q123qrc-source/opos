import { useMemo, useState } from 'react';
import { Search, Power, ChevronRight, ChevronLeft, FileText, Moon, RotateCw, Maximize, Minimize2, LogOut } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { APPS, CATEGORY_LABEL, getApp, searchApps } from '../../apps/manifest';
import { AppIcon } from '../../components/AppIcon';
import { useFs, basename } from '../../lib/vfs';
import { openFile } from '../../lib/openFile';
import { bridge } from '../../lib/bridge';
import { cx } from '../../lib/hooks';
import type { AppCategory } from '../../types';

export function StartMenu() {
  const [query, setQuery] = useState('');
  const [allApps, setAllApps] = useState(false);
  const [power, setPower] = useState(false);
  const pinned = useOS((s) => s.pinned);
  const userName = useOS((s) => s.settings.userName);
  const { launch, setOverlay, openContextMenu, togglePin } = useOS.getState();
  const nodes = useFs((s) => s.nodes);

  const results = useMemo(() => searchApps(query), [query]);
  const recent = useMemo(
    () =>
      Object.entries(nodes)
        .filter(([, n]) => n.type === 'file')
        .sort((a, b) => b[1].mtime - a[1].mtime)
        .slice(0, 6),
    [nodes],
  );
  const startPinned = [...new Set([...pinned, 'cinema', 'music', 'photo', 'writer', 'monitor', 'calculator', 'notes', 'weather', 'messages', 'plex', 'calendar'])].slice(0, 18);

  const appContext = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => launch(id) },
      { label: pinned.includes(id) ? 'Unpin from taskbar' : 'Pin to taskbar', action: () => togglePin(id) },
    ]);
  };

  return (
    <div
      className="glass absolute inset-x-0 bottom-[60px] z-[9500] mx-auto flex h-[min(680px,calc(100%-80px))] w-[min(640px,calc(100%-24px))] animate-slide-up flex-col overflow-hidden rounded-2xl shadow-window"
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
              if (e.key === 'Enter' && results[0]) launch(results[0].id);
            }}
            placeholder="Search apps, settings and files"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {query ? (
          <div className="flex flex-col gap-1">
            <div className="mb-1 text-xs font-semibold text-white/50">Best matches</div>
            {results.length === 0 && <div className="py-10 text-center text-sm text-white/40">No results for “{query}”</div>}
            {results.map((a, i) => (
              <button key={a.id} className={cx('flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10', i === 0 && 'bg-white/[.06]')} onClick={() => launch(a.id)}>
                <AppIcon app={a} size={36} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{a.name}</div>
                  <div className="truncate text-xs text-white/50">{a.description}</div>
                </div>
                <span className="ml-auto text-[11px] text-white/35">{CATEGORY_LABEL[a.category]}</span>
              </button>
            ))}
          </div>
        ) : allApps ? (
          <div>
            <button className="mb-3 flex items-center gap-1 rounded-md bg-white/[.07] px-2.5 py-1 text-xs text-white/80 hover:bg-white/15" onClick={() => setAllApps(false)}>
              <ChevronLeft size={14} /> Back
            </button>
            {(['system', 'desktop', 'mobile', 'tv'] as AppCategory[]).map((cat) => (
              <div key={cat} className="mb-4">
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-white/40">{CATEGORY_LABEL[cat]}</div>
                {APPS.filter((a) => a.category === cat).map((a) => (
                  <button key={a.id} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={() => launch(a.id)} onContextMenu={(e) => appContext(e, a.id)}>
                    <AppIcon app={a} size={28} />
                    <span className="text-sm text-white/90">{a.name}</span>
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
              {startPinned.map((id) => {
                const a = getApp(id);
                if (!a) return null;
                return (
                  <button key={id} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 hover:bg-white/10" onClick={() => launch(id)} onContextMenu={(e) => appContext(e, id)}>
                    <AppIcon app={a} size={38} />
                    <span className="w-full truncate text-center text-[11px] text-white/80">{a.name.replace('OPOS ', '')}</span>
                  </button>
                );
              })}
            </div>
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
            {[
              { label: 'Sleep (screensaver)', icon: Moon, action: () => launch('screensaver') },
              { label: 'Toggle fullscreen', icon: Maximize, action: () => bridge.window.setFullscreen() },
              { label: 'Minimize shell', icon: Minimize2, action: () => bridge.window.minimize() },
              { label: 'Restart shell', icon: RotateCw, action: () => location.reload() },
              { label: 'Shut down', icon: LogOut, action: () => bridge.window.close() },
            ].map((item) => (
              <button key={item.label} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-white/85 hover:bg-white/10" onClick={item.action}>
                <item.icon size={15} /> {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
