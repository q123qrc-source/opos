/**
 * OPOS Settings — one declarative settings model, three presentations:
 *  TV:      fullscreen vertical list with oversized toggles, left/right to change values.
 *  Mobile:  iOS-style grouped lists with drill-down navigation.
 *  Desktop: two-pane window (sidebar + detail).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Wifi,
  Monitor,
  Volume2,
  Layers,
  Palette,
  ShieldCheck,
  UserCircle2,
  Info,
  ChevronRight,
  ChevronLeft,
  Search,
  type LucideIcon,
} from 'lucide-react';
import type { AppProps, ModeLock, Settings as SettingsT } from '../../types';
import { useOS } from '../../store/useOS';
import { ACCENTS, WALLPAPERS } from '../../lib/theme';
import { bridge, isElectron, type DrmStatus } from '../../lib/bridge';
import { useFs } from '../../lib/vfs';
import { Slider, Toggle } from '../../components/ui';
import { useBackHandler } from '../../lib/backStack';
import { cx } from '../../lib/hooks';

type Item =
  | { kind: 'toggle'; id: string; label: string; desc?: string; value: boolean; set: (v: boolean) => void }
  | { kind: 'slider'; id: string; label: string; desc?: string; value: number; min: number; max: number; step?: number; unit?: string; set: (v: number) => void }
  | { kind: 'choice'; id: string; label: string; desc?: string; value: string; options: { value: string; label: string; swatch?: string }[]; set: (v: string) => void }
  | { kind: 'text'; id: string; label: string; value: string; set: (v: string) => void }
  | { kind: 'info'; id: string; label: string; value: string }
  | { kind: 'action'; id: string; label: string; desc?: string; danger?: boolean; run: () => void };

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  color: string;
  summary: string;
  items: Item[];
}

function useSettingsModel(): Section[] {
  const s = useOS((st) => st.settings);
  const update = useOS((st) => st.updateSettings);
  const modeLock = useOS((st) => st.modeLock);
  const mode = useOS((st) => st.mode);
  const setModeLock = useOS((st) => st.setModeLock);
  const [drm, setDrm] = useState<DrmStatus | null>(null);
  useEffect(() => {
    bridge.drm.status().then(setDrm).catch(() => setDrm(null));
  }, []);

  return useMemo(() => {
    const set = <K extends keyof SettingsT>(k: K) => (v: SettingsT[K]) => update({ [k]: v } as Partial<SettingsT>);
    return [
      {
        id: 'network',
        title: 'Network',
        icon: Wifi,
        color: '#3b82f6',
        summary: s.airplane ? 'Airplane mode' : s.wifi ? 'Connected · OPOS-5G' : 'Wi-Fi off',
        items: [
          { kind: 'toggle', id: 'wifi', label: 'Wi-Fi', desc: s.wifi ? 'Connected to OPOS-5G · 866 Mbps' : 'Off', value: s.wifi, set: set('wifi') },
          { kind: 'toggle', id: 'bt', label: 'Bluetooth', desc: s.bluetooth ? 'OPOS Remote, Wireless Controller' : 'Off', value: s.bluetooth, set: set('bluetooth') },
          { kind: 'toggle', id: 'air', label: 'Airplane mode', desc: 'Disables all wireless radios', value: s.airplane, set: set('airplane') },
          { kind: 'info', id: 'ip', label: 'IP address', value: s.wifi && !s.airplane ? '192.168.1.42' : '—' },
          { kind: 'info', id: 'online', label: 'Internet', value: navigator.onLine ? 'Online' : 'Offline' },
        ],
      },
      {
        id: 'display',
        title: 'Display',
        icon: Monitor,
        color: '#8b5cf6',
        summary: `${s.resolution === 'auto' ? 'Auto' : s.resolution} · ${s.brightness}%`,
        items: [
          { kind: 'slider', id: 'brightness', label: 'Brightness', value: s.brightness, min: 20, max: 100, unit: '%', set: set('brightness') },
          { kind: 'choice', id: 'res', label: 'Resolution', value: s.resolution, options: ['auto', '720p', '1080p', '1440p', '4k'].map((v) => ({ value: v, label: v === 'auto' ? 'Automatic' : v.toUpperCase() })), set: (v) => update({ resolution: v as SettingsT['resolution'] }) },
          { kind: 'toggle', id: 'hdr', label: 'HDR', desc: 'High dynamic range for supported content', value: s.hdr, set: set('hdr') },
          { kind: 'toggle', id: 'night', label: 'Night light', desc: 'Warmer colors to reduce blue light', value: s.nightLight, set: set('nightLight') },
          { kind: 'slider', id: 'scale', label: 'UI scale', value: s.uiScale, min: 80, max: 140, step: 5, unit: '%', set: set('uiScale') },
          { kind: 'toggle', id: 'motion', label: 'Reduce motion', value: s.reduceMotion, set: set('reduceMotion') },
          { kind: 'info', id: 'viewport', label: 'Viewport', value: `${window.innerWidth} × ${window.innerHeight} @${window.devicePixelRatio}x` },
        ],
      },
      {
        id: 'sound',
        title: 'Sound',
        icon: Volume2,
        color: '#ec4899',
        summary: `Volume ${s.volume}%`,
        items: [
          { kind: 'slider', id: 'volume', label: 'Volume', value: s.volume, min: 0, max: 100, unit: '%', set: set('volume') },
          { kind: 'toggle', id: 'dnd', label: 'Do not disturb', desc: 'Silence notification banners', value: s.doNotDisturb, set: set('doNotDisturb') },
          { kind: 'toggle', id: 'notif', label: 'Notifications', value: s.notifications, set: set('notifications') },
        ],
      },
      {
        id: 'convergence',
        title: 'Convergence',
        icon: Layers,
        color: '#14b8a6',
        summary: modeLock === 'auto' ? `Automatic · ${mode}` : `Locked · ${modeLock}`,
        items: [
          { kind: 'choice', id: 'lock', label: 'Environment', desc: 'Automatic follows your input device', value: modeLock, options: [{ value: 'auto', label: 'Automatic' }, { value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }, { value: 'tv', label: 'TV' }], set: (v) => setModeLock(v as ModeLock) },
          { kind: 'slider', id: 'tvkeys', label: 'TV trigger presses', desc: 'Consecutive Arrow/Enter presses that switch to TV', value: s.tvKeyThreshold, min: 2, max: 6, set: set('tvKeyThreshold') },
          { kind: 'toggle', id: 'tvfs', label: 'Fullscreen in TV mode', desc: 'Take over the whole display', value: s.tvFullscreen, set: set('tvFullscreen') },
          { kind: 'slider', id: 'saver', label: 'Screensaver after', desc: '0 disables the idle screensaver', value: s.screensaverMinutes, min: 0, max: 30, unit: ' min', set: set('screensaverMinutes') },
          { kind: 'info', id: 'current', label: 'Current mode', value: mode.toUpperCase() },
        ],
      },
      {
        id: 'personalize',
        title: 'Personalization',
        icon: Palette,
        color: '#f59e0b',
        summary: `${WALLPAPERS[s.wallpaper]?.name} · ${ACCENTS[s.accent]?.name}`,
        items: [
          { kind: 'choice', id: 'wall', label: 'Wallpaper', value: s.wallpaper, options: Object.entries(WALLPAPERS).map(([k, v]) => ({ value: k, label: v.name, swatch: v.css })), set: set('wallpaper') },
          { kind: 'choice', id: 'accent', label: 'Accent color', value: s.accent, options: Object.entries(ACCENTS).map(([k, v]) => ({ value: k, label: v.name, swatch: v.hex })), set: set('accent') },
          { kind: 'toggle', id: '24h', label: '24-hour clock', value: s.use24h, set: set('use24h') },
        ],
      },
      {
        id: 'media',
        title: 'DRM & Media',
        icon: ShieldCheck,
        color: '#22c55e',
        summary: drm ? `Widevine ${drm.status}` : 'Checking…',
        items: [
          { kind: 'info', id: 'drm-status', label: 'Widevine CDM', value: drm ? drm.status : 'Checking…' },
          { kind: 'info', id: 'drm-provider', label: 'Provider', value: drm?.provider ?? '—' },
          { kind: 'info', id: 'drm-detail', label: 'Details', value: drm?.detail || '—' },
          { kind: 'action', id: 'drm-test', label: 'Open DRM test (OPOS Cinema)', run: () => useOS.getState().launch('cinema') },
        ],
      },
      {
        id: 'account',
        title: 'Account',
        icon: UserCircle2,
        color: '#6366f1',
        summary: s.userName,
        items: [
          { kind: 'text', id: 'name', label: 'Display name', value: s.userName, set: set('userName') },
          { kind: 'action', id: 'reset-fs', label: 'Reset file system', desc: 'Restore the default documents', danger: true, run: () => useFs.getState().reset() },
          { kind: 'action', id: 'reset', label: 'Reset all settings', danger: true, run: () => { localStorage.removeItem('opos-shell'); location.reload(); } },
        ],
      },
      {
        id: 'about',
        title: 'About',
        icon: Info,
        color: '#64748b',
        summary: 'OPOS 1.0.0',
        items: [
          { kind: 'info', id: 'ver', label: 'OPOS version', value: '1.0.0 “Convergence”' },
          { kind: 'info', id: 'runtime', label: 'Runtime', value: isElectron ? `Electron ${bridge.versions.electron}` : 'Web browser preview' },
          { kind: 'info', id: 'chrome', label: 'Chromium', value: bridge.versions.chrome ?? navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '—' },
          { kind: 'info', id: 'platform', label: 'Platform', value: bridge.platform },
          { kind: 'info', id: 'cores', label: 'CPU threads', value: String(navigator.hardwareConcurrency ?? '—') },
        ],
      },
    ];
  }, [s, modeLock, mode, drm, update, setModeLock]);
}

export default function SettingsApp({ mode, pid, params }: AppProps) {
  const sections = useSettingsModel();
  const initial = (params?.section as string) ?? null;
  if (mode === 'tv') return <TVSettings sections={sections} initial={initial} pid={pid} />;
  if (mode === 'mobile') return <MobileSettings sections={sections} initial={initial} pid={pid} />;
  return <DesktopSettings sections={sections} initial={initial} />;
}

/* =============================================================== TV layout */

function TVSettings({ sections, initial, pid }: { sections: Section[]; initial: string | null; pid: string }) {
  const [openId, setOpenId] = useState<string | null>(initial);
  const open = sections.find((s) => s.id === openId);
  useBackHandler(pid, () => {
    if (openId) {
      setOpenId(null);
      return true;
    }
    return false;
  });

  return (
    <div className="flex h-full bg-gradient-to-br from-[#0b0d18] to-black text-white">
      <div className="flex w-[36%] flex-col justify-center gap-6 px-20">
        <div className="text-2xl font-semibold uppercase tracking-[0.3em] text-white/40">Settings</div>
        <div className="text-7xl font-black leading-none">{open ? open.title : 'OPOS'}</div>
        <div className="text-2xl text-white/50">{open ? open.summary : 'Use ▲ ▼ to choose, OK to toggle, ◀ ▶ to adjust.'}</div>
        {open && <open.icon size={120} strokeWidth={1.2} style={{ color: open.color }} />}
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto py-[12vh] pl-6 pr-20" key={openId ?? 'root'}>
        {!open &&
          sections.map((s, i) => (
            <button key={s.id} data-focusable data-focus-style="row" data-autofocus={i === 0 ? '' : undefined} onClick={() => setOpenId(s.id)} className="mb-4 flex w-full items-center gap-8 rounded-3xl bg-white/[.06] px-10 py-7 text-left">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl" style={{ background: s.color }}>
                <s.icon size={40} />
              </div>
              <div className="flex-1">
                <div className="text-4xl font-bold">{s.title}</div>
                <div className="mt-1 text-2xl text-white/50">{s.summary}</div>
              </div>
              <ChevronRight size={40} className="text-white/40" />
            </button>
          ))}
        {open &&
          open.items.map((item, i) => <TVItem key={item.id} item={item} first={i === 0} />)}
      </div>
    </div>
  );
}

function TVItem({ item, first }: { item: Item; first: boolean }) {
  const base = 'mb-4 flex w-full items-center gap-8 rounded-3xl bg-white/[.06] px-10 py-7 text-left';
  const label = (
    <div className="min-w-0 flex-1">
      <div className="text-4xl font-bold">{item.label}</div>
      {'desc' in item && item.desc && <div className="mt-1 truncate text-2xl text-white/50">{item.desc}</div>}
    </div>
  );
  const af = first ? '' : undefined;
  switch (item.kind) {
    case 'toggle':
      return (
        <button data-focusable data-focus-style="row" data-autofocus={af} className={base} onClick={() => item.set(!item.value)}>
          {label}
          <div className="pointer-events-none">
            <Toggle on={item.value} onChange={() => {}} size="xl" />
          </div>
        </button>
      );
    case 'slider':
    case 'choice': {
      const step = (dir: 1 | -1) => {
        if (item.kind === 'slider') item.set(Math.min(item.max, Math.max(item.min, item.value + dir * (item.step ?? Math.max(1, Math.round((item.max - item.min) / 20))))));
        else {
          const idx = item.options.findIndex((o) => o.value === item.value);
          item.set(item.options[(idx + dir + item.options.length) % item.options.length].value);
        }
      };
      return (
        <div
          role="slider"
          tabIndex={-1}
          data-focusable
          data-focus-style="row"
          data-autofocus={af}
          data-nav-capture="horizontal"
          className={base}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') step(1);
            if (e.key === 'ArrowLeft') step(-1);
          }}
          onClick={() => step(1)}
        >
          {label}
          <div className="flex w-[40%] items-center gap-6">
            <ChevronLeft size={36} className="text-white/40" />
            {item.kind === 'slider' ? (
              <div className="flex flex-1 items-center gap-4">
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-os-accent" style={{ width: `${((item.value - item.min) / (item.max - item.min)) * 100}%` }} />
                </div>
                <span className="w-28 text-right text-3xl font-semibold tabular-nums">
                  {item.value}
                  {item.unit}
                </span>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center gap-4 text-3xl font-semibold">
                {item.options.find((o) => o.value === item.value)?.swatch && (
                  <span className="h-10 w-10 rounded-full border-2 border-white/40" style={{ background: item.options.find((o) => o.value === item.value)!.swatch }} />
                )}
                {item.options.find((o) => o.value === item.value)?.label}
              </div>
            )}
            <ChevronRight size={36} className="text-white/40" />
          </div>
        </div>
      );
    }
    case 'info':
      return (
        <div data-focusable data-focus-style="row" data-autofocus={af} tabIndex={-1} className={base}>
          {label}
          <div className="max-w-[50%] truncate text-3xl text-white/60">{item.value}</div>
        </div>
      );
    case 'text':
      return (
        <div className={base}>
          {label}
          <input data-autofocus={af} className="w-[40%] rounded-2xl bg-black/40 px-6 py-3 text-3xl outline-none" value={item.value} onChange={(e) => item.set(e.target.value)} />
        </div>
      );
    case 'action':
      return (
        <button data-focusable data-focus-style="row" data-autofocus={af} className={cx(base, item.danger && 'text-red-300')} onClick={item.run}>
          {label}
          <ChevronRight size={40} className="text-white/40" />
        </button>
      );
  }
}

/* =========================================================== Mobile layout */

function MobileSettings({ sections, initial, pid }: { sections: Section[]; initial: string | null; pid: string }) {
  const [openId, setOpenId] = useState<string | null>(initial);
  const [query, setQuery] = useState('');
  const open = sections.find((s) => s.id === openId);
  useBackHandler(pid, () => {
    if (openId) {
      setOpenId(null);
      return true;
    }
    return false;
  });

  if (open) {
    return (
      <div className="flex h-full animate-fade-in flex-col bg-black text-white">
        <div className="flex items-center px-2 pb-2 pt-3">
          <button className="flex items-center text-[17px] text-os-accent" onClick={() => setOpenId(null)}>
            <ChevronLeft size={26} /> Settings
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <h1 className="mb-4 px-1 text-[32px] font-bold">{open.title}</h1>
          <div className="overflow-hidden rounded-xl bg-[#1c1c1e]">
            {open.items.map((item, i) => (
              <div key={item.id} className={cx('px-4 py-3', i > 0 && 'border-t border-white/[.08]')}>
                <MobileItem item={item} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const q = query.toLowerCase();
  const filtered = q ? sections.filter((s) => s.title.toLowerCase().includes(q) || s.items.some((i) => i.label.toLowerCase().includes(q))) : sections;
  const groups = [filtered.slice(0, 3), filtered.slice(3, 6), filtered.slice(6)].filter((g) => g.length);
  const userName = useOS.getState().settings.userName;

  return (
    <div className="h-full overflow-y-auto bg-black px-4 pb-8 text-white">
      <h1 className="px-1 pb-3 pt-6 text-[34px] font-bold">Settings</h1>
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-[#1c1c1e] px-3 py-2">
        <Search size={16} className="text-white/40" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-white/40" />
      </div>
      {!q && (
        <button className="mb-6 flex w-full items-center gap-4 rounded-xl bg-[#1c1c1e] p-4 text-left" onClick={() => setOpenId('account')}>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-os-accent to-pink-400 text-2xl font-bold text-black">{userName[0]}</div>
          <div className="flex-1">
            <div className="text-[19px] font-semibold">{userName}</div>
            <div className="text-[13px] text-white/50">OPOS Account, Cloud & Sync</div>
          </div>
          <ChevronRight size={20} className="text-white/30" />
        </button>
      )}
      {groups.map((g, gi) => (
        <div key={gi} className="mb-6 overflow-hidden rounded-xl bg-[#1c1c1e]">
          {g.map((s, i) => (
            <button key={s.id} className="flex w-full items-center gap-3 pl-4 text-left active:bg-white/10" onClick={() => setOpenId(s.id)}>
              <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px]" style={{ background: s.color }}>
                <s.icon size={18} />
              </div>
              <div className={cx('flex flex-1 items-center gap-2 py-3 pr-3', i > 0 && 'border-t border-white/[.08]')}>
                <span className="flex-1 text-[16px]">{s.title}</span>
                <span className="max-w-[45%] truncate text-[15px] text-white/45">{s.summary}</span>
                <ChevronRight size={18} className="text-white/30" />
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function MobileItem({ item }: { item: Item }) {
  switch (item.kind) {
    case 'toggle':
      return (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[16px]">{item.label}</div>
            {item.desc && <div className="text-[12px] text-white/45">{item.desc}</div>}
          </div>
          <Toggle on={item.value} onChange={item.set} label={item.label} />
        </div>
      );
    case 'slider':
      return (
        <div>
          <div className="mb-2 flex justify-between text-[16px]">
            <span>{item.label}</span>
            <span className="text-white/45">
              {item.value}
              {item.unit}
            </span>
          </div>
          <Slider value={item.value} min={item.min} max={item.max} step={item.step} onChange={item.set} label={item.label} />
        </div>
      );
    case 'choice':
      return (
        <div>
          <div className="mb-2 text-[16px]">{item.label}</div>
          <div className="flex flex-wrap gap-2">
            {item.options.map((o) => (
              <button key={o.value} onClick={() => item.set(o.value)} className={cx('flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px]', o.value === item.value ? 'bg-os-accent text-black' : 'bg-white/10 text-white/80')}>
                {o.swatch && <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: o.swatch }} />}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="flex items-center gap-3">
          <span className="text-[16px]">{item.label}</span>
          <input className="flex-1 bg-transparent text-right text-[16px] text-white/60 outline-none" value={item.value} onChange={(e) => item.set(e.target.value)} />
        </div>
      );
    case 'info':
      return (
        <div className="flex items-center gap-3">
          <span className="text-[16px]">{item.label}</span>
          <span className="ml-auto max-w-[60%] truncate text-[15px] text-white/45">{item.value}</span>
        </div>
      );
    case 'action':
      return (
        <button className={cx('w-full text-left text-[16px]', item.danger ? 'text-red-400' : 'text-os-accent')} onClick={item.run}>
          {item.label}
        </button>
      );
  }
}

/* ========================================================== Desktop layout */

function DesktopSettings({ sections, initial }: { sections: Section[]; initial: string | null }) {
  const [active, setActive] = useState(initial ?? 'network');
  const [query, setQuery] = useState('');
  const section = sections.find((s) => s.id === active) ?? sections[0];
  const q = query.toLowerCase();
  const visible = q ? sections.filter((s) => s.title.toLowerCase().includes(q) || s.items.some((i) => i.label.toLowerCase().includes(q))) : sections;

  return (
    <div className="flex h-full bg-[#0f111a] text-white">
      <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-white/5 bg-[#0b0d14] p-3">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[.06] px-3 py-1.5">
          <Search size={14} className="text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a setting" className="w-full bg-transparent text-[13px] outline-none placeholder:text-white/35" />
        </div>
        {visible.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={cx('relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition', active === s.id ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/[.05]')}
          >
            {active === s.id && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-os-accent" />}
            <s.icon size={16} style={{ color: s.color }} />
            {s.title}
          </button>
        ))}
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-8" key={section.id}>
        <div className="mb-6 flex animate-fade-in items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: section.color }}>
            <section.icon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{section.title}</h1>
            <div className="text-sm text-white/50">{section.summary}</div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {section.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/[.05] bg-white/[.035] px-5 py-3.5">
              <DesktopItem item={item} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function DesktopItem({ item }: { item: Item }) {
  const head = (
    <div className="min-w-0 flex-1">
      <div className="text-[14px]">{item.label}</div>
      {'desc' in item && item.desc && <div className="text-[12px] text-white/45">{item.desc}</div>}
    </div>
  );
  switch (item.kind) {
    case 'toggle':
      return (
        <div className="flex items-center gap-4">
          {head}
          <span className="text-xs text-white/50">{item.value ? 'On' : 'Off'}</span>
          <Toggle on={item.value} onChange={item.set} label={item.label} />
        </div>
      );
    case 'slider':
      return (
        <div className="flex items-center gap-4">
          {head}
          <div className="w-64">
            <Slider value={item.value} min={item.min} max={item.max} step={item.step} onChange={item.set} label={item.label} />
          </div>
          <span className="w-14 text-right text-xs tabular-nums text-white/60">
            {item.value}
            {item.unit}
          </span>
        </div>
      );
    case 'choice':
      return item.options.some((o) => o.swatch) ? (
        <div>
          {head}
          <div className="mt-3 flex flex-wrap gap-3">
            {item.options.map((o) => (
              <button key={o.value} onClick={() => item.set(o.value)} className="flex flex-col items-center gap-1.5">
                <span className={cx('block h-14 w-20 rounded-lg border-2 transition', o.value === item.value ? 'border-os-accent scale-105' : 'border-white/10 hover:border-white/30')} style={{ background: o.swatch }} />
                <span className="text-[11px] text-white/60">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          {head}
          <select value={item.value} onChange={(e) => item.set(e.target.value)} className="rounded-lg border border-white/10 bg-[#1a1d2b] px-3 py-1.5 text-[13px] outline-none focus:border-os-accent">
            {item.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'text':
      return (
        <div className="flex items-center gap-4">
          {head}
          <input value={item.value} onChange={(e) => item.set(e.target.value)} className="w-64 rounded-lg border border-white/10 bg-[#1a1d2b] px-3 py-1.5 text-[13px] outline-none focus:border-os-accent" />
        </div>
      );
    case 'info':
      return (
        <div className="flex items-center gap-4">
          {head}
          <span className="selectable max-w-[60%] break-all text-right font-mono text-[12px] text-white/55">{item.value}</span>
        </div>
      );
    case 'action':
      return (
        <div className="flex items-center gap-4">
          {head}
          <button onClick={item.run} className={cx('rounded-lg px-4 py-1.5 text-[13px] font-medium', item.danger ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-white/10 hover:bg-white/15')}>
            {item.danger ? 'Reset' : 'Open'}
          </button>
        </div>
      );
  }
}
