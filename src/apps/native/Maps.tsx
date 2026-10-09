/** Maps — OpenStreetMap embed with Nominatim place search, saved places and geolocation. */
import { useMemo, useState } from 'react';
import { Search, Locate, MapPin, Plus, Minus, Navigation, Loader2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { WebviewContainer } from '../../components/WebviewContainer';
import { usePersistentState, cx } from '../../lib/hooks';

interface Place {
  name: string;
  lat: number;
  lon: number;
}

const SAVED: Place[] = [
  { name: 'Golden Gate Bridge', lat: 37.8199, lon: -122.4783 },
  { name: 'Eiffel Tower', lat: 48.8584, lon: 2.2945 },
  { name: 'Shibuya Crossing', lat: 35.6595, lon: 139.7005 },
  { name: 'Sydney Opera House', lat: -33.8568, lon: 151.2153 },
  { name: 'Central Park', lat: 40.7829, lon: -73.9654 },
];

function embedUrl(p: Place, zoom: number) {
  const span = 360 / Math.pow(2, zoom);
  const bbox = [p.lon - span, p.lat - span / 2, p.lon + span, p.lat + span / 2].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lon}`;
}

export default function Maps({ pid }: AppProps) {
  const [center, setCenter] = usePersistentState<Place>('maps-center', SAVED[0]);
  const [zoom, setZoom] = usePersistentState('maps-zoom', 14);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const url = useMemo(() => embedUrl(center, zoom), [center, zoom]);

  const search = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const json = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      setResults(json.map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) })));
      if (!json.length) setMsg('No places found');
    } catch {
      const local = SAVED.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      setResults(local);
      setMsg(local.length ? 'Offline — showing saved places' : 'Search unavailable offline');
    } finally {
      setBusy(false);
    }
  };

  const go = (p: Place) => {
    setCenter(p);
    setResults([]);
    setQuery(p.name.split(',')[0]);
    setSheet(false);
  };

  const locate = () => {
    if (!navigator.geolocation) return setMsg('Geolocation unavailable');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        go({ name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude });
        setZoom(16);
      },
      (err) => {
        setBusy(false);
        setMsg(err.message || 'Location permission denied');
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="relative h-full overflow-hidden bg-[#aad3df]">
      <WebviewContainer key={url} pid={pid} src={url} className="absolute inset-0" />

      {/* Search */}
      <div className="absolute inset-x-3 top-3 z-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
          className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-black shadow-xl"
        >
          {busy ? <Loader2 size={18} className="animate-spin text-teal-600" /> : <Search size={18} className="text-black/50" />}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Maps" className="flex-1 bg-transparent text-[15px] outline-none" />
        </form>
        {(results.length > 0 || msg) && (
          <div className="mt-2 overflow-hidden rounded-2xl bg-white text-black shadow-xl">
            {msg && <div className="px-4 py-2 text-xs text-black/50">{msg}</div>}
            {results.map((r, i) => (
              <button key={i} onClick={() => go(r)} className="flex w-full items-start gap-3 border-t border-black/5 px-4 py-3 text-left hover:bg-black/5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-red-500" />
                <span className="line-clamp-2 text-sm">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col overflow-hidden rounded-xl bg-white text-black shadow-xl">
        <button className="p-3 hover:bg-black/5" onClick={() => setZoom(Math.min(19, zoom + 1))} aria-label="Zoom in">
          <Plus size={18} />
        </button>
        <button className="border-t border-black/10 p-3 hover:bg-black/5" onClick={() => setZoom(Math.max(3, zoom - 1))} aria-label="Zoom out">
          <Minus size={18} />
        </button>
        <button className="border-t border-black/10 p-3 text-blue-600 hover:bg-black/5" onClick={locate} aria-label="My location">
          <Locate size={18} />
        </button>
      </div>

      {/* Bottom sheet */}
      <div className={cx('absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white text-black shadow-[0_-10px_40px_rgba(0,0,0,.25)] transition-all duration-300', sheet ? 'h-[55%]' : 'h-24')}>
        <button className="flex w-full flex-col items-center pt-2" onClick={() => setSheet(!sheet)}>
          <span className="h-1.5 w-10 rounded-full bg-black/20" />
        </button>
        <div className="flex items-center gap-3 px-5 pt-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{center.name.split(',')[0]}</div>
            <div className="text-xs text-black/50">
              {center.lat.toFixed(4)}, {center.lon.toFixed(4)} · zoom {zoom}
            </div>
          </div>
          <a href={`https://www.openstreetmap.org/directions?to=${center.lat},${center.lon}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            <Navigation size={14} /> Go
          </a>
        </div>
        {sheet && (
          <div className="mt-4 overflow-y-auto px-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/40">Saved places</div>
            {SAVED.map((p) => (
              <button key={p.name} onClick={() => go(p)} className="flex w-full items-center gap-3 border-b border-black/5 py-3 text-left">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-teal-100 text-teal-700">
                  <MapPin size={16} />
                </div>
                <span className="text-sm">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
