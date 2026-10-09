/**
 * TV environment — the 10-foot UI. Cinematic hero driven by the focused tile, horizontal carousels,
 * massive typography and strict D-pad spatial navigation (see engine/spatialNav.ts).
 */
import { useMemo, useState } from 'react';
import { Settings, Power, Play, Music2 } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { APPS, TV_ROWS } from '../../apps/manifest';
import { launch, LaunchableIcon, useLaunchables, useRunningGroups, focusWindow, type Launchable } from '../../session/launcher';
import { useAudio, TRACKS } from '../../lib/audioEngine';
import { useWeather } from '../../lib/weather';
import { cx, useClock, useTimeFormat } from '../../lib/hooks';

/** Accent colour for any launchable (OPOS apps have one; native apps get a stable hashed hue). */
function accentOf(l: Launchable) {
  if (l.opos) return l.opos.accent;
  const hue = [...l.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11);
  return `hsl(${hue} 70% 55%)`;
}

export function TVShell() {
  const userName = useOS((s) => s.settings.userName);
  const items = useLaunchables();
  const running = useRunningGroups();
  const [heroKey, setHeroKey] = useState('cinema');
  const hero = items.find((i) => i.key === heroKey) ?? items[0];
  const heroAccent = accentOf(hero);
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const weather = useWeather();
  const { playing, index } = useAudio();

  const rows = useMemo(() => {
    const byKey = (k: string) => items.find((i) => i.key === k);
    const continueRow = running.map((g) => g.item).filter(Boolean) as Launchable[];
    const natives = items.filter((i) => i.kind === 'native');
    const nativeMedia = natives.filter((i) => i.category === 'games' || i.category === 'media');
    const nativeOther = natives.filter((i) => !nativeMedia.includes(i));
    return [
      ...(continueRow.length ? [{ id: 'continue', title: 'Continue', apps: continueRow }] : []),
      ...TV_ROWS.map((r) => ({ id: r.id, title: r.title, apps: APPS.filter((a) => a.tvRow === r.id).map((a) => byKey(a.id)!) })),
      ...(nativeMedia.length ? [{ id: 'native-media', title: 'Games & Media', apps: nativeMedia }] : []),
      ...(nativeOther.length ? [{ id: 'native', title: 'Installed apps', apps: nativeOther }] : []),
      { id: 'mobile', title: 'Apps from your phone', apps: APPS.filter((a) => a.category === 'mobile').map((a) => byKey(a.id)!) },
      { id: 'desktop', title: 'Productivity', apps: APPS.filter((a) => a.category === 'desktop').map((a) => byKey(a.id)!) },
    ];
  }, [items, running]);

  const runningGroup = running.find((g) => g.key === hero.key);
  const isRunning = !!runningGroup;
  const open = (l: Launchable) => {
    const g = running.find((x) => x.key === l.key);
    if (g?.windows[0]) focusWindow(g.windows[0].id);
    else launch(l);
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-black text-white" data-nav-scope data-nav-priority="0">
      {/* Cinematic backdrop */}
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(ellipse at 75% 20%, color-mix(in srgb, ${heroAccent} 33%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, color-mix(in srgb, ${heroAccent} 13%, transparent) 0%, transparent 50%), #050507` }} />
      <div className="pointer-events-none absolute right-[6%] top-[8%] animate-fade-in opacity-25 blur-[2px] transition-all duration-700" key={hero.key}>
        {hero.opos ? <hero.opos.icon size={460} strokeWidth={0.6} style={{ color: heroAccent }} /> : <LaunchableIcon item={hero} size={380} />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/80 to-transparent" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-6 px-16 pt-10">
        <div className="text-3xl font-black tracking-tight">
          OPOS<span className="text-os-accent">.</span>
          <span className="ml-3 align-middle text-base font-semibold tracking-[0.35em] text-white/40">TV</span>
        </div>
        <div className="ml-auto flex items-center gap-8">
          {playing && (
            <button data-focusable className="flex items-center gap-3 rounded-full bg-white/10 px-5 py-2 text-lg" onClick={() => launch('music')}>
              <Music2 size={22} className="text-emerald-300" /> {TRACKS[index].title}
            </button>
          )}
          <div className="text-right text-xl text-white/70">
            {weather.current ? `${weather.current.emoji} ${Math.round(weather.current.temp)}°` : ''}
          </div>
          <div className="text-4xl font-light tabular-nums">{fmt(now)}</div>
          <button data-focusable className="grid h-14 w-14 place-items-center rounded-full bg-white/10" onClick={() => launch('settings')} aria-label="Settings">
            <Settings size={28} />
          </button>
          <button data-focusable className="grid h-14 w-14 place-items-center rounded-full bg-white/10" onClick={() => launch('screensaver')} aria-label="Sleep">
            <Power size={26} />
          </button>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-os-accent to-pink-500 text-2xl font-bold text-black">{userName[0]}</div>
        </div>
      </div>

      {/* Hero */}
      <div className="relative z-10 px-16 pt-[4vh]" key={`hero-${hero.key}`}>
        <div className="mb-3 animate-fade-in text-lg font-semibold uppercase tracking-[0.3em]" style={{ color: heroAccent }}>
          {hero.kind === 'native' ? 'Installed app' : hero.category === 'tv' ? 'Featured' : hero.category === 'system' ? 'System' : 'App'}
          {isRunning && <span className="ml-4 rounded-full bg-white/15 px-3 py-1 text-sm tracking-widest text-white">RUNNING</span>}
        </div>
        <h1 className="max-w-[60vw] animate-slide-up text-[clamp(3rem,6.5vw,7rem)] font-black leading-[0.95] tracking-tight [text-shadow:0_8px_40px_rgba(0,0,0,.6)]">{hero.name}</h1>
        <p className="mt-5 max-w-[45vw] animate-fade-in text-[clamp(1.1rem,1.6vw,1.75rem)] leading-snug text-white/70">{hero.description}</p>
        <div className="mt-6 flex items-center gap-3 text-lg text-white/60">
          <span className="flex items-center gap-2 rounded-lg bg-white px-5 py-2 font-bold text-black">
            <Play size={20} fill="black" /> OK
          </span>
          to {isRunning ? 'resume' : 'open'}
        </div>
      </div>

      {/* Carousels */}
      <div className="no-scrollbar absolute inset-x-0 bottom-0 top-[50vh] z-10 overflow-y-auto pb-24">
        {rows.map((row, ri) => (
          <section key={row.id} className="mb-2">
            <h2 className="px-16 text-2xl font-bold text-white/90">{row.title}</h2>
            <div className="no-scrollbar flex gap-8 overflow-x-auto px-16 py-7" data-nav-group={row.id}>
              {row.apps.map((app, i) => (
                <Tile key={app.key} app={app} autoFocus={ri === 0 && i === 0} onFocus={() => setHeroKey(app.key)} onOpen={() => open(app)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Remote hint bar */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-10 bg-gradient-to-t from-black to-transparent px-16 pb-6 pt-10 text-lg text-white/45">
        <Hint k="◀ ▲ ▼ ▶">Navigate</Hint>
        <Hint k="OK">Select</Hint>
        <Hint k="BACK">Return</Hint>
        <Hint k="⏯">Media</Hint>
        <span className="ml-auto text-base">Move the mouse for Desktop · Touch for Mobile</span>
      </div>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span className="rounded-md border border-white/25 px-2.5 py-0.5 text-base font-semibold text-white/70">{k}</span>
      {children}
    </span>
  );
}

function Tile({ app, onFocus, onOpen, autoFocus }: { app: Launchable; onFocus: () => void; onOpen: () => void; autoFocus?: boolean }) {
  const accent = accentOf(app);
  return (
    <button
      data-focusable="tile"
      data-autofocus={autoFocus ? '' : undefined}
      onFocus={onFocus}
      onClick={onOpen}
      className={cx('group relative flex h-[clamp(9rem,13vw,13.5rem)] w-[clamp(16rem,23vw,24rem)] shrink-0 flex-col justify-end overflow-hidden rounded-3xl p-6 text-left')}
      style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 80%, transparent) 0%, #15151c 75%)` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,.22),transparent_45%)]" />
      <div className="absolute right-5 top-5 drop-shadow-xl">
        {app.opos ? <app.opos.icon className="text-white/90" size={64} strokeWidth={1.5} /> : <LaunchableIcon item={app} size={68} />}
      </div>
      <div className="relative text-[clamp(1.25rem,1.6vw,1.9rem)] font-extrabold leading-tight text-white drop-shadow">{app.name}</div>
      <div className="relative mt-1 line-clamp-1 text-base text-white/70">{app.description || (app.kind === 'native' ? 'Installed application' : '')}</div>
    </button>
  );
}
