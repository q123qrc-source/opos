/**
 * Mobile environment: status bar, paginated swipeable launcher with widgets and dock, sticky bottom
 * navigation (Back / Home / Recents), recents switcher and pull-down control center.
 */
import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { ChevronLeft, Circle, Square, Wifi, WifiOff, Signal, Search, X, Play, Pause, SkipForward, Plane, BatteryCharging } from 'lucide-react';
import { useOS, selectForeground } from '../../store/useOS';
import { bridge, isSession } from '../../lib/bridge';
import { findLaunchable, focusWindow, closeWindow, launch, LaunchableIcon, searchLaunchables, useLaunchables, useRunningGroups, NativeIcon, type Launchable } from '../../session/launcher';
import { MOBILE_NAV_H, MOBILE_STATUS_H } from '../../components/ProcessLayer';
import { QuickSettings } from '../QuickSettings';
import { WALLPAPERS } from '../../lib/theme';
import { performBack } from '../../lib/backStack';
import { audio, useAudio, TRACKS } from '../../lib/audioEngine';
import { useWeather } from '../../lib/weather';
import { cx, useClock, useTimeFormat } from '../../lib/hooks';
import { useTrayStatus } from '../desktop/Taskbar';

const PER_PAGE = 20;

/** Launcher pages: OPOS mobile apps, then installed apps, then everything else. */
function useMobilePages(dock: string[]) {
  const items = useLaunchables();
  return useMemo(() => {
    const order = (l: Launchable) => (l.kind === 'opos' ? ['mobile', 'system', 'tv', 'desktop'].indexOf(l.category) * 2 : 1);
    const apps = items.filter((a) => !dock.includes(a.key)).sort((a, b) => order(a) - order(b) || 0);
    // First page hosts widgets + 8 apps; the rest are full 4x5 grids.
    const out: Launchable[][] = [apps.slice(0, 8)];
    for (let i = 8; i < apps.length; i += PER_PAGE) out.push(apps.slice(i, i + PER_PAGE));
    return out;
  }, [items, dock]);
}

/** Wallpaper + widgets + paginated launcher + dock (the session's mobile desktop surface). */
export function MobileHome() {
  const wallpaper = useOS((s) => s.settings.wallpaper);
  const dock = useOS((s) => s.mobileDock);
  const pages = useMobilePages(dock);
  return (
    <div className="absolute inset-0 select-none" data-nav-scope data-nav-priority="0">
      <div className="absolute inset-0" style={{ background: WALLPAPERS[wallpaper]?.css ?? WALLPAPERS.aurora.css }} />
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-x-0 flex flex-col" style={{ top: MOBILE_STATUS_H, bottom: MOBILE_NAV_H }}>
        <Pager pages={pages} />
        <Dock ids={dock} />
      </div>
    </div>
  );
}

export function MobileShell() {
  const wallpaper = useOS((s) => s.settings.wallpaper);
  const overlay = useOS((s) => s.overlay);
  const dock = useOS((s) => s.mobileDock);
  const foreground = useOS(selectForeground);

  const pages = useMobilePages(dock);

  return (
    <div className="absolute inset-0 select-none" data-nav-scope data-nav-priority="0">
      <div className="absolute inset-0" style={{ background: WALLPAPERS[wallpaper]?.css ?? WALLPAPERS.aurora.css }} />
      <div className="absolute inset-0 bg-black/20" />

      <StatusBar dark={!!foreground} />

      <div className="absolute inset-x-0 flex flex-col" style={{ top: MOBILE_STATUS_H, bottom: MOBILE_NAV_H }}>
        <Pager pages={pages} />
        <Dock ids={dock} />
      </div>

      <NavBar />
      {overlay === 'recents' && <Recents />}
      {overlay === 'quick' && <ControlCenter />}
      {overlay === 'start' && <SearchSheet />}
    </div>
  );
}

/* --------------------------------------------------------------- status bar */

export function StatusBar({ dark }: { dark: boolean }) {
  const now = useClock(5000);
  const fmt = useTimeFormat();
  const tray = useTrayStatus();
  const battery = { level: tray.battery.level, charging: tray.battery.charging };
  const online = tray.network.online;
  const airplane = useOS((s) => s.settings.airplane);
  const setOverlay = useOS((s) => s.setOverlay);
  const startY = useRef<number | null>(null);

  return (
    <div
      className={cx('absolute inset-x-0 top-0 z-[9000] flex touch-none items-center justify-between px-6 text-[13px] font-semibold text-white', dark && 'bg-black')}
      style={{ height: MOBILE_STATUS_H }}
      onPointerDown={(e) => (startY.current = e.clientY)}
      onPointerUp={(e) => {
        if (startY.current !== null && e.clientY - startY.current > 12) setOverlay('quick');
        startY.current = null;
      }}
      onClick={() => setOverlay('quick')}
    >
      <span>{fmt(now)}</span>
      <div className="flex items-center gap-1.5">
        {airplane ? <Plane size={14} /> : <Signal size={14} />}
        {online ? <Wifi size={14} /> : <WifiOff size={14} className="opacity-50" />}
        <span className="text-[12px]">{Math.round(battery.level * 100)}%</span>
        <div className="relative flex h-[12px] w-[24px] items-center rounded-[4px] border border-white/70 p-[1.5px]">
          <div className={cx('h-full rounded-[2px]', battery.level < 0.2 ? 'bg-red-400' : 'bg-white')} style={{ width: `${battery.level * 100}%` }} />
          {battery.charging && <BatteryCharging size={10} className="absolute left-1/2 -translate-x-1/2 text-black" />}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- pager */

function Pager({ pages }: { pages: Launchable[][] }) {
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null);
  const setOverlay = useOS((s) => s.setOverlay);

  const onDown = (e: RPE<HTMLDivElement>) => {
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null };
  };
  const onMove = (e: RPE<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis && Math.hypot(dx, dy) > 8) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (g.axis === 'x') {
      const atEdge = (page === 0 && dx > 0) || (page === pages.length - 1 && dx < 0);
      setDrag(atEdge ? dx * 0.3 : dx);
    }
  };
  const onUp = (e: RPE<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.axis === 'x') {
      const width = ref.current?.clientWidth ?? 400;
      const velocity = dx / (performance.now() - g.t);
      if ((dx < -width * 0.2 || velocity < -0.5) && page < pages.length - 1) setPage(page + 1);
      else if ((dx > width * 0.2 || velocity > 0.5) && page > 0) setPage(page - 1);
    } else if (g.axis === 'y' && dy > 70) {
      setOverlay('start'); // swipe down on home = search
    }
    setDrag(0);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 touch-pan-y overflow-hidden" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div
          className={cx('flex h-full', drag === 0 && 'transition-transform duration-300 ease-out')}
          style={{ width: `${pages.length * 100}%`, transform: `translateX(calc(${(-page * 100) / pages.length}% + ${drag}px))` }}
        >
          {pages.map((apps, i) => (
            <div key={i} className="h-full px-5 pt-4" style={{ width: `${100 / pages.length}%` }}>
              {i === 0 && <Widgets />}
              <div className="grid grid-cols-4 content-start gap-x-3 gap-y-5">
                {apps.map((a) => (
                  <LauncherIcon key={a.key} app={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-1.5 py-2">
        {pages.map((_, i) => (
          <button key={i} className={cx('h-1.5 rounded-full transition-all', i === page ? 'w-4 bg-white' : 'w-1.5 bg-white/40')} onClick={() => setPage(i)} aria-label={`Page ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

function LauncherIcon({ app, label = true }: { app: Launchable; label?: boolean }) {
  const openContextMenu = useOS((s) => s.openContextMenu);
  return (
    <button
      className="flex flex-col items-center gap-1.5 transition active:scale-90"
      onClick={() => launch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: `Open ${app.name}`, action: () => launch(app) },
          ...(app.description ? [{ label: app.description, disabled: true }] : []),
        ]);
      }}
    >
      <LaunchableIcon item={app} size={58} />
      {label && <span className="w-full truncate text-center text-[11px] font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">{app.name.replace('OPOS ', '')}</span>}
    </button>
  );
}

function Widgets() {
  const now = useClock(10000);
  const fmt = useTimeFormat();
  const weather = useWeather();
  const { playing, index } = useAudio();
  const launch = useOS((s) => s.launch);
  const track = TRACKS[index];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      <button className="glass-light flex aspect-square flex-col justify-between rounded-[1.6rem] p-4 text-left" onClick={() => launch('weather')}>
        <div>
          <div className="text-[13px] font-semibold text-white/90">{weather.city}</div>
          <div className="text-5xl font-extralight text-white">{weather.current ? `${Math.round(weather.current.temp)}°` : '--'}</div>
        </div>
        <div>
          <div className="text-2xl">{weather.current?.emoji ?? '⛅'}</div>
          <div className="text-[12px] text-white/70">{weather.current?.label ?? 'Loading…'}</div>
        </div>
      </button>
      <div className="glass-light flex aspect-square flex-col justify-between rounded-[1.6rem] p-4">
        <button className="text-left" onClick={() => launch('calendar')}>
          <div className="text-[12px] font-semibold uppercase text-red-300">{now.toLocaleDateString([], { weekday: 'long' })}</div>
          <div className="text-4xl font-light text-white">{now.getDate()}</div>
          <div className="text-[12px] text-white/70">{fmt(now)}</div>
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${track.colors[0]}, ${track.colors[1]})` }} />
          <div className="min-w-0 flex-1" onClick={() => launch('music')}>
            <div className="truncate text-[11px] font-semibold text-white">{track.title}</div>
            <div className="truncate text-[10px] text-white/60">{track.artist}</div>
          </div>
          <button className="text-white" onClick={() => audio.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dock({ ids }: { ids: string[] }) {
  const installed = useOS((s) => s.installedApps);
  return (
    <div className="mx-3 mb-2 grid grid-cols-4 gap-3 rounded-[2rem] bg-white/15 px-4 py-3 backdrop-blur-2xl">
      {ids.map((id) => {
        const a = findLaunchable(id, installed);
        return a ? <LauncherIcon key={id} app={a} label={false} /> : null;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- nav bar */

export function NavBar() {
  const { goHome, toggleOverlay } = useOS.getState();
  const overlay = useOS((s) => s.overlay);
  const btn = 'grid h-full flex-1 place-items-center text-white/85 transition active:scale-90 active:text-white';
  return (
    <div className="absolute inset-x-0 bottom-0 z-[9000] flex items-center bg-black/85 backdrop-blur-xl" style={{ height: MOBILE_NAV_H }}>
      <button className={btn} onClick={() => (isSession ? void bridge.session?.back() : performBack())} aria-label="Back">
        <ChevronLeft size={24} />
      </button>
      <button className={btn} onClick={goHome} aria-label="Home">
        <Circle size={20} />
      </button>
      <button className={cx(btn, overlay === 'recents' && 'text-os-accent')} onClick={() => toggleOverlay('recents')} aria-label="Recent apps">
        <Square size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- recents */

export function Recents() {
  const groups = useRunningGroups();
  const { setOverlay, closeAll } = useOS.getState();
  const cards = groups.flatMap((g) => g.windows.map((w) => ({ ...w, group: g })));
  return (
    <div className="absolute inset-x-0 top-0 z-[9500] flex animate-fade-in flex-col bg-black/75 backdrop-blur-xl" style={{ bottom: isSession ? 0 : MOBILE_NAV_H }} onClick={() => setOverlay('none')} data-nav-scope data-nav-priority="30">
      <div className="mt-12 px-6 text-sm font-semibold text-white/70">Recent apps</div>
      {cards.length === 0 ? (
        <div className="grid flex-1 place-items-center text-sm text-white/50">No recent apps</div>
      ) : (
        <div className="no-scrollbar flex flex-1 snap-x snap-mandatory items-center gap-4 overflow-x-auto px-[15%]">
          {cards.map((c) => (
            <RecentCard key={c.id} item={c.group.item} name={c.group.name} title={c.title} onOpen={() => { focusWindow(c.id); setOverlay('none'); }} onClose={() => closeWindow(c.id)} />
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <button
          className="mx-auto mb-6 rounded-full bg-white/15 px-5 py-2 text-sm font-medium text-white"
          onClick={(e) => {
            e.stopPropagation();
            if (isSession) cards.forEach((c) => closeWindow(c.id));
            else closeAll();
            setOverlay('none');
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function RecentCard({ item, name, title, onOpen, onClose }: { item: Launchable | null; name: string; title: string; onOpen: () => void; onClose: () => void }) {
  const accent = item?.opos?.accent ?? '#7c8cff';
  const icon = (size: number) => (item ? <LaunchableIcon item={item} size={size} /> : <NativeIcon src={null} name={name} size={size} />);
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <div
      className="flex h-[62%] w-[70%] shrink-0 snap-center touch-pan-x flex-col gap-2"
      style={{ transform: `translateY(${dy}px)`, opacity: 1 - Math.min(1, -dy / 300), transition: start.current === null ? 'all .25s' : 'none' }}
      onClick={(e) => {
        e.stopPropagation();
        if (Math.abs(dy) < 5) onOpen();
      }}
      onPointerDown={(e) => {
        start.current = e.clientY;
      }}
      onPointerMove={(e) => start.current !== null && setDy(Math.min(0, e.clientY - start.current))}
      onPointerUp={() => {
        if (dy < -120) onClose();
        start.current = null;
        setDy(0);
      }}
    >
      <div className="flex items-center gap-2 px-1">
        {icon(24)}
        <span className="flex-1 truncate text-sm font-medium text-white">{title}</span>
        <button
          className="rounded-full bg-white/10 p-1 text-white/70"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close app"
        >
          <X size={14} />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/10 shadow-2xl" style={{ background: `radial-gradient(circle at 50% 30%, ${accent}66, #0b0c12 70%)` }}>
        <div className="absolute inset-0 grid place-items-center">{icon(88)}</div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-xs text-white/60">Swipe up to close</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ control center */

export function ControlCenter() {
  const setOverlay = useOS((s) => s.setOverlay);
  const { playing, index } = useAudio();
  const track = TRACKS[index];
  return (
    <div className="absolute inset-0 z-[9500] animate-fade-in bg-black/50 backdrop-blur-md" onClick={() => setOverlay('none')} data-nav-scope data-nav-priority="30">
      <div className="mx-3 mt-10 animate-slide-up rounded-[2rem] bg-[#141623]/90 p-4 shadow-2xl backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <QuickSettings compact />
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[.06] p-3">
          <div className="h-12 w-12 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${track.colors[0]}, ${track.colors[1]})` }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{track.title}</div>
            <div className="truncate text-xs text-white/55">{track.artist}</div>
          </div>
          <button className="p-2 text-white" onClick={() => audio.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}
          </button>
          <button className="p-2 text-white" onClick={() => audio.next()} aria-label="Next">
            <SkipForward size={20} fill="white" />
          </button>
        </div>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function SearchSheet() {
  const [q, setQ] = useState('');
  const setOverlay = useOS((s) => s.setOverlay);
  const items = useLaunchables();
  const results = searchLaunchables(items, q);
  return (
    <div className="absolute inset-x-0 top-0 z-[9500] flex animate-fade-in flex-col bg-black/70 px-4 pt-10 backdrop-blur-2xl" style={{ bottom: MOBILE_NAV_H }} data-nav-scope data-nav-priority="30">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-2xl bg-white/15 px-3 py-2.5">
          <Search size={16} className="text-white/60" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/50" />
        </div>
        <button className="text-[15px] text-os-accent" onClick={() => setOverlay('none')}>
          Cancel
        </button>
      </div>
      <div className="mt-6 grid grid-cols-4 gap-y-5 overflow-y-auto">
        {results.map((a) => (
          <LauncherIcon key={a.key} app={a} />
        ))}
      </div>
    </div>
  );
}
