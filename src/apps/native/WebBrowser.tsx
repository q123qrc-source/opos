/** Web Browser — a desktop-class tabbed browser; every tab is its own webview. */
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, X, Lock, Star, Globe, Home, Search } from 'lucide-react';
import type { AppProps } from '../../types';
import { WebviewContainer, type WebHandle } from '../../components/WebviewContainer';
import { normalizeUrl } from './MobileBrowser';
import { usePersistentState, cx } from '../../lib/hooks';

interface Tab {
  id: number;
  url: string;
  title: string;
  loading: boolean;
  ntp: boolean;
}

const QUICK = [
  { name: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#e5e7eb' },
  { name: 'GitHub', url: 'https://github.com', color: '#a78bfa' },
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#f87171' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', color: '#fb923c' },
  { name: 'MDN', url: 'https://developer.mozilla.org', color: '#60a5fa' },
  { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org', color: '#4ade80' },
  { name: 'Electron', url: 'https://www.electronjs.org', color: '#22d3ee' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', color: '#fbbf24' },
];

let tabSeq = 1;

export default function WebBrowser({ pid }: AppProps) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: tabSeq++, url: '', title: 'New Tab', loading: false, ntp: true }]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const [bookmarks, setBookmarks] = usePersistentState<string[]>('browser-bookmarks', ['https://www.wikipedia.org', 'https://github.com']);
  const handles = useRef(new Map<number, WebHandle | null>());
  const active = tabs.find((t) => t.id === activeId)!;

  const patch = (id: number, p: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const navigate = (raw: string) => {
    const url = normalizeUrl(raw);
    if (active.ntp) patch(active.id, { ntp: false, url, title: url, loading: true });
    else handles.current.get(active.id)?.loadURL(url);
    patch(active.id, { url });
    setEditing(false);
  };

  const newTab = () => {
    const t: Tab = { id: tabSeq++, url: '', title: 'New Tab', loading: false, ntp: true };
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
    setEditing(true);
    setAddress('');
  };
  const closeTab = (id: number) => {
    setTabs((ts) => {
      const idx = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (!next.length) {
        const fresh: Tab = { id: tabSeq++, url: '', title: 'New Tab', loading: false, ntp: true };
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[Math.min(idx, next.length - 1)].id);
      return next;
    });
    handles.current.delete(id);
  };

  const bookmarked = bookmarks.includes(active.url);

  return (
    <div
      className="flex h-full flex-col bg-[#1b1d27] text-white"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 't') {
          e.preventDefault();
          newTab();
        } else if (e.ctrlKey && e.key === 'w') {
          e.preventDefault();
          closeTab(activeId);
        } else if (e.ctrlKey && e.key === 'l') {
          e.preventDefault();
          setEditing(true);
          setAddress(active.url);
        }
      }}
    >
      {/* Tab strip */}
      <div className="no-scrollbar flex h-10 shrink-0 items-end gap-1 overflow-x-auto bg-[#12131a] px-2 pt-1.5">
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveId(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
            className={cx('group flex h-full w-52 min-w-[7rem] shrink cursor-default items-center gap-2 rounded-t-lg px-3 text-[12px]', t.id === activeId ? 'bg-[#1b1d27] text-white' : 'text-white/55 hover:bg-white/5')}
          >
            {t.loading ? <RotateCw size={13} className="shrink-0 animate-spin text-os-accent" /> : <Globe size={13} className="shrink-0 text-white/50" />}
            <span className="flex-1 truncate">{t.title || t.url}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              className="rounded p-0.5 opacity-60 hover:bg-white/15 hover:opacity-100"
              aria-label="Close tab"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button onClick={newTab} className="mb-1 rounded-md p-1.5 text-white/60 hover:bg-white/10" aria-label="New tab">
          <Plus size={15} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <button onClick={() => handles.current.get(activeId)?.goBack()} className="rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => handles.current.get(activeId)?.goForward()} className="rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Forward">
          <ArrowRight size={16} />
        </button>
        <button onClick={() => handles.current.get(activeId)?.reload()} className="rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Reload">
          <RotateCw size={15} />
        </button>
        <button onClick={() => patch(activeId, { ntp: true, title: 'New Tab', url: '' })} className="rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Home">
          <Home size={15} />
        </button>
        <form
          className="mx-1 flex flex-1 items-center gap-2 rounded-full bg-[#2a2d3b] px-4 py-1.5 focus-within:ring-2 focus-within:ring-os-accent/60"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
          }}
        >
          {active.ntp ? <Search size={13} className="text-white/40" /> : <Lock size={13} className="text-emerald-400" />}
          <input
            value={editing ? address : active.url}
            onFocus={(e) => {
              setEditing(true);
              setAddress(active.url);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Search DuckDuckGo or type a URL"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-white/35"
          />
          {!active.ntp && (
            <button type="button" onClick={() => setBookmarks((b) => (bookmarked ? b.filter((x) => x !== active.url) : [...b, active.url]))} aria-label="Bookmark">
              <Star size={14} className={bookmarked ? 'fill-amber-300 text-amber-300' : 'text-white/45'} />
            </button>
          )}
        </form>
      </div>

      {/* Bookmarks bar */}
      <div className="flex shrink-0 gap-1 border-b border-white/5 px-3 pb-1.5 text-[12px]">
        {bookmarks.map((b) => (
          <button key={b} onClick={() => navigate(b)} className="flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-2 py-0.5 text-white/65 hover:bg-white/10">
            <Globe size={12} /> {b.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </button>
        ))}
      </div>

      {/* Content: every tab keeps its webview alive */}
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <div key={t.id} className={cx('absolute inset-0', t.id !== activeId && 'invisible')}>
            {t.ntp ? (
              <NewTabPage onGo={(u) => navigate(u)} />
            ) : (
              <WebviewContainer
                ref={(h) => handles.current.set(t.id, h)}
                pid={pid}
                src={t.url}
                active={t.id === activeId}
                onTitle={(title) => patch(t.id, { title })}
                onUrl={(url) => patch(t.id, { url })}
                onLoading={(loading) => patch(t.id, { loading })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewTabPage({ onGo }: { onGo: (u: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,#2a2d4a,#1b1d27_60%)] p-6">
      <div className="text-5xl font-black tracking-tight">
        OPOS<span className="text-os-accent">.</span>web
      </div>
      <form
        className="flex w-full max-w-xl items-center gap-3 rounded-full bg-white px-5 py-3 text-black shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          onGo(q);
        }}
      >
        <Search size={18} className="text-black/40" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the web" className="flex-1 bg-transparent outline-none" />
      </form>
      <div className="grid grid-cols-4 gap-4">
        {QUICK.map((s) => (
          <button key={s.url} onClick={() => onGo(s.url)} className="flex w-24 flex-col items-center gap-2 rounded-xl p-3 hover:bg-white/10">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-lg font-bold" style={{ color: s.color }}>
              {s.name[0]}
            </span>
            <span className="truncate text-[12px] text-white/75">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
