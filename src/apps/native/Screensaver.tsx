/**
 * Screensaver — aerial flyovers with an ambient clock. Plays a playlist of high-resolution aerial
 * videos (configurable; best-effort public sources) and falls back to a procedurally rendered aerial
 * flyover when a video can't be loaded (offline, blocked, codec). Any input dismisses it.
 */
import { useEffect, useRef, useState } from 'react';
import type { AppProps } from '../../types';
import { useOS } from '../../store/useOS';
import { useClock, useTimeFormat } from '../../lib/hooks';
import { useWeatherStore } from '../../lib/weather';

export const AERIAL_VIDEOS: { src: string; place: string }[] = [
  { src: 'https://sylvan.apple.com/Aerials/2x/Videos/comp_GL_G004_C010_v03_SDR_PS_FINAL_20180709_SDR_2K_AVC.mov', place: 'Greenland' },
  { src: 'https://sylvan.apple.com/Aerials/2x/Videos/DB_D011_C010_2K_SDR_HEVC.mov', place: 'Dubai' },
  { src: 'https://sylvan.apple.com/Aerials/2x/Videos/LA_A006_C004_v01_SDR_FINAL_PS_20180730_SDR_2K_AVC.mov', place: 'Los Angeles' },
];

const SCENES = [
  { name: 'Fjords at Dawn', sky: ['#fbbf77', '#f472b6', '#312e81'], layers: ['#3b2c5e', '#2a1f47', '#1a1333', '#0d0a1c'], sun: '#fff1c1', aurora: false },
  { name: 'Desert Dusk', sky: ['#fde68a', '#fb923c', '#7c2d12'], layers: ['#9a3412', '#7c2d12', '#431407', '#1c0a04'], sun: '#fffbeb', aurora: false },
  { name: 'Arctic Night', sky: ['#0f172a', '#1e1b4b', '#020617'], layers: ['#1e293b', '#172033', '#0f172a', '#050914'], sun: '#e0f2fe', aurora: true },
  { name: 'Emerald Highlands', sky: ['#a7f3d0', '#38bdf8', '#1e3a8a'], layers: ['#166534', '#14532d', '#0b3b21', '#052e16'], sun: '#ffffff', aurora: false },
];

export default function Screensaver({ pid }: AppProps) {
  const close = useOS((s) => s.close);
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const weather = useWeatherStore((s) => s.current);
  const [videoIndex, setVideoIndex] = useState(() => {
    const custom = localStorage.getItem('opos:screensaver-video');
    return custom ? -1 : 0;
  });
  const [procedural, setProcedural] = useState(false);
  const [scene, setScene] = useState(0);
  const armed = useRef(false);

  // Dismiss on any input (after a short grace period so the launching click doesn't close it).
  useEffect(() => {
    const t = setTimeout(() => (armed.current = true), 900);
    const dismiss = (e: Event) => {
      if (!armed.current) return;
      e.preventDefault();
      e.stopPropagation();
      close(pid);
    };
    const opts = { capture: true };
    window.addEventListener('keydown', dismiss, opts);
    window.addEventListener('pointerdown', dismiss, opts);
    window.addEventListener('touchstart', dismiss, opts);
    let moved = 0;
    const onMove = (e: PointerEvent) => {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (moved > 80) dismiss(e);
    };
    window.addEventListener('pointermove', onMove, opts);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', dismiss, opts);
      window.removeEventListener('pointerdown', dismiss, opts);
      window.removeEventListener('touchstart', dismiss, opts);
      window.removeEventListener('pointermove', onMove, opts);
    };
  }, [close, pid]);

  useEffect(() => {
    if (!procedural) return;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 30000);
    return () => clearInterval(id);
  }, [procedural]);

  const custom = localStorage.getItem('opos:screensaver-video');
  const video = videoIndex === -1 && custom ? { src: custom, place: 'Custom aerial' } : AERIAL_VIDEOS[videoIndex];
  const place = procedural ? SCENES[scene].name : video?.place;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {!procedural && video && (
        <video
          key={video.src}
          src={video.src}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full animate-fade-in object-cover"
          onEnded={() => setVideoIndex((i) => (i + 1) % AERIAL_VIDEOS.length)}
          onError={() => {
            if (videoIndex >= 0 && videoIndex < AERIAL_VIDEOS.length - 1) setVideoIndex(videoIndex + 1);
            else setProcedural(true);
          }}
        />
      )}
      {procedural && <AerialCanvas scene={SCENES[scene]} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
      <div className="absolute bottom-[8%] left-[6%] text-white">
        <div className="text-[clamp(4rem,10vw,10rem)] font-extralight leading-none tracking-tight [text-shadow:0_4px_30px_rgba(0,0,0,.5)]">{fmt(now)}</div>
        <div className="mt-3 text-[clamp(1rem,2vw,2rem)] font-light text-white/80">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          {weather && ` · ${weather.emoji} ${Math.round(weather.temp)}°`}
        </div>
      </div>
      <div className="absolute bottom-[8%] right-[6%] text-right text-[clamp(.9rem,1.4vw,1.4rem)] font-light uppercase tracking-[0.3em] text-white/60">{place}</div>
    </div>
  );
}

/** Procedural aerial flyover: parallax ridgelines, drifting clouds, optional aurora. */
function AerialCanvas({ scene }: { scene: (typeof SCENES)[number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const ridge = (x: number, seed: number, amp: number) =>
      Math.sin(x * 0.0021 + seed) * amp + Math.sin(x * 0.0057 + seed * 2.1) * amp * 0.45 + Math.sin(x * 0.013 + seed * 3.7) * amp * 0.18;
    const clouds = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.35, s: 0.6 + Math.random() * 1.4, v: 0.004 + Math.random() * 0.01, i }));

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, scene.sky[2]);
      sky.addColorStop(0.55, scene.sky[1]);
      sky.addColorStop(1, scene.sky[0]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Sun / moon glow
      const sx = w * 0.68;
      const sy = h * 0.42;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
      glow.addColorStop(0, scene.sun + 'cc');
      glow.addColorStop(0.08, scene.sun + '55');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      if (scene.aurora) {
        for (let b = 0; b < 3; b++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 8) {
            const y = h * (0.18 + b * 0.06) + Math.sin(x * 0.004 + t * 0.4 + b) * 40 + Math.sin(x * 0.011 - t * 0.3) * 15;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `hsla(${140 + b * 30}, 90%, 60%, ${0.18 - b * 0.04})`;
          ctx.lineWidth = 60 - b * 14;
          ctx.filter = 'blur(18px)';
          ctx.stroke();
          ctx.filter = 'none';
        }
      }

      // Clouds
      for (const c of clouds) {
        const x = ((c.x + t * c.v) % 1.3) * (w + 400) - 200;
        const y = c.y * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 160 * c.s);
        g.addColorStop(0, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, 220 * c.s, 60 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ridgelines (parallax — nearer layers move faster: the "flyover")
      scene.layers.forEach((color, li) => {
        const speed = 18 + li * 34;
        const base = h * (0.5 + li * 0.12);
        const amp = 50 + li * 26;
        const offset = t * speed;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base + ridge(x + offset, li * 13.7, amp));
        ctx.lineTo(w, h);
        ctx.closePath();
        const lg = ctx.createLinearGradient(0, base - amp, 0, h);
        lg.addColorStop(0, color);
        lg.addColorStop(1, '#000');
        ctx.fillStyle = lg;
        ctx.fill();
        // atmospheric haze between layers
        ctx.fillStyle = `rgba(255,255,255,${0.035 * (3 - li)})`;
        ctx.fillRect(0, base - amp, w, h);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [scene]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full animate-fade-in" />;
}
