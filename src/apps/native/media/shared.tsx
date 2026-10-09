/** Shared media UI: generated artwork and the live audio visualizer. */
import { useEffect, useRef } from 'react';
import { audio, type Track } from '../../../lib/audioEngine';

export function Artwork({ track, className, rounded = 'rounded-xl' }: { track: Track; className?: string; rounded?: string }) {
  const seed = track.id.charCodeAt(1);
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className ?? ''}`}
      style={{ background: `linear-gradient(${seed * 40}deg, ${track.colors[0]}, ${track.colors[1]})` }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none">
        <circle cx={20 + (seed % 60)} cy={30 + (seed % 40)} r={28} fill="white" fillOpacity="0.18" />
        <circle cx={80 - (seed % 30)} cy={80} r={40} fill="black" fillOpacity="0.2" />
        <path d={`M0 ${60 + (seed % 20)} Q 50 ${20 + (seed % 30)} 100 ${70 - (seed % 10)} L100 100 L0 100Z`} fill="black" fillOpacity="0.25" />
      </svg>
      <div className="absolute bottom-[8%] left-[8%] right-[8%] text-white">
        <div className="truncate text-[min(1.4em,12cqw)] font-black uppercase leading-none tracking-tight opacity-90" style={{ fontSize: 'clamp(10px, 12%, 40px)' }}>
          {track.album}
        </div>
      </div>
    </div>
  );
}

export function Visualizer({ colors, bars = 48, className }: { colors: [string, string]; bars?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const data = new Uint8Array(128);
    let idle = 0;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (audio.analyser) audio.analyser.getByteFrequencyData(data);
      else data.fill(0);
      idle += 0.03;
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, colors[1]);
      grad.addColorStop(1, colors[0]);
      ctx.fillStyle = grad;
      const gap = 3;
      const bw = (width - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * 90)] / 255;
        if (bw <= 0) break;
        const h = Math.max(3, (v > 0.01 ? v : 0.04 + 0.03 * Math.sin(idle + i * 0.4)) * height);
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, height - h, bw, h, Math.min(3, bw / 2));
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [colors, bars]);
  return <canvas ref={ref} className={className} />;
}
