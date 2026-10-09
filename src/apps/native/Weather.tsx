/** Weather Station — live Open-Meteo forecast in massive typography. */
import { MapPin, RefreshCw, Droplets, Wind, Thermometer } from 'lucide-react';
import type { AppProps } from '../../types';
import { CITIES, describe, useWeather } from '../../lib/weather';
import { cx, useClock, useTimeFormat } from '../../lib/hooks';

const SKY: Record<string, string> = {
  clear: 'linear-gradient(160deg, #0ea5e9 0%, #2563eb 45%, #0b1020 100%)',
  cloud: 'linear-gradient(160deg, #64748b 0%, #334155 50%, #0b1020 100%)',
  rain: 'linear-gradient(160deg, #1e3a8a 0%, #1e293b 55%, #05070d 100%)',
  snow: 'linear-gradient(160deg, #94a3b8 0%, #475569 50%, #0b1020 100%)',
  storm: 'linear-gradient(160deg, #312e81 0%, #1e1b4b 50%, #05070d 100%)',
  night: 'linear-gradient(160deg, #1e1b4b 0%, #0f172a 55%, #020617 100%)',
};

function skyFor(code: number, isDay: boolean) {
  if (!isDay) return SKY.night;
  if (code >= 95) return SKY.storm;
  if (code >= 71 && code < 80) return SKY.snow;
  if (code >= 51) return SKY.rain;
  if (code >= 2) return SKY.cloud;
  return SKY.clear;
}

export default function Weather({ mode }: AppProps) {
  const w = useWeather();
  const now = useClock(30000);
  const fmt = useTimeFormat();
  const big = mode === 'tv';
  const mobile = mode === 'mobile';
  const c = w.current;

  return (
    <div className="relative h-full overflow-y-auto text-white transition-[background] duration-1000" style={{ background: c ? skyFor(c.code, c.isDay) : SKY.night }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(255,255,255,.25),transparent_40%)]" />
      <div className={cx('relative flex min-h-full flex-col', big ? 'px-20 py-14' : mobile ? 'px-5 py-6' : 'px-10 py-8')}>
        {/* City selector */}
        <div className={cx('no-scrollbar flex gap-2 overflow-x-auto', big && 'gap-4 py-3')} data-nav-group="cities">
          {CITIES.map((city, i) => (
            <button
              key={city.name}
              onClick={() => w.setCity(i)}
              data-autofocus={i === w.cityIndex ? '' : undefined}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-full transition', big ? 'px-7 py-3 text-2xl' : 'px-3.5 py-1.5 text-xs', i === w.cityIndex ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25')}
            >
              {i === w.cityIndex && <MapPin size={big ? 22 : 13} />} {city.name}
            </button>
          ))}
          <button onClick={() => void w.refresh()} className={cx('ml-auto shrink-0 rounded-full bg-white/15 hover:bg-white/25', big ? 'p-4' : 'p-2')} aria-label="Refresh">
            <RefreshCw size={big ? 26 : 14} className={w.loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Hero */}
        <div className={cx('flex flex-1', mobile ? 'flex-col items-center pt-10 text-center' : 'items-center gap-12 pt-8')}>
          <div>
            <div className={cx('font-semibold text-white/80', big ? 'text-5xl' : mobile ? 'text-3xl' : 'text-3xl')}>{w.city}</div>
            <div className={cx('font-thin leading-none tracking-tighter', big ? 'text-[min(22vw,26rem)]' : mobile ? 'text-[7.5rem]' : 'text-[clamp(6rem,14vw,12rem)]')}>
              {c ? Math.round(c.temp) : '--'}°
            </div>
            <div className={cx('font-medium', big ? 'text-5xl' : 'text-2xl')}>
              {c?.emoji} {c?.label ?? 'Loading…'}
            </div>
            <div className={cx('mt-2 text-white/60', big ? 'text-2xl' : 'text-sm')}>
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · {fmt(now)} · {w.source === 'live' ? 'Open-Meteo live' : 'Offline estimate'}
            </div>
          </div>
          {c && (
            <div className={cx('grid gap-3', mobile ? 'mt-8 w-full grid-cols-3' : 'ml-auto grid-cols-1')}>
              {[
                { icon: Thermometer, label: 'Feels like', value: `${Math.round(c.feels)}°` },
                { icon: Droplets, label: 'Humidity', value: `${c.humidity}%` },
                { icon: Wind, label: 'Wind', value: `${Math.round(c.wind)} km/h` },
              ].map((s) => (
                <div key={s.label} className={cx('glass-light rounded-2xl', big ? 'min-w-[22rem] px-8 py-6' : 'px-4 py-3')}>
                  <div className={cx('flex items-center gap-2 text-white/60', big ? 'text-xl' : 'text-xs')}>
                    <s.icon size={big ? 24 : 14} /> {s.label}
                  </div>
                  <div className={cx('font-semibold', big ? 'text-5xl' : 'text-xl')}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly */}
        <div className={cx('glass-light mt-8 rounded-3xl', big ? 'p-8' : 'p-4')}>
          <div className={cx('mb-3 font-semibold uppercase tracking-wider text-white/60', big ? 'text-xl' : 'text-[11px]')}>Next 24 hours</div>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {w.hourly.map((h, i) => (
              <div key={i} className={cx('flex shrink-0 flex-col items-center gap-1', big ? 'w-28 text-2xl' : 'w-14 text-sm')}>
                <span className="text-white/60">{i === 0 ? 'Now' : h.time.toLocaleTimeString([], { hour: 'numeric' })}</span>
                <span className={big ? 'text-4xl' : 'text-xl'}>{describe(h.code)[1]}</span>
                <span className="font-semibold">{Math.round(h.temp)}°</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily */}
        <div className={cx('glass-light mt-4 rounded-3xl', big ? 'p-8' : 'p-4')}>
          <div className={cx('mb-2 font-semibold uppercase tracking-wider text-white/60', big ? 'text-xl' : 'text-[11px]')}>7-day forecast</div>
          {(() => {
            const lo = Math.min(...w.daily.map((d) => d.min));
            const hi = Math.max(...w.daily.map((d) => d.max));
            return w.daily.map((d, i) => (
              <div key={i} className={cx('grid grid-cols-[5rem_2.5rem_3rem_1fr_3rem] items-center gap-3 border-t border-white/10 first:border-0', big ? 'grid-cols-[10rem_4rem_6rem_1fr_6rem] py-4 text-3xl' : 'py-2 text-sm')}>
                <span>{i === 0 ? 'Today' : d.date.toLocaleDateString([], { weekday: 'short' })}</span>
                <span>{describe(d.code)[1]}</span>
                <span className="text-right text-white/50">{Math.round(d.min)}°</span>
                <div className={cx('relative rounded-full bg-black/25', big ? 'h-2.5' : 'h-1.5')}>
                  <div
                    className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-300 via-yellow-300 to-orange-400"
                    style={{ left: `${((d.min - lo) / (hi - lo || 1)) * 100}%`, right: `${100 - ((d.max - lo) / (hi - lo || 1)) * 100}%` }}
                  />
                </div>
                <span className="font-semibold">{Math.round(d.max)}°</span>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
