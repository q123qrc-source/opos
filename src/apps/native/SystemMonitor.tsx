/**
 * System Monitor — CPU / memory telemetry and the OPOS process table.
 * Real data from the Electron main process (os + app.getAppMetrics) when available; a simulated
 * model in the browser preview. One measure per chart (no dual axes), hover crosshair + tooltip.
 */
import { useMemo, useRef, useState } from 'react';
import { Cpu, MemoryStick, Activity, X, Layers, Clock } from 'lucide-react';
import type { AppProps } from '../../types';
import { bridge, isElectron, type SystemStats } from '../../lib/bridge';
import { useOS } from '../../store/useOS';
import { getApp } from '../manifest';
import { AppIcon } from '../../components/AppIcon';
import { useInterval, cx } from '../../lib/hooks';
import { formatBytes } from '../../lib/vfs';

const HISTORY = 60;

interface Sample {
  t: number;
  cpu: number;
  mem: number; // percent
  memUsed: number;
}

function simulate(prev: Sample | undefined, procs: number): SystemStats {
  const total = 16 * 1024 ** 3;
  const target = 8 + procs * 4 + Math.random() * 18;
  const cpu = prev ? prev.cpu * 0.6 + target * 0.4 : target;
  const used = total * (0.32 + procs * 0.025 + Math.random() * 0.01);
  const cores = navigator.hardwareConcurrency || 8;
  return {
    cpu,
    perCore: Array.from({ length: cores }, () => Math.max(0, Math.min(100, cpu + (Math.random() - 0.5) * 30))),
    cpuModel: `Virtual CPU (${cores} threads)`,
    memTotal: total,
    memFree: total - used,
    uptime: performance.now() / 1000,
    loadavg: [cpu / 25, cpu / 28, cpu / 30],
    platform: navigator.platform,
    hostname: 'opos-preview',
    metrics: [],
  };
}

export default function SystemMonitor({ mode }: AppProps) {
  const processes = useOS((s) => s.processes);
  const close = useOS((s) => s.close);
  const [tab, setTab] = useState<'performance' | 'processes'>('performance');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);

  useInterval(async () => {
    let s: SystemStats;
    try {
      s = isElectron ? await bridge.system.stats() : simulate(samples[samples.length - 1], processes.length);
    } catch {
      s = simulate(samples[samples.length - 1], processes.length);
    }
    setStats(s);
    const memUsed = s.memTotal - s.memFree;
    setSamples((list) => [...list, { t: Date.now(), cpu: s.cpu, mem: (memUsed / s.memTotal) * 100, memUsed }].slice(-HISTORY));
  }, 1000);

  const last = samples[samples.length - 1];
  const compact = mode === 'mobile';

  return (
    <div className="flex h-full flex-col bg-[#0d0f17] text-white">
      <div className="flex items-center gap-1 border-b border-white/5 px-3 py-2">
        {(['performance', 'processes'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('rounded-md px-3 py-1.5 text-[13px] capitalize', tab === t ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5')}>
            {t}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-white/35">{isElectron ? 'Live · Electron main process' : 'Simulated · browser preview'}</span>
      </div>

      {tab === 'performance' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className={cx('mb-4 grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
            <Tile icon={Cpu} label="CPU" value={last ? `${last.cpu.toFixed(0)}%` : '—'} sub={stats?.cpuModel ?? ''} />
            <Tile icon={MemoryStick} label="Memory" value={last ? `${last.mem.toFixed(0)}%` : '—'} sub={stats ? `${formatBytes(last?.memUsed ?? 0)} / ${formatBytes(stats.memTotal)}` : ''} />
            <Tile icon={Layers} label="OPOS apps" value={String(processes.length)} sub={`${stats?.metrics.length ?? 0} Chromium processes`} />
            <Tile icon={Clock} label="Uptime" value={stats ? `${(stats.uptime / 3600).toFixed(1)} h` : '—'} sub={stats ? `Load ${stats.loadavg.map((l) => l.toFixed(2)).join(' · ')}` : ''} />
          </div>
          <div className={cx('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-2')}>
            <ChartCard title="CPU utilization" unit="%" color="#38bdf8" data={samples.map((s) => ({ t: s.t, v: s.cpu }))} />
            <ChartCard title="Memory in use" unit="%" color="#a78bfa" data={samples.map((s) => ({ t: s.t, v: s.mem }))} />
          </div>
          {stats && (
            <div className="mt-4 rounded-xl border border-white/5 bg-white/[.03] p-4">
              <div className="mb-3 text-[13px] font-medium text-white/80">Per-thread load</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
                {stats.perCore.map((c, i) => (
                  <div key={i} className="group relative" title={`Thread ${i}: ${c.toFixed(0)}%`}>
                    <div className="flex h-16 items-end overflow-hidden rounded-md bg-white/[.04]">
                      <div className="w-full rounded-t bg-sky-400/80 transition-all duration-700" style={{ height: `${Math.max(2, c)}%` }} />
                    </div>
                    <div className="mt-1 text-center text-[10px] text-white/45">
                      #{i} · {c.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-[#121520] text-[11px] text-white/45">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">CPU</th>
                <th className="px-4 py-2 text-right font-medium">Memory</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {processes.map((p, i) => {
                const app = getApp(p.appId)!;
                const estCpu = last ? (last.cpu / Math.max(1, processes.length)) * (0.6 + ((i * 37) % 10) / 12) : 0;
                return (
                  <tr key={p.pid} className="border-t border-white/5 hover:bg-white/[.03]">
                    <td className="flex items-center gap-2.5 px-4 py-2">
                      <AppIcon app={app} size={20} />
                      <span className="truncate">{p.title}</span>
                    </td>
                    <td className="px-4 py-2 text-white/50">{app.kind === 'webview' ? 'Webview guest' : 'Native app'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white/70">{estCpu.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white/70">{(app.kind === 'webview' ? 180 : 24) + ((i * 13) % 40)} MB</td>
                    <td className="px-2">
                      <button onClick={() => close(p.pid)} className="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300" aria-label={`End ${p.title}`} title="End task">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {stats?.metrics.map((m) => (
                <tr key={m.pid} className="border-t border-white/5 text-white/55">
                  <td className="flex items-center gap-2.5 px-4 py-2">
                    <Activity size={16} className="text-white/35" /> {m.name}
                  </td>
                  <td className="px-4 py-2">Chromium · {m.type} · PID {m.pid}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.cpu.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBytes(m.memoryKB * 1024)}</td>
                  <td />
                </tr>
              ))}
              {processes.length === 0 && !stats?.metrics.length && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-white/35">
                    No running apps
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Cpu; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[.03] p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-white/50">
        <Icon size={13} /> {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="truncate text-[11px] text-white/40">{sub}</div>
    </div>
  );
}

/** Single-series area chart with a fixed 0–100 axis and a hover crosshair + tooltip. */
function ChartCard({ title, unit, color, data }: { title: string; unit: string; color: string; data: { t: number; v: number }[] }) {
  const W = 600;
  const H = 180;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => {
    const offset = HISTORY - data.length;
    return data.map((d, i) => ({ x: ((offset + i) / (HISTORY - 1)) * W, y: H - (Math.min(100, Math.max(0, d.v)) / 100) * H, d }));
  }, [data]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z` : '';
  const h = hover != null ? pts[hover] : null;
  const gid = `g-${title.replace(/\W/g, '')}`;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[.03] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-white/85">{title}</span>
        <span className="text-[11px] text-white/40">last 60 s · 0–100{unit}</span>
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-40 w-full overflow-visible"
          onPointerMove={(e) => {
            const r = ref.current!.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            pts.forEach((p, i) => Math.abs(p.x - x) < Math.abs(pts[best].x - x) && (best = i));
            setHover(pts.length ? best : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.35" />
              <stop offset="1" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1="0" x2={W} y1={H - (g / 100) * H} y2={H - (g / 100) * H} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={H} y2={H} stroke="rgba(255,255,255,.15)" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {h && <line x1={h.x} x2={h.x} y1="0" y2={H} stroke="rgba(255,255,255,.35)" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
        </svg>
        {h && (
          <>
            <div className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0d0f17]" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / H) * 100}%`, background: color }} />
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-[#1a1d2b] px-2 py-1 text-[11px] shadow-lg" style={{ left: `${Math.min(88, Math.max(12, (h.x / W) * 100))}%` }}>
              <span className="font-semibold text-white">{h.d.v.toFixed(1)}{unit}</span>
              <span className="ml-1.5 text-white/45">{new Date(h.d.t).toLocaleTimeString()}</span>
            </div>
          </>
        )}
        <div className="pointer-events-none absolute right-0 top-0 flex h-40 flex-col justify-between text-[10px] text-white/30">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
      </div>
    </div>
  );
}
