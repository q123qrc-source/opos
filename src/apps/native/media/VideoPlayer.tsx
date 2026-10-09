/** A remote-friendly <video> player with custom chrome, used by Local Plex and Live IPTV. */
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, AlertTriangle } from 'lucide-react';
import { useMediaHandler } from '../../../lib/mediaRouter';
import { formatTime } from '../../../lib/audioEngine';
import { cx } from '../../../lib/hooks';

interface Props {
  pid: string;
  src: string;
  poster?: string;
  title: string;
  subtitle?: string;
  colors: [string, string];
  big?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  /** Keyboard control (arrows seek, Enter toggles) — enable for the fullscreen player. */
  keyboard?: boolean;
  className?: string;
}

export function VideoPlayer({ pid, src, poster, title, subtitle, colors, big, autoPlay = true, loop, controls = true, keyboard, className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<number>();

  const poke = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 3000);
  };
  useEffect(() => {
    poke();
    setError(false);
    return () => window.clearTimeout(hideTimer.current);
  }, [src]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  };
  const seek = (d: number) => {
    const v = ref.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
    poke();
  };

  useMediaHandler(pid, (action) => {
    if (action === 'playpause') toggle();
    else if (action === 'stop') ref.current?.pause();
    else if (action === 'next') seek(30);
    else if (action === 'previous') seek(-30);
    return true;
  });

  return (
    <div
      className={cx('group relative overflow-hidden bg-black', className)}
      onPointerMove={poke}
      tabIndex={keyboard ? -1 : undefined}
      data-focusable={keyboard ? '' : undefined}
      data-focus-style="flat"
      data-nav-capture={keyboard ? 'horizontal' : undefined}
      data-autofocus={keyboard ? '' : undefined}
      onKeyDown={(e) => {
        if (!keyboard) return;
        if (e.key === 'ArrowRight') seek(10);
        else if (e.key === 'ArrowLeft') seek(-10);
        else if (e.key === ' ' || e.key === 'k') toggle();
        else return;
        e.preventDefault();
      }}
      onClick={keyboard ? toggle : undefined}
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        className="h-full w-full object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setError(true)}
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}>
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <AlertTriangle size={big ? 56 : 32} className="opacity-80" />
            <div className={cx('font-bold', big ? 'text-4xl' : 'text-lg')}>{title}</div>
            <div className={cx('text-white/70', big ? 'text-xl' : 'text-xs')}>Stream unavailable — check your network connection.</div>
          </div>
        </div>
      )}
      {controls && !error && (
        <div className={cx('absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-transparent to-black/40 transition-opacity duration-500', chrome || !playing ? 'opacity-100' : 'opacity-0')}>
          <div className={cx('absolute left-0 top-0', big ? 'p-12' : 'p-4')}>
            <div className={cx('font-black text-white drop-shadow', big ? 'text-5xl' : 'text-lg')}>{title}</div>
            {subtitle && <div className={cx('text-white/70', big ? 'mt-2 text-2xl' : 'text-xs')}>{subtitle}</div>}
          </div>
          <div className={cx('flex flex-col gap-3', big ? 'px-12 pb-12' : 'px-4 pb-3')} onClick={(e) => e.stopPropagation()}>
            <div className={cx('flex items-center gap-3 tabular-nums text-white/75', big ? 'text-2xl' : 'text-xs')}>
              <span>{formatTime(time)}</span>
              <div
                className={cx('relative flex-1 cursor-pointer rounded-full bg-white/20', big ? 'h-2.5' : 'h-1.5')}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  if (ref.current && duration) ref.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
                }}
              >
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${duration ? (time / duration) * 100 : 0}%`, background: colors[0] }} />
              </div>
              <span>{formatTime(duration || 0)}</span>
            </div>
            <div className={cx('flex items-center text-white', big ? 'gap-6' : 'gap-3')}>
              <button onClick={() => seek(-10)} aria-label="Back 10 seconds" tabIndex={keyboard ? -1 : 0}>
                <RotateCcw size={big ? 36 : 18} />
              </button>
              <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className={cx('grid place-items-center rounded-full bg-white text-black', big ? 'h-16 w-16' : 'h-8 w-8')} tabIndex={keyboard ? -1 : 0}>
                {playing ? <Pause size={big ? 30 : 16} fill="black" /> : <Play size={big ? 30 : 16} fill="black" className="translate-x-[1px]" />}
              </button>
              <button onClick={() => seek(10)} aria-label="Forward 10 seconds" tabIndex={keyboard ? -1 : 0}>
                <RotateCw size={big ? 36 : 18} />
              </button>
              <button className="ml-auto" onClick={() => setMuted((m) => !m)} aria-label="Mute" tabIndex={keyboard ? -1 : 0}>
                {muted ? <VolumeX size={big ? 32 : 18} /> : <Volume2 size={big ? 32 : 18} />}
              </button>
              <button onClick={() => ref.current?.requestFullscreen?.()} aria-label="Fullscreen" tabIndex={keyboard ? -1 : 0}>
                <Maximize size={big ? 30 : 17} />
              </button>
            </div>
            {big && keyboard && <div className="text-lg text-white/45">◀ ▶ seek 10s · OK play/pause · BACK close</div>}
          </div>
        </div>
      )}
    </div>
  );
}
