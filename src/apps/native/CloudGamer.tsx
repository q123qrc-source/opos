/** Cloud Gamer — controller-first launcher for cloud gaming services, running in webviews. */
import { useEffect, useState } from 'react';
import { Gamepad2, Wifi, Gauge, ArrowLeft } from 'lucide-react';
import type { AppProps } from '../../types';
import { WebviewContainer } from '../../components/WebviewContainer';
import { useBackHandler } from '../../lib/backStack';
import { useInterval, cx } from '../../lib/hooks';

const SERVICES = [
  { id: 'xbox', name: 'Xbox Cloud Gaming', url: 'https://www.xbox.com/play', color: '#107c10', blurb: 'Hundreds of Game Pass titles streamed instantly.' },
  { id: 'gfn', name: 'GeForce NOW', url: 'https://play.geforcenow.com', color: '#76b900', blurb: 'Your PC library, RTX-powered in the cloud.' },
  { id: 'luna', name: 'Amazon Luna', url: 'https://luna.amazon.com', color: '#7b2ff7', blurb: 'Channels of games, ready to play.' },
  { id: 'boosteroid', name: 'Boosteroid', url: 'https://cloud.boosteroid.com', color: '#ff5a00', blurb: 'Play AAA games on any device.' },
];

const GAMES = ['Forza Horizon', 'Halo Infinite', 'Starfield', 'Cyberpunk 2077', 'Fortnite', 'Hollow Knight', 'Sea of Thieves', 'Cities: Skylines'];

function useGamepads() {
  const [pads, setPads] = useState<{ id: string; buttons: number; axes: number[] }[]>([]);
  useInterval(() => {
    const list = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
    setPads(list.map((p) => ({ id: p.id, buttons: p.buttons.filter((b) => b.pressed).length, axes: p.axes.slice(0, 2).map((a) => Math.round(a * 100) / 100) })));
  }, 200);
  return pads;
}

export default function CloudGamer({ mode, pid }: AppProps) {
  const big = mode === 'tv';
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null);
  const pads = useGamepads();
  const [latency, setLatency] = useState<number | null>(null);

  useBackHandler(pid, () => {
    if (service) {
      setService(null);
      return true;
    }
    return false;
  });

  // Rough network latency probe (HEAD-less fetch timing against the selected service origin).
  useEffect(() => {
    let alive = true;
    const probe = async () => {
      const t = performance.now();
      try {
        await fetch('https://www.xbox.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
        if (alive) setLatency(Math.round(performance.now() - t));
      } catch {
        if (alive) setLatency(null);
      }
    };
    void probe();
    const id = setInterval(probe, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (service) {
    return (
      <div className="relative flex h-full flex-col bg-black">
        <WebviewContainer pid={pid} src={service.url} remoteProfile="none" className="flex-1" />
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
          <Gamepad2 size={14} className={pads.length ? 'text-emerald-400' : 'text-white/40'} /> {pads.length ? `${pads.length} controller(s)` : 'No controller'}
          {latency != null && <span className="text-white/50">· {latency} ms</span>}
        </div>
        {!big && (
          <button className="absolute left-3 top-3 rounded-full bg-black/70 p-2 text-white hover:bg-black" onClick={() => setService(null)} aria-label="Back to services">
            <ArrowLeft size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top,#0f3d1e,#020403_60%)] text-white">
      <div className={cx(big ? 'px-20 py-14' : 'p-6')}>
        <div className="flex items-center gap-4">
          <Gamepad2 size={big ? 64 : 32} className="text-[#3ddc84]" />
          <div>
            <div className={cx('font-black', big ? 'text-6xl' : 'text-2xl')}>Cloud Gamer</div>
            <div className={cx('text-white/55', big ? 'text-2xl' : 'text-sm')}>Pick a service — your controller drives everything.</div>
          </div>
          <div className={cx('ml-auto flex gap-3', mode === 'mobile' && 'hidden')}>
            <Stat icon={Gamepad2} label="Controllers" value={pads.length ? String(pads.length) : 'None'} ok={pads.length > 0} big={big} />
            <Stat icon={Wifi} label="Network" value={navigator.onLine ? 'Online' : 'Offline'} ok={navigator.onLine} big={big} />
            <Stat icon={Gauge} label="Latency" value={latency != null ? `${latency} ms` : '—'} ok={latency != null && latency < 120} big={big} />
          </div>
        </div>

        <div className={cx('mt-10 grid', big ? 'grid-cols-4 gap-10' : mode === 'mobile' ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4 xl:grid-cols-4')} data-nav-group="services">
          {SERVICES.map((s, i) => (
            <button
              key={s.id}
              data-focusable="tile"
              data-autofocus={i === 0 ? '' : undefined}
              onClick={() => setService(s)}
              className={cx('relative flex flex-col justify-end overflow-hidden rounded-3xl text-left transition hover:-translate-y-1', big ? 'h-72 p-8' : 'h-40 p-5')}
              style={{ background: `linear-gradient(150deg, ${s.color}, #050505 85%)` }}
            >
              <Gamepad2 className="absolute right-5 top-5 opacity-30" size={big ? 96 : 56} />
              <div className={cx('font-extrabold', big ? 'text-3xl' : 'text-lg')}>{s.name}</div>
              <div className={cx('text-white/65', big ? 'text-xl' : 'text-xs')}>{s.blurb}</div>
            </button>
          ))}
        </div>

        <div className={cx('mt-10 font-bold', big ? 'text-3xl' : 'text-base')}>Popular in the cloud</div>
        <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-4" data-nav-group="games">
          {GAMES.map((g, i) => (
            <button key={g} data-focusable="tile" onClick={() => setService(SERVICES[i % 2])} className={cx('shrink-0 rounded-2xl text-left font-bold', big ? 'h-56 w-44 p-5 text-2xl' : 'h-36 w-28 p-3 text-sm')} style={{ background: `linear-gradient(${i * 45}deg, hsl(${i * 45} 70% 35%), hsl(${i * 45 + 60} 60% 12%))` }}>
              {g}
            </button>
          ))}
        </div>

        {pads.length > 0 && (
          <div className="mt-6 rounded-2xl bg-white/5 p-4 font-mono text-xs text-white/70">
            {pads.map((p) => (
              <div key={p.id}>
                🎮 {p.id} — buttons: {p.buttons} · stick: [{p.axes.join(', ')}]
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, ok, big }: { icon: typeof Gamepad2; label: string; value: string; ok: boolean; big: boolean }) {
  return (
    <div className={cx('rounded-2xl bg-white/[.06]', big ? 'px-6 py-4' : 'px-4 py-2')}>
      <div className={cx('flex items-center gap-1.5 text-white/50', big ? 'text-lg' : 'text-[11px]')}>
        <Icon size={big ? 20 : 12} /> {label}
      </div>
      <div className={cx('font-semibold', ok ? 'text-emerald-300' : 'text-white/70', big ? 'text-2xl' : 'text-sm')}>{value}</div>
    </div>
  );
}
