/** Local Plex — a local media center: library grid, detail sheet and player. */
import { useMemo, useState } from 'react';
import { Home, Film, Tv2, Search, Play, Star, ArrowLeft, Clock } from 'lucide-react';
import type { AppProps } from '../../types';
import { LIBRARY, type Movie } from '../../lib/media';
import { useBackHandler } from '../../lib/backStack';
import { usePersistentState, cx } from '../../lib/hooks';
import { VideoPlayer } from './media/VideoPlayer';

type Section = 'home' | 'movie' | 'show';

function Poster({ m, big, onOpen, progress }: { m: Movie; big: boolean; onOpen: () => void; progress?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <button data-focusable="tile" onClick={onOpen} className={cx('group relative shrink-0 overflow-hidden rounded-xl text-left', big ? 'w-[22rem]' : 'w-full')}>
      <div className="relative aspect-video w-full" style={{ background: `linear-gradient(135deg, ${m.colors[0]}, ${m.colors[1]})` }}>
        {!broken && <img src={m.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={() => setBroken(true)} />}
        {broken && <div className={cx('absolute inset-0 grid place-items-center p-3 text-center font-black text-white/90', big ? 'text-3xl' : 'text-lg')}>{m.title}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div className="h-full bg-[#e5a00d]" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className={cx('truncate pt-2 font-semibold text-white', big ? 'text-2xl' : 'text-[13px]')}>{m.title}</div>
      <div className={cx('text-white/50', big ? 'text-lg' : 'text-[11px]')}>
        {m.year} · {m.genre}
      </div>
    </button>
  );
}

export default function Plex({ mode, pid }: AppProps) {
  const big = mode === 'tv';
  const [section, setSection] = useState<Section>('home');
  const [detail, setDetail] = useState<Movie | null>(null);
  const [playing, setPlaying] = useState<Movie | null>(null);
  const [query, setQuery] = useState('');
  const [watched] = usePersistentState<Record<string, number>>('plex-progress', { bbb: 0.35, tos: 0.7 });

  useBackHandler(pid, () => {
    if (playing) return setPlaying(null), true;
    if (detail) return setDetail(null), true;
    return false;
  });

  const items = useMemo(() => {
    const q = query.toLowerCase();
    return LIBRARY.filter((m) => (section === 'home' || m.kind === section) && (!q || m.title.toLowerCase().includes(q)));
  }, [section, query]);

  if (playing) {
    return (
      <div className="relative h-full bg-black">
        <VideoPlayer pid={pid} src={playing.src} poster={playing.thumb} title={playing.title} subtitle={`${playing.year} · ${playing.rating} · ${playing.minutes} min`} colors={playing.colors} big={big} keyboard className="h-full w-full" />
        {!big && (
          <button className="absolute left-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80" onClick={() => setPlaying(null)} aria-label="Close player">
            <ArrowLeft size={18} />
          </button>
        )}
      </div>
    );
  }

  const nav: { id: Section; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movie', label: 'Movies', icon: Film },
    { id: 'show', label: 'TV Shows', icon: Tv2 },
  ];

  const continueWatching = LIBRARY.filter((m) => watched[m.id] > 0);

  return (
    <div className={cx('relative flex h-full bg-[#1f1f1f] text-white', mode === 'mobile' && 'flex-col')}>
      {/* Navigation */}
      {mode === 'mobile' ? (
        <div className="flex items-center gap-2 border-b border-white/5 bg-black/40 px-4 py-3">
          <div className="text-lg font-black text-[#e5a00d]">plex</div>
          <div className="ml-auto flex gap-1">
            {nav.map((n) => (
              <button key={n.id} onClick={() => setSection(n.id)} className={cx('rounded-full px-3 py-1 text-xs', section === n.id ? 'bg-[#e5a00d] text-black' : 'bg-white/10')}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <aside className={cx('flex shrink-0 flex-col gap-1 bg-black/50', big ? 'w-80 px-8 py-12' : 'w-52 p-4')}>
          <div className={cx('mb-6 font-black tracking-tight text-[#e5a00d]', big ? 'text-5xl' : 'text-2xl')}>plex</div>
          {nav.map((n) => (
            <button key={n.id} onClick={() => setSection(n.id)} className={cx('flex items-center gap-3 rounded-lg text-left transition', big ? 'px-5 py-4 text-2xl' : 'px-3 py-2 text-sm', section === n.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5')}>
              <n.icon size={big ? 28 : 18} /> {n.label}
            </button>
          ))}
          {!big && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Search size={14} className="text-white/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search library" className="w-full bg-transparent text-xs outline-none" />
            </div>
          )}
          <div className={cx('mt-auto text-white/35', big ? 'text-lg' : 'text-[11px]')}>Local server · {LIBRARY.length} items</div>
        </aside>
      )}

      {/* Library */}
      <main className={cx('min-w-0 flex-1 overflow-y-auto', big ? 'px-12 py-12' : 'p-5')}>
        {section === 'home' && continueWatching.length > 0 && !query && (
          <>
            <h2 className={cx('mb-3 font-bold', big ? 'text-3xl' : 'text-base')}>Continue Watching</h2>
            <div className={cx('no-scrollbar mb-6 flex overflow-x-auto', big ? 'gap-8 px-2 py-6' : 'gap-3')} data-nav-group="plex-continue">
              {continueWatching.map((m) => (
                <div key={m.id} className={big ? '' : 'w-56 shrink-0'}>
                  <Poster m={m} big={big} progress={watched[m.id]} onOpen={() => setDetail(m)} />
                </div>
              ))}
            </div>
          </>
        )}
        <h2 className={cx('mb-3 font-bold', big ? 'text-3xl' : 'text-base')}>{section === 'home' ? 'Recently Added' : section === 'movie' ? 'Movies' : 'TV Shows'}</h2>
        <div className={cx('grid', big ? 'grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-10 p-2' : mode === 'mobile' ? 'grid-cols-2 gap-3' : 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4')} data-nav-group="plex-grid">
          {items.map((m) => (
            <Poster key={m.id} m={m} big={false} onOpen={() => setDetail(m)} />
          ))}
        </div>
      </main>

      {/* Detail sheet */}
      {detail && (
        <div className="absolute inset-0 z-20 flex animate-fade-in items-end bg-black/70 backdrop-blur-sm" onClick={() => setDetail(null)} data-nav-scope data-nav-priority="15">
          <div className="relative w-full overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: `linear-gradient(90deg, #111 30%, ${detail.colors[0]}55)` }}>
            <img src={detail.thumb} alt="" className="absolute inset-y-0 right-0 h-full w-2/3 object-cover opacity-40 [mask-image:linear-gradient(to_right,transparent,black)]" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <div className={cx('relative max-w-3xl', big ? 'p-16' : 'p-8')}>
              <div className={cx('font-black', big ? 'text-7xl' : 'text-3xl')}>{detail.title}</div>
              <div className={cx('mt-3 flex items-center gap-4 text-white/70', big ? 'text-2xl' : 'text-sm')}>
                <span>{detail.year}</span>
                <span className="rounded border border-white/40 px-1.5">{detail.rating}</span>
                <span className="flex items-center gap-1">
                  <Clock size={big ? 22 : 14} /> {detail.minutes} min
                </span>
                <span className="flex items-center gap-1 text-[#e5a00d]">
                  <Star size={big ? 22 : 14} fill="currentColor" /> {(7 + (detail.id.length % 3) * 0.6).toFixed(1)}
                </span>
                <span>{detail.genre}</span>
              </div>
              <p className={cx('mt-5 text-white/80', big ? 'text-2xl leading-relaxed' : 'text-sm')}>{detail.summary}</p>
              <div className="mt-8 flex gap-3">
                <button data-autofocus onClick={() => setPlaying(detail)} className={cx('flex items-center gap-2 rounded-lg bg-[#e5a00d] font-bold text-black', big ? 'px-10 py-5 text-2xl' : 'px-6 py-2.5')}>
                  <Play size={big ? 28 : 18} fill="black" /> {watched[detail.id] ? 'Resume' : 'Play'}
                </button>
                <button onClick={() => setDetail(null)} className={cx('rounded-lg bg-white/10 font-semibold', big ? 'px-10 py-5 text-2xl' : 'px-6 py-2.5')}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
