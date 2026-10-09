/**
 * TV environment — the 10-foot UI. Cinematic hero driven by the focused tile, horizontal carousels,
 * massive typography and strict D-pad spatial navigation (see engine/spatialNav.ts).
 */
import { useMemo, useState } from 'react';
import { Settings, Power, Play, Music2 } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { APPS, TV_ROWS, getApp } from '../../apps/manifest';
import { useAudio, TRACKS } from '../../lib/audioEngine';
import { useWeather } from '../../lib/weather';
import { cx, useClock, useTimeFormat } from '../../lib/hooks';
import type { AppDefinition } from '../../types';

export function TVShell() {
  const processes = useOS((s) => s.processes);
  const userName = useOS((s) => s.settings.userName);
  const launch = useOS((s) => s.launch);
  const [heroId, setHeroId] = useState('cinema');
  const hero = getApp(heroId)!;
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const weather = useWeather();
  const { playing, index } = useAudio();

  const rows = useMemo(() => {
    const running = [...new Set(processes.map((p) => p.appId))].map((id) => getApp(id)!).filter((a) => a.launch !== 'overlay');
    return [
      ...(running.length ? [{ id: 'continue', title: 'Continue', apps: running }] : []),
      ...TV_ROWS.map((r) => ({ id: r.id, title: r.title, apps: APPS.filter((a) => a.tvRow === r.id) })),
      { id: 'mobile', title: 'Apps from your phone', apps: APPS.filter((a) => a.category === 'mobile') },
      { id: 'desktop', title: 'Productivity', apps: APPS.filter((a) => a.category === 'desktop') },
    ];
  }, [processes]);

  const isRunning = processes.some((p) => p.appId === heroId);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black text-white" data-nav-scope data-nav-priority="0">
      {/* Cinematic backdrop */}
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(ellipse at 75% 20%, ${hero.accent}55 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, ${hero.accent}22 0%, transparent 50%), #050507` }} />
      <div className="pointer-events-none absolute right-[6%] top-[8%] opacity-25 blur-[2px] transition-all duration-700" key={hero.id}>
        <hero.icon size={460} strokeWidth={0.6} style={{ color: hero.accent }} className="animate-fade-in" />
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
      <div className="relative z-10 px-16 pt-[4vh]" key={`hero-${hero.id}`}>
        <div className="mb-3 animate-fade-in text-lg font-semibold uppercase tracking-[0.3em]" style={{ color: hero.accent }}>
          {hero.category === 'tv' ? 'Featured' : hero.category === 'system' ? 'System' : 'App'}
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
                <Tile key={app.id} app={app} autoFocus={ri === 0 && i === 0} onFocus={() => setHeroId(app.id)} onOpen={() => launch(app.id)} />
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

function Tile({ app, onFocus, onOpen, autoFocus }: { app: AppDefinition; onFocus: () => void; onOpen: () => void; autoFocus?: boolean }) {
  return (
    <button
      data-focusable="tile"
      data-autofocus={autoFocus ? '' : undefined}
      onFocus={onFocus}
      onClick={onOpen}
      className={cx('group relative flex h-[clamp(9rem,13vw,13.5rem)] w-[clamp(16rem,23vw,24rem)] shrink-0 flex-col justify-end overflow-hidden rounded-3xl p-6 text-left')}
      style={{ background: `linear-gradient(145deg, ${app.accent}cc 0%, #15151c 75%)` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,.22),transparent_45%)]" />
      <app.icon className="absolute right-5 top-5 text-white/90 drop-shadow-xl" size={64} strokeWidth={1.5} />
      <div className="relative text-[clamp(1.25rem,1.6vw,1.9rem)] font-extrabold leading-tight text-white drop-shadow">{app.name}</div>
      <div className="relative mt-1 line-clamp-1 text-base text-white/70">{app.description}</div>
    </button>
  );
}
