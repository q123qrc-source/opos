/** Notes — fullscreen textarea notes with debounced auto-save to ~/Documents/Notes (real files via fsapi), plus opening/exporting .txt/.md files anywhere. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, Search, Trash2, Check, Share, FileDown, FolderOpen } from 'lucide-react';
import type { AppProps } from '../../types';
import { fsapi, basename, dirname } from '../../lib/fsapi';
import { useBackHandler } from '../../lib/backStack';
import { cx } from '../../lib/hooks';
import { ErrorBanner, FileDialog, errorText, useHome } from './shared/FileDialog';

interface NoteMeta {
  path: string;
  mtime: number;
  content: string;
}

const NOTE_EXT = ['txt', 'md'];
const MAX_NOTES = 300;

export default function Notes({ pid, mode, params }: AppProps) {
  const home = useHome();
  const dir = home ? `${home}/Documents/Notes` : null;
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [listing, setListing] = useState(true);
  const [open, setOpen] = useState<string | null>((params?.path as string) ?? null);
  const [doc, setDoc] = useState<{ path: string; text: string } | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'open' | 'export' | null>(null);

  const refresh = useCallback(async () => {
    if (!dir) return;
    setListing(true);
    try {
      if (!(await fsapi.exists(dir))) {
        if (fsapi.real) {
          setNotes([]);
          return;
        }
        // Browser demo: seed the virtual folder like before.
        await fsapi.mkdir(dir);
        await fsapi.writeText(`${dir}/Welcome.txt`, 'Welcome to Notes ✍️\n\nEverything you type is saved automatically to ~/Documents/Notes — open the File Explorer or Terminal to see it.');
        await fsapi.writeText(`${dir}/Shopping.txt`, 'Shopping\n- Coffee beans\n- Oat milk\n- HDMI 2.1 cable\n- AA batteries for the remote');
      }
      const entries = (await fsapi.list(dir))
        .filter((e) => e.type === 'file' && NOTE_EXT.includes(e.name.split('.').pop()!.toLowerCase()) && e.size < 1024 * 1024)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, MAX_NOTES);
      const loaded = await Promise.all(entries.map(async (e) => ({ path: e.path, mtime: e.mtime, content: await fsapi.readText(e.path).catch(() => '') })));
      setNotes(loaded);
    } catch (e) {
      setError(`Could not read notes: ${errorText(e)}`);
    } finally {
      setListing(false);
    }
  }, [dir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (params?.path) setOpen(params.path as string);
  }, [params?.path]);

  // Load the open note from disk.
  useEffect(() => {
    if (!open) {
      setDoc(null);
      return;
    }
    let live = true;
    setLoadingDoc(true);
    fsapi
      .readText(open)
      .then((text) => live && setDoc({ path: open, text }))
      .catch((e) => {
        if (!live) return;
        setError(`Could not open ${basename(open)}: ${errorText(e)}`);
        setDoc(null);
        setOpen(null);
      })
      .finally(() => live && setLoadingDoc(false));
    return () => {
      live = false;
    };
  }, [open]);

  useBackHandler(pid, () => {
    if (open) {
      setOpen(null);
      return true;
    }
    return false;
  });

  const shown = useMemo(() => notes.filter((n) => !query || n.content.toLowerCase().includes(query.toLowerCase())), [notes, query]);

  const create = async () => {
    if (!dir) return;
    const path = `${dir}/Note ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    try {
      await fsapi.writeText(path, '');
      setNotes((ns) => [{ path, mtime: Date.now(), content: '' }, ...ns.filter((n) => n.path !== path)]);
      setOpen(path);
    } catch (e) {
      setError(`Could not create note: ${errorText(e)}`);
    }
  };

  const onSaved = (path: string, content: string) =>
    setNotes((ns) => {
      if (!dir || dirname(path) !== dir) return ns;
      return [{ path, mtime: Date.now(), content }, ...ns.filter((n) => n.path !== path)];
    });

  const remove = async (path: string) => {
    try {
      await fsapi.trash(path);
      setNotes((ns) => ns.filter((n) => n.path !== path));
      setOpen(null);
    } catch (e) {
      setError(`Could not delete ${basename(path)}: ${errorText(e)}`);
    }
  };

  const latestText = useRef('');

  const wide = mode === 'desktop';
  const list = (
    <div className={cx('flex h-full flex-col bg-[#1c1c1e]', wide && 'w-72 shrink-0 border-r border-white/10')}>
      <div className="flex items-center justify-between px-4 pt-5">
        <h1 className="text-3xl font-bold text-white">Notes</h1>
        <div className="flex">
          <button onClick={() => setDialog('open')} className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" aria-label="Open file" title="Open a .txt / .md file">
            <FolderOpen size={20} />
          </button>
          <button onClick={create} className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" aria-label="New note">
            <Plus size={22} />
          </button>
        </div>
      </div>
      <div className="mx-4 my-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
        <Search size={15} className="text-white/40" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40" />
      </div>
      <div className="mx-4 flex-1 overflow-y-auto rounded-xl">
        {shown.map((n) => {
          const [first, ...rest] = n.content.split('\n');
          return (
            <button key={n.path} onClick={() => setOpen(n.path)} className={cx('block w-full border-b border-white/10 bg-[#2c2c2e] px-4 py-2.5 text-left', open === n.path && 'bg-[#ffd60a]/20')}>
              <div className="truncate font-semibold text-white">{first || 'New Note'}</div>
              <div className="truncate text-sm text-white/45">
                {new Date(n.mtime).toLocaleDateString()} &nbsp;{rest.join(' ').trim() || 'No additional text'}
              </div>
            </button>
          );
        })}
        {!listing && !notes.length && <div className="px-2 py-6 text-center text-sm text-white/35">No notes yet — tap + to create one.</div>}
      </div>
      <div className="py-3 text-center text-xs text-white/40">{listing ? 'Loading…' : `${notes.length} Notes`}</div>
    </div>
  );

  const docsDir = home ? `${home}/Documents` : '/';

  return (
    <div className="relative flex h-full flex-col bg-[#1c1c1e]">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {!wide && !open ? (
        <div className="min-h-0 flex-1">{list}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {wide && list}
          {open && doc && doc.path === open ? (
            <Editor
              key={open}
              path={open}
              external={!dir || dirname(open) !== dir}
              initial={doc.text}
              textRef={latestText}
              onBack={wide ? undefined : () => setOpen(null)}
              onDelete={() => remove(open)}
              onExport={() => setDialog('export')}
              onSaved={onSaved}
              onError={setError}
            />
          ) : (
            <div className="grid flex-1 place-items-center text-white/30">{open && loadingDoc ? 'Loading…' : 'Select or create a note'}</div>
          )}
        </div>
      )}
      {dialog && (
        <FileDialog
          mode={dialog === 'open' ? 'open' : 'save'}
          title={dialog === 'open' ? 'Open text file' : 'Export note to file'}
          initialDir={dialog === 'open' ? (open ? dirname(open) : docsDir) : docsDir}
          accept={dialog === 'open' ? NOTE_EXT : undefined}
          defaultName={dialog === 'export' ? `${(latestText.current.split('\n')[0] || 'Note').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'Note'}.txt` : ''}
          onCancel={() => setDialog(null)}
          onConfirm={async (p) => {
            const which = dialog;
            setDialog(null);
            if (which === 'open') return setOpen(p);
            try {
              await fsapi.writeText(p, latestText.current);
              onSaved(p, latestText.current);
            } catch (e) {
              setError(`Could not export to ${basename(p)}: ${errorText(e)}`);
            }
          }}
        />
      )}
    </div>
  );
}

function Editor({
  path,
  external,
  initial,
  textRef,
  onBack,
  onDelete,
  onExport,
  onSaved,
  onError,
}: {
  path: string;
  external: boolean;
  initial: string;
  textRef: React.MutableRefObject<string>;
  onBack?: () => void;
  onDelete: () => void;
  onExport: () => void;
  onSaved: (path: string, content: string) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const timer = useRef<number>();
  const latest = useRef(text);
  const persisted = useRef(initial);
  const deleted = useRef(false);
  latest.current = text;
  textRef.current = text;

  const flush = useCallback(
    async (v: string) => {
      if (deleted.current || v === persisted.current) return setStatus('saved');
      try {
        await fsapi.writeText(path, v);
        persisted.current = v;
        onSaved(path, v);
        setStatus('saved');
      } catch (e) {
        setStatus('error');
        onError(`Could not save ${basename(path)}: ${errorText(e)}`);
      }
    },
    [path], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onChange = (v: string) => {
    setText(v);
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(v), 500);
  };

  // Flush on unmount so nothing is lost when switching notes or closing the app.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const v = latest.current;
      if (!deleted.current && v !== persisted.current)
        fsapi.writeText(path, v).then(
          () => onSaved(path, v),
          () => {},
        );
    },
    [path], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex min-w-0 flex-1 animate-fade-in flex-col bg-[#1c1c1e] text-white">
      <div className="flex items-center gap-2 px-3 py-2">
        {onBack && (
          <button onClick={onBack} className="flex items-center text-[#ffd60a]" aria-label="Back">
            <ChevronLeft size={26} /> Notes
          </button>
        )}
        <span className={cx('ml-auto flex items-center gap-1 text-xs', status === 'error' ? 'text-red-300' : 'text-white/40')}>
          {status === 'saved' ? (
            <>
              <Check size={13} /> Saved
            </>
          ) : status === 'saving' ? (
            'Saving…'
          ) : (
            'Not saved'
          )}
        </span>
        <button className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(text)} aria-label="Copy note" title="Copy to clipboard">
          <Share size={18} />
        </button>
        <button className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10" onClick={onExport} aria-label="Export to file" title="Export to file…">
          <FileDown size={18} />
        </button>
        {!external && (
          <button
            className="rounded-full p-2 text-[#ffd60a] hover:bg-white/10"
            onClick={() => {
              deleted.current = true;
              window.clearTimeout(timer.current);
              onDelete();
            }}
            aria-label="Delete note"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div className="truncate px-5 text-center text-xs text-white/35" title={path}>
        {external ? path : basename(path)}
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            window.clearTimeout(timer.current);
            flush(text);
          }
        }}
        placeholder="Start typing…"
        spellCheck
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-3 text-[17px] leading-relaxed outline-none placeholder:text-white/25 [&::first-line]:text-2xl [&::first-line]:font-bold"
      />
    </div>
  );
}
