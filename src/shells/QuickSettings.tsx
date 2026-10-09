/** Quick settings panel shared by Desktop (tray flyout) and Mobile (control center). Real OS controls when available. */
import { Wifi, WifiOff, Bluetooth, Plane, Moon, BellOff, Accessibility, Sun, Volume2, VolumeX, Settings, Monitor, Smartphone, Tv, Zap, BatteryCharging, Battery, Play, Pause, SkipForward, SkipBack, Lock, Power } from 'lucide-react';
import { useOS } from '../store/useOS';
import { Slider } from '../components/ui';
import { cx } from '../lib/hooks';
import { formatDuration, hasRealOs, sysActions, useSystem } from '../lib/system';
import { isSession } from '../lib/bridge';
import { launch } from '../session/launcher';
import { useTrayStatus } from './desktop/Taskbar';
import type { ModeLock } from '../types';

export function QuickSettings({ compact = false }: { compact?: boolean }) {
  const settings = useOS((s) => s.settings);
  const update = useOS((s) => s.updateSettings);
  const modeLock = useOS((s) => s.modeLock);
  const setModeLock = useOS((s) => s.setModeLock);
  const net = useSystem((s) => s.network);
  const bt = useSystem((s) => s.bluetooth);
  const vol = useSystem((s) => s.volume);
  const bright = useSystem((s) => s.brightness);
  const realBattery = useSystem((s) => s.battery);
  const players = useSystem((s) => s.media);
  const tray = useTrayStatus();

  const wifiOn = net.available ? !!net.wifiEnabled : settings.wifi && !settings.airplane;
  const btOn = bt.available ? bt.powered : settings.bluetooth && !settings.airplane;
  const airplane = net.available ? !net.wifiEnabled && !btOn : settings.airplane;

  const tiles = [
    {
      label: 'Wi-Fi',
      sub: net.available ? (net.wifi?.ssid ?? (wifiOn ? 'Not connected' : 'Off')) : settings.wifi ? 'Simulated' : 'Off',
      on: wifiOn,
      icon: wifiOn ? Wifi : WifiOff,
      toggle: () => (net.available ? sysActions.setWifi(!wifiOn) : update({ wifi: !settings.wifi })),
    },
    {
      label: 'Bluetooth',
      sub: bt.available ? (btOn ? `${bt.devices.filter((d) => d.connected).length} connected` : 'Off') : settings.bluetooth ? 'Simulated' : 'Off',
      on: btOn,
      icon: Bluetooth,
      toggle: () => (bt.available ? sysActions.setBluetooth(!btOn) : update({ bluetooth: !settings.bluetooth })),
    },
    {
      label: 'Airplane',
      sub: airplane ? 'On' : 'Off',
      on: airplane,
      icon: Plane,
      toggle: () => {
        if (net.available) {
          void sysActions.setWifi(airplane);
          if (bt.available) void sysActions.setBluetooth(airplane);
        } else update({ airplane: !settings.airplane });
      },
    },
    { label: 'Night light', sub: settings.nightLight ? 'On' : 'Off', on: settings.nightLight, icon: Moon, toggle: () => update({ nightLight: !settings.nightLight }) },
    { label: 'Focus', sub: settings.doNotDisturb ? 'Silenced' : 'Off', on: settings.doNotDisturb, icon: BellOff, toggle: () => update({ doNotDisturb: !settings.doNotDisturb }) },
    { label: 'Reduce motion', sub: settings.reduceMotion ? 'On' : 'Off', on: settings.reduceMotion, icon: Accessibility, toggle: () => update({ reduceMotion: !settings.reduceMotion }) },
  ];

  const modes: { id: ModeLock; label: string; icon: typeof Monitor }[] = [
    { id: 'auto', label: 'Auto', icon: Zap },
    { id: 'desktop', label: 'Desktop', icon: Monitor },
    { id: 'mobile', label: 'Mobile', icon: Smartphone },
    { id: 'tv', label: 'TV', icon: Tv },
  ];

  const volume = vol.available ? vol.level : settings.volume;
  const brightness = bright.available ? bright.level : settings.brightness;
  const player = players[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={() => void t.toggle()}
            className={cx('flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition active:scale-95', t.on ? 'bg-os-accent text-black' : 'bg-white/[.07] text-white hover:bg-white/[.12]')}
          >
            <t.icon size={18} />
            <div className="w-full min-w-0">
              <div className="truncate text-[12px] font-semibold">{t.label}</div>
              {!compact && <div className={cx('truncate text-[10px]', t.on ? 'text-black/60' : 'text-white/45')}>{t.sub}</div>}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-white/[.05] p-3">
        <label className="flex items-center gap-3">
          <Sun size={16} className="text-white/60" />
          <Slider label="Brightness" min={bright.available ? 1 : 20} value={brightness} onChange={(v) => (bright.available ? void sysActions.setBrightness(v) : update({ brightness: v }))} />
        </label>
        <label className="flex items-center gap-3">
          <button onClick={() => (vol.available ? void sysActions.toggleMute() : update({ volume: settings.volume ? 0 : 70 }))} aria-label="Mute" className="text-white/60 hover:text-white">
            {(vol.available ? vol.muted : volume === 0) ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <Slider label="Volume" value={volume} onChange={(v) => (vol.available ? void sysActions.setVolume(v) : update({ volume: v }))} />
        </label>
      </div>

      {player && (
        <div className="flex items-center gap-3 rounded-2xl bg-white/[.05] p-3">
          {player.artUrl ? (
            <img src={player.artUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-os-accent to-pink-500 text-black">
              <Play size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{player.title || player.identity}</div>
            <div className="truncate text-[11px] text-white/50">{player.artist || player.identity}</div>
          </div>
          <button className="p-1.5 text-white/80 hover:text-white disabled:opacity-30" disabled={!player.canGoPrevious} onClick={() => void sysActions.media('previous', player.id)} aria-label="Previous">
            <SkipBack size={16} />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-full bg-white text-black" onClick={() => void sysActions.media('playpause', player.id)} aria-label="Play/Pause">
            {player.status === 'Playing' ? <Pause size={15} /> : <Play size={15} className="translate-x-[1px]" />}
          </button>
          <button className="p-1.5 text-white/80 hover:text-white disabled:opacity-30" disabled={!player.canGoNext} onClick={() => void sysActions.media('next', player.id)} aria-label="Next">
            <SkipForward size={16} />
          </button>
        </div>
      )}

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Environment</div>
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[.05] p-1">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setModeLock(m.id)}
              className={cx('flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition', modeLock === m.id ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/[.06] hover:text-white/80')}
            >
              <m.icon size={16} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-white/55">
        <div className="flex items-center gap-2">
          {tray.battery.present ? (
            <>
              {tray.battery.charging ? <BatteryCharging size={16} /> : <Battery size={16} />}
              {Math.round(tray.battery.level * 100)}%
              {realBattery.available && !realBattery.charging && realBattery.timeToEmpty ? ` · ${formatDuration(realBattery.timeToEmpty)} left` : tray.battery.charging ? ' · Charging' : ''}
            </>
          ) : (
            <span>{hasRealOs ? 'AC power' : ''}</span>
          )}
        </div>
        <div className="flex items-center">
          {isSession && (
            <>
              <button className="rounded-full p-2 hover:bg-white/10" onClick={() => void sysActions.power('lock')} aria-label="Lock" title="Lock">
                <Lock size={16} />
              </button>
              <button className="rounded-full p-2 hover:bg-white/10" onClick={() => useOS.getState().setOverlay('start')} aria-label="Power" title="Power options">
                <Power size={16} />
              </button>
            </>
          )}
          <button className="rounded-full p-2 hover:bg-white/10" onClick={() => launch('settings')} aria-label="Open settings">
            <Settings size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
