/** Camera — live webcam via navigator.mediaDevices with filters, flip, capture and gallery. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SwitchCamera, CameraOff, Download, X, Zap, Timer } from 'lucide-react';
import type { AppProps } from '../../types';
import { useFs, HOME } from '../../lib/vfs';
import { useOS } from '../../store/useOS';
import { useBackHandler } from '../../lib/backStack';
import { cx } from '../../lib/hooks';

const FILTERS = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.15)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.6) brightness(.85)' },
  { id: 'warm', label: 'Warm', css: 'sepia(.35) saturate(1.3)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(190deg) saturate(.9)' },
  { id: 'dream', label: 'Dream', css: 'blur(1px) brightness(1.15) saturate(1.4)' },
];

export default function Camera({ pid, mode }: AppProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(FILTERS[0]);
  const [shots, setShots] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [timer, setTimer] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const write = useFs((s) => s.write);
  const notify = useOS((s) => s.notify);
  const frameHidden = useOS((s) => (s.mode === 'desktop' ? s.processes.find((p) => p.pid === pid)?.minimized : s.focusedPid !== pid));

  useBackHandler(pid, () => {
    if (preview) {
      setPreview(null);
      return true;
    }
    return false;
  });

  const start = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API not available in this environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was denied.' : (e as Error).name === 'NotFoundError' ? 'No camera was found on this device.' : (e as Error).message);
    }
  }, [facing]);

  // Release the camera while the app is in the background.
  useEffect(() => {
    if (frameHidden) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    void start();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [start, frameHidden]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.filter = filter.css;
    if (facing === 'user') {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.9);
    setShots((s) => [url, ...s].slice(0, 24));
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const name = `${HOME}/Pictures/IMG_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.jpg`;
    write(name, url);
    notify('Photo saved', name.split('/').pop(), 'camera');
  };

  const shoot = () => {
    if (!timer) return capture();
    setCountdown(timer);
    let n = timer;
    const id = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(id);
        capture();
      }
    }, 1000);
  };

  return (
    <div className="relative flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-5 py-3">
        <button onClick={() => setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))} className={cx('flex items-center gap-1 text-xs', timer ? 'text-yellow-300' : 'text-white/70')}>
          <Timer size={18} /> {timer ? `${timer}s` : 'Off'}
        </button>
        <span className="text-xs font-semibold tracking-[0.3em] text-yellow-300">PHOTO</span>
        <Zap size={18} className="text-white/70" />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <CameraOff size={48} className="text-white/40" />
              <div className="text-lg font-semibold">Camera unavailable</div>
              <div className="max-w-xs text-sm text-white/55">{error}</div>
              <button onClick={() => void start()} className="mt-2 rounded-full bg-white/15 px-5 py-2 text-sm hover:bg-white/25">
                Try again
              </button>
            </div>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ filter: filter.css, transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
        )}
        {countdown > 0 && <div className="absolute inset-0 grid place-items-center text-[8rem] font-thin">{countdown}</div>}
        <div className={cx('pointer-events-none absolute inset-0 bg-white transition-opacity duration-150', flash ? 'opacity-90' : 'opacity-0')} />
        {/* rule of thirds */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/[.07]" />
          ))}
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f)} className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-medium', filter.id === f.id ? 'bg-yellow-300 text-black' : 'bg-white/10 text-white/80')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className={cx('flex items-center justify-between px-8', mode === 'tv' ? 'pb-10' : 'pb-6')}>
        <button className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white/30 bg-white/10" onClick={() => shots[0] && setPreview(shots[0])} aria-label="Gallery">
          {shots[0] && <img src={shots[0]} alt="" className="h-full w-full object-cover" />}
        </button>
        <button data-autofocus onClick={shoot} disabled={!!error} className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40" aria-label="Take photo">
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
        <button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} className="grid h-12 w-12 place-items-center rounded-full bg-white/10" aria-label="Switch camera">
          <SwitchCamera size={22} />
        </button>
      </div>

      {preview && (
        <div className="absolute inset-0 z-10 flex animate-fade-in flex-col bg-black">
          <div className="flex items-center justify-between p-3">
            <button onClick={() => setPreview(null)} aria-label="Close">
              <X />
            </button>
            <a href={preview} download="opos-photo.jpg" className="flex items-center gap-1 text-sm text-os-accent">
              <Download size={16} /> Save
            </a>
          </div>
          <img src={preview} alt="Captured" className="min-h-0 flex-1 object-contain" />
          <div className="no-scrollbar flex gap-1 overflow-x-auto p-2">
            {shots.map((s, i) => (
              <button key={i} onClick={() => setPreview(s)} className={cx('h-14 w-14 shrink-0 overflow-hidden rounded', s === preview && 'ring-2 ring-yellow-300')}>
                <img src={s} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
