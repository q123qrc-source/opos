/** Floating Player — picture-in-picture mini player bound to the shared audio engine. */
import { Play, Pause, SkipBack, SkipForward, Maximize2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { audio, formatTime, TRACKS, useAudio } from '../../lib/audioEngine';
import { useOS } from '../../store/useOS';
import { Artwork, Visualizer } from './media/shared';

export default function FloatingPlayer(_: AppProps) {
  const { playing, index, position } = useAudio();
  const track = TRACKS[index];
  const launch = useOS((s) => s.launch);
  return (
    <div className="relative flex h-full flex-col overflow-hidden p-3 pt-6 text-white" style={{ background: `linear-gradient(135deg, ${track.colors[0]}55, #0e1018 70%)` }}>
      <Visualizer colors={track.colors} className="pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-25" bars={40} />
      <div className="relative flex items-center gap-3">
        <Artwork track={track} className="h-16 w-16 shrink-0 shadow-lg" rounded="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{track.title}</div>
          <div className="truncate text-[12px] text-white/60">{track.artist}</div>
          <div className="mt-1 text-[11px] tabular-nums text-white/45">
            {formatTime(position)} / {formatTime(track.duration)}
          </div>
        </div>
        <button className="self-start rounded p-1 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => launch('music')} aria-label="Open Music">
          <Maximize2 size={14} />
        </button>
      </div>
      <div className="relative mt-auto h-1 overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-white" style={{ width: `${(position / track.duration) * 100}%` }} />
      </div>
      <div className="relative mt-2 flex items-center justify-center gap-5">
        <button className="text-white/80 hover:text-white" onClick={() => audio.previous()} aria-label="Previous">
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white text-black" onClick={() => audio.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="translate-x-[1px]" />}
        </button>
        <button className="text-white/80 hover:text-white" onClick={() => audio.next()} aria-label="Next">
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
