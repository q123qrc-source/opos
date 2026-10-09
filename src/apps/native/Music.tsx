/** OPOS Music — Spotify-style player over the generative Web Audio engine. */
import { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Heart, Home, Search, Library, Volume2, Clock3, ListMusic, PictureInPicture2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { audio, formatTime, TRACKS, useAudio, type Track } from '../../lib/audioEngine';
import { useOS } from '../../store/useOS';
import { Slider } from '../../components/ui';
import { cx } from '../../lib/hooks';
import { Artwork, Visualizer } from './media/shared';

const PLAYLISTS = ['Daily Mix 1', 'Focus Flow', 'Night Drive', 'Chill Lo-Fi', 'Liked Songs'];

export default function Music({ mode }: AppProps) {
  if (mode === 'tv') return <TVMusic />;
  if (mode === 'mobile') return <MobileMusic />;
  return <DesktopMusic />;
}

function useNow() {
  const st = useAudio();
  return { ...st, track: TRACKS[st.index] };
}

function Controls({ size = 20, big = false }: { size?: number; big?: boolean }) {
  const { playing, shuffle, repeat } = useNow();
  const btn = cx('grid place-items-center rounded-full transition hover:scale-105 active:scale-95', big ? 'h-20 w-20 bg-white/10' : 'h-9 w-9 text-white/70 hover:text-white');
  return (
    <div className={cx('flex items-center', big ? 'gap-8' : 'gap-3')}>
      <button className={cx(btn, shuffle && 'text-[#1ed760]')} onClick={() => useAudio.setState({ shuffle: !shuffle })} aria-label="Shuffle">
        <Shuffle size={size * 0.85} />
      </button>
      <button className={btn} onClick={() => audio.previous()} aria-label="Previous">
        <SkipBack size={size} fill="currentColor" />
      </button>
      <button
        data-autofocus
        className={cx('grid place-items-center rounded-full bg-white text-black transition hover:scale-105 active:scale-95', big ? 'h-28 w-28' : 'h-10 w-10')}
        onClick={() => audio.toggle()}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={size * 1.1} fill="black" /> : <Play size={size * 1.1} fill="black" className="translate-x-[2px]" />}
      </button>
      <button className={btn} onClick={() => audio.next()} aria-label="Next">
        <SkipForward size={size} fill="currentColor" />
      </button>
      <button className={cx(btn, repeat && 'text-[#1ed760]')} onClick={() => useAudio.setState({ repeat: !repeat })} aria-label="Repeat">
        <Repeat size={size * 0.85} />
      </button>
    </div>
  );
}

function Progress({ big = false }: { big?: boolean }) {
  const { position, track } = useNow();
  return (
    <div className={cx('flex w-full items-center gap-3 tabular-nums text-white/60', big ? 'text-2xl' : 'text-[11px]')}>
      <span>{formatTime(position)}</span>
      <Slider value={position} min={0} max={track.duration} onChange={(v) => audio.seek(v)} label="Seek" />
      <span>{formatTime(track.duration)}</span>
    </div>
  );
}

function TrackRow({ t, i, compact = false }: { t: Track; i: number; compact?: boolean }) {
  const { index, playing, liked } = useNow();
  const current = index === i;
  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={() => audio.load(i)}
      onClick={() => compact && audio.load(i)}
      onKeyDown={(e) => e.key === 'Enter' && audio.load(i)}
      className={cx('group grid cursor-default items-center gap-4 rounded-md px-3 py-2 hover:bg-white/10', compact ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[2rem_1fr_1fr_3rem_4rem]', current && 'bg-white/[.07]')}
    >
      {!compact && (
        <span className={cx('text-sm tabular-nums', current ? 'text-[#1ed760]' : 'text-white/50')}>
          {current && playing ? <Visualizer colors={['#1ed760', '#1ed760']} bars={3} className="h-4 w-4" /> : i + 1}
        </span>
      )}
      <div className="flex min-w-0 items-center gap-3">
        <Artwork track={t} className="h-10 w-10 shrink-0" rounded="rounded" />
        <div className="min-w-0">
          <div className={cx('truncate text-[14px]', current ? 'text-[#1ed760]' : 'text-white')}>{t.title}</div>
          <div className="truncate text-[12px] text-white/55">{t.artist}</div>
        </div>
      </div>
      {!compact && <span className="truncate text-[13px] text-white/55">{t.album}</span>}
      <button className={cx('opacity-0 group-hover:opacity-100', liked.includes(t.id) && 'opacity-100')} onClick={(e) => { e.stopPropagation(); audio.toggleLike(t.id); }} aria-label="Like">
        <Heart size={16} className={liked.includes(t.id) ? 'fill-[#1ed760] text-[#1ed760]' : 'text-white/60'} />
      </button>
      {!compact && <span className="text-right text-[13px] tabular-nums text-white/55">{formatTime(t.duration)}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ desktop */

function DesktopMusic() {
  const { track, liked } = useNow();
  const volume = useAudio((s) => s.volume);
  const [playlist, setPlaylist] = useState(PLAYLISTS[0]);
  const launch = useOS((s) => s.launch);
  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <aside className="flex w-56 shrink-0 flex-col gap-2">
          <div className="rounded-lg bg-[#121212] p-3">
            {[{ i: Home, l: 'Home' }, { i: Search, l: 'Search' }].map(({ i: I, l }) => (
              <button key={l} className="flex w-full items-center gap-4 rounded px-2 py-2 text-[14px] font-semibold text-white/70 hover:text-white">
                <I size={20} /> {l}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-[#121212] p-3">
            <div className="mb-2 flex items-center gap-3 px-2 text-[14px] font-semibold text-white/70">
              <Library size={20} /> Your Library
            </div>
            <div className="overflow-y-auto">
              {PLAYLISTS.map((p, i) => (
                <button key={p} onClick={() => setPlaylist(p)} className={cx('flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/10', playlist === p && 'bg-white/10')}>
                  <Artwork track={TRACKS[(i * 3) % TRACKS.length]} className="h-10 w-10 shrink-0" rounded="rounded" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{p}</div>
                    <div className="text-[11px] text-white/50">Playlist · OPOS</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto rounded-lg" style={{ background: `linear-gradient(180deg, ${track.colors[0]}aa 0%, #121212 340px)` }}>
          <div className="flex items-end gap-6 p-6">
            <Artwork track={track} className="h-48 w-48 shrink-0 shadow-2xl" rounded="rounded-md" />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold">Playlist</div>
              <h1 className="truncate text-[clamp(2rem,5vw,4.5rem)] font-black leading-tight">{playlist}</h1>
              <div className="text-[13px] text-white/70">OPOS · {TRACKS.length} songs · {liked.length} liked</div>
            </div>
          </div>
          <div className="flex items-center gap-5 bg-black/20 px-6 py-4">
            <button className="grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-black transition hover:scale-105" onClick={() => audio.toggle()} aria-label="Play">
              {useAudio.getState().playing ? <Pause fill="black" /> : <Play fill="black" className="translate-x-[2px]" />}
            </button>
            <Visualizer colors={track.colors} className="h-10 flex-1" bars={64} />
          </div>
          <div className="px-4 pb-6">
            <div className="mb-2 grid grid-cols-[2rem_1fr_1fr_3rem_4rem] gap-4 border-b border-white/10 px-3 pb-2 text-[12px] text-white/50">
              <span>#</span>
              <span>Title</span>
              <span>Album</span>
              <span />
              <Clock3 size={14} className="justify-self-end" />
            </div>
            {TRACKS.map((t, i) => (
              <TrackRow key={t.id} t={t} i={i} />
            ))}
          </div>
        </main>
      </div>
      <footer className="grid h-20 shrink-0 grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Artwork track={track} className="h-14 w-14 shrink-0" rounded="rounded" />
          <div className="min-w-0">
            <div className="truncate text-[14px]">{track.title}</div>
            <div className="truncate text-[12px] text-white/55">{track.artist}</div>
          </div>
          <button onClick={() => audio.toggleLike(track.id)} aria-label="Like">
            <Heart size={16} className={liked.includes(track.id) ? 'fill-[#1ed760] text-[#1ed760]' : 'text-white/60'} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Controls size={18} />
          <Progress />
        </div>
        <div className="flex items-center justify-end gap-3 text-white/60">
          <button className="hover:text-white" onClick={() => launch('miniplayer')} title="Open Floating Player" aria-label="Floating player">
            <PictureInPicture2 size={17} />
          </button>
          <ListMusic size={17} />
          <Volume2 size={17} />
          <div className="w-28">
            <Slider value={volume * 100} onChange={(v) => audio.setVolume(v / 100)} label="Volume" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------- TV */

function TVMusic() {
  const { track, index } = useNow();
  return (
    <div className="relative flex h-full flex-col overflow-hidden text-white" style={{ background: `radial-gradient(ellipse at 20% 30%, ${track.colors[0]}66, #000 65%)` }}>
      <div className="flex flex-1 items-center gap-20 px-24 pt-16">
        <Artwork track={track} className="aspect-square h-[42vh] shrink-0 shadow-[0_40px_120px_rgba(0,0,0,.7)]" rounded="rounded-3xl" />
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold uppercase tracking-[0.3em] text-[#1ed760]">Now playing</div>
          <h1 className="mt-4 truncate text-[clamp(3rem,6vw,7rem)] font-black leading-none">{track.title}</h1>
          <div className="mt-4 text-4xl text-white/60">
            {track.artist} · {track.album}
          </div>
          <div className="mt-12 max-w-4xl">
            <Progress big />
          </div>
          <div className="mt-10">
            <Controls size={40} big />
          </div>
        </div>
      </div>
      <Visualizer colors={track.colors} className="pointer-events-none absolute inset-x-0 bottom-[30vh] h-24 opacity-30" bars={96} />
      <div className="no-scrollbar flex gap-8 overflow-x-auto px-24 pb-14 pt-8" data-nav-group="tracks">
        {TRACKS.map((t, i) => (
          <button key={t.id} data-focusable="tile" onClick={() => audio.load(i)} className={cx('w-56 shrink-0 rounded-2xl p-3 text-left', i === index ? 'bg-white/15' : 'bg-white/5')}>
            <Artwork track={t} className="aspect-square w-full" />
            <div className="mt-3 truncate text-2xl font-bold">{t.title}</div>
            <div className="truncate text-lg text-white/55">{t.artist}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- mobile */

function MobileMusic() {
  const { track } = useNow();
  const [expanded, setExpanded] = useState(false);
  if (expanded) {
    return (
      <div className="flex h-full flex-col px-7 pb-10 pt-6 text-white" style={{ background: `linear-gradient(180deg, ${track.colors[0]}, #0a0a0a 75%)` }}>
        <button className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-white/40" onClick={() => setExpanded(false)} aria-label="Collapse" />
        <Artwork track={track} className="aspect-square w-full shadow-2xl" rounded="rounded-2xl" />
        <div className="mt-8 flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-2xl font-bold">{track.title}</div>
            <div className="text-white/60">{track.artist}</div>
          </div>
          <Heart size={24} onClick={() => audio.toggleLike(track.id)} className={useAudio.getState().liked.includes(track.id) ? 'fill-[#1ed760] text-[#1ed760]' : ''} />
        </div>
        <div className="mt-6">
          <Progress />
        </div>
        <div className="mt-6 flex justify-center">
          <Controls size={30} />
        </div>
        <Visualizer colors={track.colors} className="mt-auto h-14 w-full opacity-70" bars={40} />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-[#121212] text-white">
      <div className="flex-1 overflow-y-auto px-4 pt-6">
        <h1 className="mb-4 text-2xl font-bold">Good evening</h1>
        <div className="mb-6 grid grid-cols-2 gap-2">
          {PLAYLISTS.slice(0, 4).map((p, i) => (
            <button key={p} className="flex items-center gap-2 overflow-hidden rounded-md bg-white/10 text-left text-[13px] font-semibold" onClick={() => audio.load(i * 2)}>
              <Artwork track={TRACKS[i * 2]} className="h-14 w-14 shrink-0" rounded="rounded-none" />
              {p}
            </button>
          ))}
        </div>
        <h2 className="mb-2 text-lg font-bold">All songs</h2>
        {TRACKS.map((t, i) => (
          <TrackRow key={t.id} t={t} i={i} compact />
        ))}
      </div>
      <button className="m-2 flex items-center gap-3 rounded-lg p-2 text-left" style={{ background: track.colors[1] }} onClick={() => setExpanded(true)}>
        <Artwork track={track} className="h-10 w-10 shrink-0" rounded="rounded" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{track.title}</div>
          <div className="truncate text-[12px] text-white/70">{track.artist}</div>
        </div>
        <span
          role="button"
          className="p-2"
          onClick={(e) => {
            e.stopPropagation();
            audio.toggle();
          }}
        >
          {useAudio.getState().playing ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}
        </span>
      </button>
    </div>
  );
}
