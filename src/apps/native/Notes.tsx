/** Notes — fullscreen textarea notes with debounced auto-save into the VFS (~/Documents/Notes). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, Search, Trash2, Check, Share } from 'lucide-react';
import type { AppProps } from '../../types';
import { HOME, basename, listDir, useFs } from '../../lib/vfs';
import { useBackHandler } from '../../lib/backStack';
import { cx } from '../../lib/hooks';

const DIR = `${HOME}/Documents/Notes`;

export default function Notes({ pid, mode, params }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const { write, remove, mkdir } = useFs.getState();
  const [open, setOpen] = useState<string | null>((params?.path as string) ?? null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!nodes[DIR]) {
      mkdir(DIR);
      write(`${DIR}/Welcome.txt`, 'Welcome to Notes ✍️\n\nEverything you type is saved automatically to ~/Documents/Notes — open the File Explorer or Terminal to see it.');
      write(`${DIR}/Shopping.txt`, 'Shopping\n- Coffee beans\n- Oat milk\n- HDMI 2.1 cable\n- AA batteries for the remote');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (params?.path) setOpen(params.path as string);
  }, [params?.path]);

  useBackHandler(pid, () => {
    if (open) {
      setOpen(null);
      return true;
    }
    return false;
  });

  const notes = useMemo(
    () =>
      listDir(nodes, DIR)
        .filter((f) => f.node.type === 'file')
        .filter((f) => !query || (f.node.content ?? '').toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.node.mtime - a.node.mtime),
    [nodes, query],
  );

  const create = () => {
    const path = `${DIR}/Note ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    write(path, '');
    setOpen(path);
  };

  const wide = mode === 'desktop';
  const list = (
    <div className={cx('flex h-full flex-col bg-[#1c1c1e]', wide && 'w-72 shrink-0 border-r border-white/10')}>
      <div className="flex items-center justify-between px-4 pt-5">
        <h1 className="text-3xl font-bold text-white">Notes</h1>
        <button onClick={create} className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" aria-label="New note">
          <Plus size={22} />
        </button>
      </div>
      <div className="mx-4 my-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
        <Search size={15} className="text-white/40" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40" />
      </div>
      <div className="mx-4 flex-1 overflow-y-auto rounded-xl">
        {notes.map((n) => {
          const [first, ...rest] = (n.node.content ?? '').split('\n');
          return (
            <button key={n.path} onClick={() => setOpen(n.path)} className={cx('block w-full border-b border-white/10 bg-[#2c2c2e] px-4 py-2.5 text-left', open === n.path && 'bg-[#ffd60a]/20')}>
              <div className="truncate font-semibold text-white">{first || 'New Note'}</div>
              <div className="truncate text-sm text-white/45">
                {new Date(n.node.mtime).toLocaleDateString()} &nbsp;{rest.join(' ').trim() || 'No additional text'}
              </div>
            </button>
          );
        })}
      </div>
      <div className="py-3 text-center text-xs text-white/40">{notes.length} Notes</div>
    </div>
  );

  if (!wide && !open) return list;
  return (
    <div className="flex h-full bg-[#1c1c1e]">
      {wide && list}
      {open && nodes[open] ? (
        <Editor key={open} path={open} initial={nodes[open].content ?? ''} onBack={wide ? undefined : () => setOpen(null)} onDelete={() => { remove(open); setOpen(null); }} />
      ) : (
        <div className="grid flex-1 place-items-center text-white/30">Select or create a note</div>
      )}
    </div>
  );
}

function Editor({ path, initial, onBack, onDelete }: { path: string; initial: string; onBack?: () => void; onDelete: () => void }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number>();
  const write = useFs((s) => s.write);
  const latest = useRef(text);
  latest.current = text;

  const onChange = (v: string) => {
    setText(v);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      write(path, v);
      setSaved(true);
    }, 500);
  };

  // Flush on unmount so nothing is lost when switching notes or closing the app.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (useFs.getState().nodes[path] && useFs.getState().nodes[path].content !== latest.current) write(path, latest.current);
    },
    [path, write],
  );

  return (
    <div className="flex min-w-0 flex-1 animate-fade-in flex-col bg-[#1c1c1e] text-white">
      <div className="flex items-center gap-2 px-3 py-2">
        {onBack && (
          <button onClick={onBack} className="flex items-center text-[#ffd60a]" aria-label="Back">
            <ChevronLeft size={26} /> Notes
          </button>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-white/40">{saved ? <><Check size={13} /> Saved</> : 'Saving…'}</span>
        <button className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(text)} aria-label="Copy note">
          <Share size={18} />
        </button>
        <button className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" onClick={onDelete} aria-label="Delete note">
          <Trash2 size={18} />
        </button>
      </div>
      <div className="px-5 text-center text-xs text-white/35">{basename(path)}</div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing…"
        spellCheck
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-3 text-[17px] leading-relaxed outline-none placeholder:text-white/25 [&::first-line]:text-2xl [&::first-line]:font-bold"
      />
    </div>
  );
}
