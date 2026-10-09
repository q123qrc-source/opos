/** Mobile Browser — compact browser with a top URL bar and bottom toolbar. */
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Share, Lock, Home, X } from 'lucide-react';
import type { AppProps } from '../../types';
import { WebviewContainer, type WebHandle } from '../../components/WebviewContainer';
import { cx } from '../../lib/hooks';

export const HOME_URL = 'https://en.m.wikipedia.org/wiki/Special:Random';

export function normalizeUrl(input: string) {
  const v = input.trim();
  if (!v) return HOME_URL;
  if (/^[a-z]+:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(v)}`;
}

const SHORTCUTS = [
  { label: 'Wikipedia', url: 'https://en.m.wikipedia.org' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'OSM', url: 'https://www.openstreetmap.org' },
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
];

export default function MobileBrowser({ pid }: AppProps) {
  const ref = useRef<WebHandle>(null);
  const [url, setUrl] = useState(HOME_URL);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0.1);
  const [title, setTitle] = useState('');

  const go = (raw: string) => {
    const next = normalizeUrl(raw);
    ref.current?.loadURL(next);
    setUrl(next);
    setEditing(false);
  };
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep raw */
  }

  return (
    <div className="flex h-full flex-col bg-[#1c1c1e] text-white">
      <div className="px-3 pb-2 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(input);
          }}
          className="relative flex items-center gap-2 overflow-hidden rounded-xl bg-[#2c2c2e] px-3 py-2"
        >
          {!editing && <Lock size={13} className="text-white/50" />}
          <input
            value={editing ? input : host}
            onFocus={(e) => {
              setEditing(true);
              setInput(url);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setTimeout(() => setEditing(false), 150)}
            onChange={(e) => setInput(e.target.value)}
            className={cx('flex-1 bg-transparent text-[15px] outline-none', !editing && 'text-center')}
            placeholder="Search or enter website"
            inputMode="url"
          />
          {editing ? (
            <button type="button" onClick={() => setInput('')} aria-label="Clear">
              <X size={16} className="text-white/50" />
            </button>
          ) : (
            <button type="button" onClick={() => ref.current?.reload()} aria-label="Reload">
              <RotateCw size={15} className="text-white/70" />
            </button>
          )}
          {loading && <div className="absolute bottom-0 left-0 h-[2px] bg-[#0a84ff] transition-all" style={{ width: `${progress * 100}%` }} />}
        </form>
        {editing && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {SHORTCUTS.map((s) => (
              <button key={s.url} onMouseDown={(e) => e.preventDefault()} onClick={() => go(s.url)} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-[11px]">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-base font-bold">{s.label[0]}</span>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <WebviewContainer
          ref={ref}
          pid={pid}
          src={HOME_URL}
          onUrl={setUrl}
          onTitle={setTitle}
          onLoading={setLoading}
          onProgress={setProgress}
          userAgent="Mozilla/5.0 (Linux; Android 14; OPOS Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
        />
      </div>
      <div className="grid grid-cols-5 border-t border-white/10 py-2.5 text-[#0a84ff]">
        <button className="grid place-items-center" onClick={() => ref.current?.goBack()} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <button className="grid place-items-center" onClick={() => ref.current?.goForward()} aria-label="Forward">
          <ChevronRight size={24} />
        </button>
        <button className="grid place-items-center" onClick={() => navigator.share?.({ url, title }).catch(() => navigator.clipboard?.writeText(url))} aria-label="Share">
          <Share size={20} />
        </button>
        <button className="grid place-items-center" onClick={() => go(HOME_URL)} aria-label="Home">
          <Home size={20} />
        </button>
        <button className="grid place-items-center" onClick={() => ref.current?.reload()} aria-label="Reload">
          <RotateCw size={19} />
        </button>
      </div>
    </div>
  );
}
