/** Live IPTV — channel preview + Electronic Program Guide with a live "now" line. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Radio } from 'lucide-react';
import type { AppProps } from '../../types';
import { LIBRARY } from '../../lib/media';
import { useClock, useTimeFormat, cx } from '../../lib/hooks';
import { VideoPlayer } from './media/VideoPlayer';

const CHANNELS = [
  { n: 101, name: 'OPOS One', color: '#6366f1', genre: 'Entertainment' },
  { n: 102, name: 'Cinema+', color: '#ef4444', genre: 'Movies' },
  { n: 103, name: 'Nature HD', color: '#22c55e', genre: 'Documentary' },
  { n: 104, name: 'Velocity', color: '#f97316', genre: 'Motors' },
  { n: 105, name: 'NewsNow 24', color: '#0ea5e9', genre: 'News' },
  { n: 106, name: 'Kids Planet', color: '#eab308', genre: 'Kids' },
  { n: 107, name: 'Arena Sports', color: '#14b8a6', genre: 'Sports' },
  { n: 108, name: 'Retro TV', color: '#a855f7', genre: 'Classics' },
  { n: 109, name: 'Sci-Fi Zone', color: '#06b6d4', genre: 'Sci-Fi' },
  { n: 110, name: 'Music Live', color: '#ec4899', genre: 'Music' },
];

const SHOWS: Record<string, string[]> = {
  Entertainment: ['Late Night Live', 'The Convergence Show', 'Studio 9', 'Talent Quest', 'Prime Comedy'],
  Movies: ['Midnight Premiere', 'Classic Matinee', 'Director’s Cut', 'Action Hour', 'Indie Spotlight'],
  Documentary: ['Planet Deep', 'Wild Coasts', 'Frozen Frontiers', 'Hidden Forests', 'Ocean Giants'],
  Motors: ['Track Day', 'Garage Rebuild', 'Rally Weekly', 'Supercar Diaries', 'Road Test'],
  News: ['World Tonight', 'Market Watch', 'Morning Brief', 'Tech Report', 'Weather Center'],
  Kids: ['Space Bunnies', 'Little Builders', 'Doodle Town', 'Robo Pals', 'Story Time'],
  Sports: ['Matchday Live', 'Goal Rush', 'The Huddle', 'Court Side', 'Sports Center'],
  Classics: ['Golden Sitcoms', 'Mystery Theater', 'Westerns', 'Retro Rewind', 'Vintage Cartoons'],
  'Sci-Fi': ['Starship Atlas', 'Quantum Drift', 'The Signal', 'Outer Rim', 'Timeline'],
  Music: ['Top 40 Countdown', 'Unplugged', 'Festival Sets', 'Synth Sessions', 'Jazz Lounge'],
};

const SLOT = 30 * 60000;
const PX_PER_MIN = 7;

function programsFor(ch: (typeof CHANNELS)[number], start: number, end: number) {
  const list: { title: string; start: number; end: number }[] = [];
  let t = Math.floor(start / SLOT) * SLOT;
  while (t < end) {
    const seed = (Math.floor(t / SLOT) * 31 + ch.n * 7) % 97;
    const len = (seed % 3 === 0 ? 2 : 1) * SLOT;
    const titles = SHOWS[ch.genre];
    list.push({ title: titles[seed % titles.length], start: t, end: t + len });
    t += len;
  }
  return list;
}

export default function IPTV({ mode, pid }: AppProps) {
  const big = mode === 'tv';
  const now = useClock(30000);
  const fmt = useTimeFormat();
  const [current, setCurrent] = useState(0);
  const [banner, setBanner] = useState(true);
  const guideRef = useRef<HTMLDivElement>(null);
  const ch = CHANNELS[current];
  const stream = LIBRARY[current % LIBRARY.length];

  const windowStart = Math.floor((now.getTime() - SLOT) / SLOT) * SLOT;
  const windowEnd = windowStart + 4 * 3600000;
  const guide = useMemo(() => CHANNELS.map((c) => programsFor(c, windowStart, windowEnd)), [windowStart, windowEnd]);
  const nowProgram = guide[current].find((p) => p.start <= now.getTime() && p.end > now.getTime());
  const nowX = ((now.getTime() - windowStart) / 60000) * PX_PER_MIN;

  const tune = (i: number) => {
    setCurrent((i + CHANNELS.length) % CHANNELS.length);
    setBanner(true);
  };

  useEffect(() => {
    const t = setTimeout(() => setBanner(false), 4000);
    return () => clearTimeout(t);
  }, [current]);

  useEffect(() => {
    guideRef.current?.scrollTo({ left: Math.max(0, nowX - 120) });
  }, [nowX]);

  // Channel up/down (PageUp/PageDown, remote ChannelUp/Down) and number entry.
  useEffect(() => {
    let digits = '';
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const frame = document.querySelector(`[data-pid="${pid}"]`);
      if (!frame || frame.getAttribute('aria-hidden') === 'true') return;
      if (e.key === 'PageUp' || e.key === 'ChannelUp') tune(current + 1);
      else if (e.key === 'PageDown' || e.key === 'ChannelDown') tune(current - 1);
      else if (/^\d$/.test(e.key) && !(e.target as HTMLElement).matches('input,textarea')) {
        digits += e.key;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          const idx = CHANNELS.findIndex((c) => c.n === Number(digits));
          if (idx >= 0) tune(idx);
          digits = '';
        }, 900);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const rowH = big ? 84 : 52;

  return (
    <div className="flex h-full flex-col bg-[#05070d] text-white">
      {/* Preview + info */}
      <div className={cx('flex shrink-0 gap-6', big ? 'h-[46%] p-10' : mode === 'mobile' ? 'flex-col p-3' : 'h-[45%] p-4')}>
        <div className={cx('relative overflow-hidden rounded-2xl bg-black', mode === 'mobile' ? 'aspect-video w-full' : 'aspect-video h-full')}>
          <VideoPlayer pid={pid} src={stream.src} poster={stream.thumb} title={ch.name} colors={[ch.color, '#000']} loop controls={false} className="h-full w-full" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold">
            <Radio size={12} /> LIVE
          </div>
          <div className={cx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-700', banner ? 'opacity-100' : 'opacity-0')}>
            <div className={cx('font-bold', big ? 'text-3xl' : 'text-sm')}>
              {ch.n} · {ch.name}
            </div>
            <div className={cx('text-white/70', big ? 'text-xl' : 'text-xs')}>{nowProgram?.title}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className={cx('flex items-center gap-3 font-semibold uppercase tracking-widest', big ? 'text-xl' : 'text-[11px]')} style={{ color: ch.color }}>
            Channel {ch.n} · {ch.genre}
          </div>
          <div className={cx('font-black leading-tight', big ? 'mt-2 text-6xl' : 'mt-1 text-2xl')}>{nowProgram?.title}</div>
          {nowProgram && (
            <>
              <div className={cx('mt-2 text-white/60', big ? 'text-2xl' : 'text-sm')}>
                {fmt(new Date(nowProgram.start))} – {fmt(new Date(nowProgram.end))}
              </div>
              <div className={cx('mt-3 overflow-hidden rounded-full bg-white/10', big ? 'h-2.5 w-2/3' : 'h-1.5 w-full max-w-xs')}>
                <div className="h-full rounded-full" style={{ background: ch.color, width: `${((now.getTime() - nowProgram.start) / (nowProgram.end - nowProgram.start)) * 100}%` }} />
              </div>
            </>
          )}
          <div className={cx('mt-4 flex gap-2', big && 'gap-4')}>
            <button className={cx('flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20', big ? 'px-6 py-3 text-xl' : 'px-3 py-1.5 text-xs')} onClick={() => tune(current + 1)}>
              <ChevronUp size={big ? 24 : 14} /> CH+
            </button>
            <button className={cx('flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20', big ? 'px-6 py-3 text-xl' : 'px-3 py-1.5 text-xs')} onClick={() => tune(current - 1)}>
              <ChevronDown size={big ? 24 : 14} /> CH−
            </button>
          </div>
        </div>
      </div>

      {/* EPG */}
      <div className="flex min-h-0 flex-1 border-t border-white/10">
        <div className={cx('shrink-0 overflow-hidden border-r border-white/10 bg-[#080b14]', big ? 'w-72' : 'w-36')}>
          <div className={cx('border-b border-white/10 text-white/40', big ? 'h-12 px-6 text-lg leading-[3rem]' : 'h-8 px-3 text-[11px] leading-8')}>Channels</div>
          {CHANNELS.map((c, i) => (
            <div key={c.n} className={cx('flex items-center gap-3 border-b border-white/5', big ? 'px-6' : 'px-3', i === current && 'bg-white/[.06]')} style={{ height: rowH }}>
              <span className={cx('grid shrink-0 place-items-center rounded-md font-black', big ? 'h-12 w-12 text-lg' : 'h-7 w-7 text-[10px]')} style={{ background: c.color }}>
                {c.n}
              </span>
              <span className={cx('truncate font-semibold', big ? 'text-xl' : 'text-xs')}>{c.name}</span>
            </div>
          ))}
        </div>
        <div ref={guideRef} className="relative min-w-0 flex-1 overflow-auto">
          <div className="relative" style={{ width: (240 * PX_PER_MIN) }}>
            <div className={cx('sticky top-0 z-10 flex border-b border-white/10 bg-[#05070d]', big ? 'h-12' : 'h-8')}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={cx('shrink-0 border-l border-white/10 pl-2 text-white/50', big ? 'text-lg leading-[3rem]' : 'text-[11px] leading-8')} style={{ width: 30 * PX_PER_MIN }}>
                  {fmt(new Date(windowStart + i * SLOT))}
                </div>
              ))}
            </div>
            {guide.map((programs, ci) => (
              <div key={ci} className="relative border-b border-white/5" style={{ height: rowH }} data-nav-group={`epg-${ci}`}>
                {programs.map((p) => {
                  const left = Math.max(0, ((p.start - windowStart) / 60000) * PX_PER_MIN);
                  const width = ((Math.min(p.end, windowEnd) - Math.max(p.start, windowStart)) / 60000) * PX_PER_MIN;
                  const live = p.start <= now.getTime() && p.end > now.getTime();
                  return (
                    <button
                      key={p.start}
                      data-focus-style="flat"
                      onClick={() => live && tune(ci)}
                      className={cx('absolute top-1 bottom-1 truncate rounded-md border border-white/5 px-3 text-left transition', live ? 'bg-white/[.12] hover:bg-white/20' : 'bg-white/[.04] text-white/60 hover:bg-white/10', ci === current && live && 'ring-1 ring-white/40')}
                      style={{ left: left + 2, width: width - 4 }}
                    >
                      <div className={cx('truncate font-semibold', big ? 'text-xl' : 'text-xs')}>{p.title}</div>
                      <div className={cx('truncate text-white/45', big ? 'text-base' : 'text-[10px]')}>
                        {fmt(new Date(p.start))} – {fmt(new Date(p.end))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-red-500" style={{ left: nowX }}>
              <div className="-ml-1 h-2.5 w-2.5 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
