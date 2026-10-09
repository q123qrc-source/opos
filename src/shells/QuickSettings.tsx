/** Quick settings panel shared by Desktop (tray flyout) and Mobile (control center). */
import { Wifi, WifiOff, Bluetooth, Plane, Moon, BellOff, Accessibility, Sun, Volume2, Settings, Monitor, Smartphone, Tv, Zap, BatteryCharging, Battery } from 'lucide-react';
import { useOS } from '../store/useOS';
import { Slider } from '../components/ui';
import { cx, useBattery } from '../lib/hooks';
import type { ModeLock } from '../types';

export function QuickSettings({ compact = false }: { compact?: boolean }) {
  const settings = useOS((s) => s.settings);
  const update = useOS((s) => s.updateSettings);
  const modeLock = useOS((s) => s.modeLock);
  const setModeLock = useOS((s) => s.setModeLock);
  const launch = useOS((s) => s.launch);
  const battery = useBattery();

  const tiles = [
    { label: settings.wifi ? 'Wi-Fi' : 'Wi-Fi off', sub: settings.wifi ? 'OPOS-5G' : 'Disconnected', on: settings.wifi && !settings.airplane, icon: settings.wifi ? Wifi : WifiOff, toggle: () => update({ wifi: !settings.wifi }) },
    { label: 'Bluetooth', sub: settings.bluetooth ? '2 devices' : 'Off', on: settings.bluetooth && !settings.airplane, icon: Bluetooth, toggle: () => update({ bluetooth: !settings.bluetooth }) },
    { label: 'Airplane', sub: settings.airplane ? 'On' : 'Off', on: settings.airplane, icon: Plane, toggle: () => update({ airplane: !settings.airplane }) },
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={t.toggle}
            className={cx(
              'flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition active:scale-95',
              t.on ? 'bg-os-accent text-black' : 'bg-white/[.07] text-white hover:bg-white/[.12]',
            )}
          >
            <t.icon size={18} />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{t.label}</div>
              {!compact && <div className={cx('truncate text-[10px]', t.on ? 'text-black/60' : 'text-white/45')}>{t.sub}</div>}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-white/[.05] p-3">
        <label className="flex items-center gap-3">
          <Sun size={16} className="text-white/60" />
          <Slider label="Brightness" min={20} value={settings.brightness} onChange={(v) => update({ brightness: v })} />
        </label>
        <label className="flex items-center gap-3">
          <Volume2 size={16} className="text-white/60" />
          <Slider label="Volume" value={settings.volume} onChange={(v) => update({ volume: v })} />
        </label>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Environment</div>
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[.05] p-1">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setModeLock(m.id)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition',
                modeLock === m.id ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/[.06] hover:text-white/80',
              )}
            >
              <m.icon size={16} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-white/55">
        <div className="flex items-center gap-2">
          {battery.charging ? <BatteryCharging size={16} /> : <Battery size={16} />}
          {Math.round(battery.level * 100)}% {battery.charging ? '· Charging' : ''}
        </div>
        <button className="rounded-full p-2 hover:bg-white/10" onClick={() => launch('settings')} aria-label="Open settings">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
