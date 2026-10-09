import { useMemo } from 'react';
import { Search, Wifi, WifiOff, Volume2, VolumeX, BatteryCharging, Battery, Minus, Square, X, Monitor, Smartphone, Tv, Zap, Bell } from 'lucide-react';
import { useOS, TASKBAR_HEIGHT } from '../../store/useOS';
import { getApp } from '../../apps/manifest';
import { AppIcon } from '../../components/AppIcon';
import { bridge, isElectron } from '../../lib/bridge';
import { useWeather } from '../../lib/weather';
import { cx, useBattery, useClock, useOnline, useTimeFormat } from '../../lib/hooks';

function StartGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <defs>
        <linearGradient id="opos-start" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--os-accent))" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="9" height="9" rx="2.5" fill="url(#opos-start)" />
      <rect x="13" y="2" width="9" height="9" rx="4.5" fill="url(#opos-start)" opacity=".85" />
      <rect x="2" y="13" width="9" height="9" rx="4.5" fill="url(#opos-start)" opacity=".85" />
      <rect x="13" y="13" width="9" height="9" rx="2.5" fill="url(#opos-start)" opacity=".7" />
    </svg>
  );
}

export function Taskbar() {
  const processes = useOS((s) => s.processes);
  const pinned = useOS((s) => s.pinned);
  const focusedPid = useOS((s) => s.focusedPid);
  const overlay = useOS((s) => s.overlay);
  const mode = useOS((s) => s.mode);
  const modeLock = useOS((s) => s.modeLock);
  const volume = useOS((s) => s.settings.volume);
  const historyCount = useOS((s) => s.history.length);
  const { launch, focus, minimize, toggleOverlay, openContextMenu, togglePin, close, goHome } = useOS.getState();
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const battery = useBattery();
  const online = useOnline();
  const weather = useWeather();

  // Pinned apps first (in pin order), then running-but-unpinned apps.
  const items = useMemo(() => {
    const running = processes.map((p) => p.appId);
    return [...pinned, ...running.filter((id, i) => !pinned.includes(id) && running.indexOf(id) === i)];
  }, [processes, pinned]);

  const onItemClick = (appId: string) => {
    const procs = processes.filter((p) => p.appId === appId);
    if (!procs.length) return launch(appId);
    const top = [...procs].sort((a, b) => b.z - a.z)[0];
    if (procs.length === 1) {
      if (top.pid === focusedPid && !top.minimized) minimize(top.pid);
      else focus(top.pid);
      return;
    }
    // Cycle through multiple windows of the same app.
    const idx = procs.findIndex((p) => p.pid === focusedPid);
    focus(procs[(idx + 1) % procs.length].pid);
  };

  const ModeIcon = modeLock === 'auto' ? Zap : { desktop: Monitor, mobile: Smartphone, tv: Tv }[mode];

  return (
    <div
      className="glass absolute inset-x-0 bottom-0 z-[9000] flex items-center border-x-0 border-b-0 px-2"
      style={{ height: TASKBAR_HEIGHT }}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Task Manager', action: () => launch('monitor') },
          { label: 'Taskbar settings', action: () => launch('settings', { section: 'personalize' }) },
          { label: '', divider: true },
          { label: 'Show desktop', action: goHome },
        ]);
      }}
    >
      {/* Left: weather-ish widget */}
      <button className="hidden shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/10 xl:flex" onClick={() => launch('weather')}>
        <span className="text-2xl leading-none">{weather.current?.emoji ?? '⛅'}</span>
        <span className="leading-tight">
          <span className="block text-[12px] font-semibold text-white">{weather.current ? `${Math.round(weather.current.temp)}°C` : '--'}</span>
          <span className="block text-[11px] text-white/50">{weather.current?.label ?? weather.city}</span>
        </span>
      </button>

      {/* Center: start, search, apps */}
      <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto px-2 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto">
        <button
          className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 active:scale-90', overlay === 'start' && 'bg-white/10')}
          onClick={() => toggleOverlay('start')}
          aria-label="Start"
        >
          <StartGlyph />
        </button>
        <button
          className="mr-1 hidden h-9 w-44 shrink-0 items-center gap-2 rounded-full bg-white/[.08] px-3 text-[13px] text-white/50 hover:bg-white/[.12] md:flex"
          onClick={() => toggleOverlay('start')}
        >
          <Search size={15} /> Search
        </button>
        {items.map((appId) => {
          const app = getApp(appId);
          if (!app) return null;
          const procs = processes.filter((p) => p.appId === appId);
          const active = procs.some((p) => p.pid === focusedPid && !p.minimized);
          return (
            <button
              key={appId}
              title={app.name}
              className={cx('group relative grid h-10 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 active:scale-90', active && 'bg-white/10')}
              onClick={() => onItemClick(appId)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openContextMenu(e.clientX, e.clientY - 10, [
                  { label: app.name, disabled: true },
                  { label: '', divider: true },
                  { label: procs.length && !app.singleInstance ? 'New window' : 'Open', action: () => launch(appId) },
                  { label: pinned.includes(appId) ? 'Unpin from taskbar' : 'Pin to taskbar', action: () => togglePin(appId) },
                  ...(procs.length
                    ? [{ label: procs.length > 1 ? 'Close all windows' : 'Close window', danger: true, action: () => procs.forEach((p) => close(p.pid)) }]
                    : []),
                ]);
              }}
            >
              <AppIcon app={app} size={26} className="transition group-hover:-translate-y-0.5" />
              {procs.length > 0 && (
                <span className={cx('absolute bottom-0.5 h-[3px] rounded-full transition-all', active ? 'w-4 bg-os-accent' : 'w-1.5 bg-white/50')} />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: system tray */}
      <div className="flex h-full shrink-0 items-center gap-0.5">
        <button
          className={cx('flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-white/85 hover:bg-white/10', overlay === 'quick' && 'bg-white/10')}
          onClick={() => toggleOverlay('quick')}
          aria-label="Quick settings"
        >
          <ModeIcon size={15} className="text-os-accent" />
          {online ? <Wifi size={16} /> : <WifiOff size={16} className="text-white/40" />}
          {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {battery.charging ? <BatteryCharging size={17} /> : <Battery size={17} />}
        </button>
        <button
          className={cx('relative flex h-10 flex-col items-end justify-center rounded-lg px-2.5 text-right leading-tight hover:bg-white/10', overlay === 'notifications' && 'bg-white/10')}
          onClick={() => toggleOverlay('notifications')}
        >
          <span className="text-[12px] text-white/90">{fmt(now)}</span>
          <span className="text-[11px] text-white/55">{now.toLocaleDateString()}</span>
          {historyCount > 0 && <Bell size={9} className="absolute right-0.5 top-1 text-os-accent" />}
        </button>
        {isElectron && (
          <div className="ml-1 flex h-full items-center border-l border-white/10 pl-1">
            <button className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/10" onClick={() => bridge.window.minimize()} aria-label="Minimize shell">
              <Minus size={14} />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/10" onClick={() => bridge.window.maximize()} aria-label="Maximize shell">
              <Square size={11} />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-red-600 hover:text-white" onClick={() => bridge.window.close()} aria-label="Quit shell">
              <X size={15} />
            </button>
          </div>
        )}
        <button className="ml-1 h-full w-1.5 border-l border-white/10 hover:bg-white/20" onClick={goHome} title="Show desktop" aria-label="Show desktop" />
      </div>
    </div>
  );
}
