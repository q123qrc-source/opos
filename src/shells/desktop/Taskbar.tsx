import { useMemo } from 'react';
import { Search, Wifi, WifiOff, Volume2, VolumeX, BatteryCharging, Battery, Minus, Square, X, Monitor, Smartphone, Tv, Zap, Bell, Network } from 'lucide-react';
import { useOS, TASKBAR_HEIGHT } from '../../store/useOS';
import { bridge, isElectron, isSession } from '../../lib/bridge';
import { useWeather } from '../../lib/weather';
import { useSystem } from '../../lib/system';
import { cx, useBattery, useClock, useOnline, useTimeFormat } from '../../lib/hooks';
import { activateGroup, closeWindow, findLaunchable, focusWindow, launch, LaunchableIcon, NativeIcon, useRunningGroups } from '../../session/launcher';

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

/** Tray status that prefers real system services (UPower / NetworkManager / PipeWire) when present. */
export function useTrayStatus() {
  const realBattery = useSystem((s) => s.battery);
  const net = useSystem((s) => s.network);
  const vol = useSystem((s) => s.volume);
  const webBattery = useBattery();
  const webOnline = useOnline();
  const settingsVolume = useOS((s) => s.settings.volume);
  return {
    // In Electron, Chromium's Battery API is a stub (always 100 %): trust UPower only.
    battery: realBattery.available
      ? { level: (realBattery.level ?? 0) / 100, charging: !!realBattery.charging, present: true }
      : { level: webBattery.level, charging: webBattery.charging, present: !isElectron },
    network: net.available
      ? { online: !!net.online, kind: net.primaryType === 'wired' ? 'wired' : net.wifi || net.primaryType === 'wifi' ? 'wifi' : net.online ? 'wired' : 'offline', label: net.wifi?.ssid ?? net.primaryName ?? '' }
      : { online: webOnline, kind: webOnline ? 'wifi' : 'offline', label: '' },
    volume: vol.available ? { level: vol.level, muted: vol.muted } : { level: settingsVolume, muted: settingsVolume === 0 },
  };
}

export function Taskbar() {
  const pinned = useOS((s) => s.pinned);
  const installed = useOS((s) => s.installedApps);
  const overlay = useOS((s) => s.overlay);
  const mode = useOS((s) => s.mode);
  const modeLock = useOS((s) => s.modeLock);
  const historyCount = useOS((s) => s.history.length);
  const { toggleOverlay, openContextMenu, togglePin, goHome } = useOS.getState();
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const weather = useWeather();
  const tray = useTrayStatus();
  const groups = useRunningGroups();

  // Pinned apps first (in pin order), then running-but-unpinned apps.
  const items = useMemo(() => {
    const keys = [...pinned, ...groups.map((g) => g.key).filter((k) => !pinned.includes(k))];
    return keys
      .map((key) => {
        const group = groups.find((g) => g.key === key);
        const item = group?.item ?? findLaunchable(key, installed);
        return item || group ? { key, item, group, name: item?.name ?? group!.name } : null;
      })
      .filter(Boolean) as { key: string; item: ReturnType<typeof findLaunchable>; group: ReturnType<typeof useRunningGroups>[number] | undefined; name: string }[];
  }, [pinned, groups, installed]);

  const ModeIcon = modeLock === 'auto' ? Zap : { desktop: Monitor, mobile: Smartphone, tv: Tv }[mode];
  const NetIcon = tray.network.kind === 'wired' ? Network : tray.network.online ? Wifi : WifiOff;

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
      {/* Left: weather widget */}
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
        <button className="mr-1 hidden h-9 w-44 shrink-0 items-center gap-2 rounded-full bg-white/[.08] px-3 text-[13px] text-white/50 hover:bg-white/[.12] md:flex" onClick={() => toggleOverlay('start')}>
          <Search size={15} /> Search
        </button>
        {items.map(({ key, item, group, name }) => {
          const running = !!group?.windows.length;
          const active = !!group?.active;
          return (
            <button
              key={key}
              title={group?.windows.length === 1 ? group.windows[0].title : name}
              className={cx('group relative grid h-10 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 active:scale-90', active && 'bg-white/10')}
              onClick={() => activateGroup(key, group)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openContextMenu(e.clientX, e.clientY - 10, [
                  { label: name, disabled: true },
                  ...(group?.windows.length ? group.windows.map((w) => ({ label: `↳ ${w.title}`, action: () => focusWindow(w.id) })) : []),
                  { label: '', divider: true },
                  { label: running ? 'New window' : 'Open', action: () => launch(key) },
                  { label: pinned.includes(key) ? 'Unpin from taskbar' : 'Pin to taskbar', action: () => togglePin(key) },
                  ...(group?.windows.length ? [{ label: group.windows.length > 1 ? 'Close all windows' : 'Close window', danger: true, action: () => group.windows.forEach((w) => closeWindow(w.id)) }] : []),
                ]);
              }}
            >
              <div className="transition group-hover:-translate-y-0.5">{item ? <LaunchableIcon item={item} size={26} /> : <NativeIcon src={null} name={name} size={26} />}</div>
              {running && <span className={cx('absolute bottom-0.5 h-[3px] rounded-full transition-all', active ? 'w-4 bg-os-accent' : 'w-1.5 bg-white/50')} />}
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
          title={tray.network.label || undefined}
        >
          <ModeIcon size={15} className="text-os-accent" />
          <NetIcon size={16} className={tray.network.online ? '' : 'text-white/40'} />
          {tray.volume.muted || tray.volume.level === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {tray.battery.present && (
            <span className="flex items-center gap-1 text-[12px]">
              {tray.battery.charging ? <BatteryCharging size={17} /> : <Battery size={17} />}
              {isSession && `${Math.round(tray.battery.level * 100)}%`}
            </span>
          )}
        </button>
        <button
          className={cx('relative flex h-10 flex-col items-end justify-center rounded-lg px-2.5 text-right leading-tight hover:bg-white/10', overlay === 'notifications' && 'bg-white/10')}
          onClick={() => toggleOverlay('notifications')}
        >
          <span className="text-[12px] text-white/90">{fmt(now)}</span>
          <span className="text-[11px] text-white/55">{now.toLocaleDateString()}</span>
          {historyCount > 0 && <Bell size={9} className="absolute right-0.5 top-1 text-os-accent" />}
        </button>
        {isElectron && !isSession && (
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
