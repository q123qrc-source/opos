/**
 * File Explorer — grid/list file manager. Uses the real filesystem inside an OPOS session (via fsapi /
 * bridge.fs) and the persisted virtual filesystem in a plain browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUp, Folder, FileText, FileCode2, Image, Music, Video, Archive, Home, Monitor, Download, LayoutGrid, List,
  FolderPlus, FilePlus, Trash2, Pencil, HardDrive, Search, ChevronRight, RefreshCw, Eye, EyeOff, Copy, Scissors, ClipboardPaste, Loader2,
  AlertTriangle, ArrowDownUp, Link2, type LucideIcon,
} from 'lucide-react';
import type { AppProps } from '../../types';
import { fsapi, formatBytes, pathJoin, uniquePath, basename, dirname } from '../../lib/fsapi';
import { bridge, type FsEntry, type Place } from '../../lib/bridge';
import { extname, normalize, useFs } from '../../lib/vfs';
import { openFile } from '../../lib/openFile';
import { useOS } from '../../store/useOS';
import { useBackHandler } from '../../lib/backStack';
import { cx, usePersistentState } from '../../lib/hooks';
import { errMessage, useFileClipboard } from './files/clipboard';

type SortKey = 'name' | 'size' | 'date';
const POLL_MS = 4000;
const canCopy = fsapi.real && !!bridge.fs?.copy;

const PLACE_ICONS: Record<string, LucideIcon> = {
  home: Home, desktop: Monitor, documents: FileText, downloads: Download, pictures: Image, music: Music, videos: Video, trash: Trash2, drive: HardDrive,
};

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'img'];
const CODE = ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'sh', 'c', 'cpp', 'h', 'rs', 'go', 'java', 'rb', 'yml', 'yaml', 'toml', 'xml'];
const AUDIO = ['m3u', 'mp3', 'ogg', 'flac', 'wav', 'm4a'];
const VIDEO = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
const ARCHIVE = ['zip', 'tar', 'gz', 'xz', 'bz2', '7z', 'rar', 'zst', 'deb', 'rpm'];

function iconFor(entry: FsEntry, size: number) {
  if (entry.type === 'dir') return <Folder size={size} className="fill-amber-300/90 text-amber-400" strokeWidth={1.2} />;
  const ext = extname(entry.name);
  if (entry.broken) return <Link2 size={size} className="text-red-300" strokeWidth={1.2} />;
  if (IMAGE.includes(ext)) return <Image size={size} className="text-pink-300" strokeWidth={1.2} />;
  if (CODE.includes(ext)) return <FileCode2 size={size} className="text-sky-300" strokeWidth={1.2} />;
  if (AUDIO.includes(ext)) return <Music size={size} className="text-emerald-300" strokeWidth={1.2} />;
  if (VIDEO.includes(ext)) return <Video size={size} className="text-violet-300" strokeWidth={1.2} />;
  if (ARCHIVE.includes(ext)) return <Archive size={size} className="text-orange-300" strokeWidth={1.2} />;
  return <FileText size={size} className="text-slate-200" strokeWidth={1.2} />;
}

function splitName(name: string): [string, string] {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

const signature = (list: FsEntry[]) => list.map((e) => `${e.path}|${e.type}|${e.size}|${e.mtime}`).join('\n');

export default function FileExplorer({ pid, mode, params }: AppProps) {
  const openContextMenu = useOS((s) => s.openContextMenu);
  const notify = useOS((s) => s.notify);
  const clip = useFileClipboard();
  const vfsNodes = useFs((s) => s.nodes); // re-list on virtual FS changes (no-op dependency when real)
  const tv = mode === 'tv';

  const [home, setHome] = useState<string>('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [history, setHistory] = useState<string[]>(params?.path ? [normalize(params.path as string)] : []);
  const [hIndex, setHIndex] = useState(0);
  const cwd = history[hIndex] ?? '';

  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [view, setView] = usePersistentState<'grid' | 'list'>('files-view', mode === 'mobile' ? 'list' : 'grid');
  const [showHidden, setShowHidden] = usePersistentState('files-hidden', false);
  const [sort, setSort] = usePersistentState<{ key: SortKey; asc: boolean }>('files-sort', { key: 'name', asc: true });
  const [filter, setFilter] = useState('');
  const sigRef = useRef('');
  const reqRef = useRef(0);

  // Home + places
  useEffect(() => {
    let alive = true;
    fsapi.home().then((h) => {
      if (!alive) return;
      setHome(h);
      setHistory((hist) => (hist.length ? hist : [h]));
    });
    fsapi.places().then((p) => alive && setPlaces(p), () => {});
    return () => {
      alive = false;
    };
  }, []);

  const navigate = useCallback(
    (p: string) => {
      const next = normalize(p);
      const base = history.slice(0, hIndex + 1);
      if (base[base.length - 1] === next) return;
      setHistory([...base, next]);
      setHIndex(base.length);
      setSelected(null);
      setRenaming(null);
      setFilter('');
    },
    [hIndex, history],
  );

  const go = (idx: number) => {
    setHIndex(idx);
    setSelected(null);
    setRenaming(null);
  };

  useEffect(() => {
    if (params?.path && normalize(params.path as string) !== cwd) navigate(params.path as string);
  }, [params?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listing
  const refresh = useCallback(
    async (quiet = false) => {
      if (!cwd) return;
      const req = ++reqRef.current;
      if (!quiet) setLoading(true);
      try {
        if (!fsapi.real && !(await fsapi.exists(cwd))) throw new Error('No such file or folder');
        const list = await fsapi.list(cwd, { hidden: showHidden });
        if (req !== reqRef.current) return;
        const sig = signature(list);
        if (sig !== sigRef.current || !quiet) {
          sigRef.current = sig;
          setEntries(list);
        }
        setError(null);
      } catch (e) {
        if (req !== reqRef.current) return;
        sigRef.current = '';
        setEntries([]);
        setError(errMessage(e));
      } finally {
        if (req === reqRef.current) setLoading(false);
      }
    },
    [cwd, showHidden],
  );

  useEffect(() => {
    sigRef.current = '';
    void refresh();
  }, [refresh]);

  // Virtual FS: re-list whenever the store changes (other apps writing files).
  useEffect(() => {
    if (!fsapi.real) void refresh(true);
  }, [vfsNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real FS: poll while the page is visible so external changes show up.
  useEffect(() => {
    if (!fsapi.real || !cwd) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !renaming) void refresh(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh, cwd, renaming]);

  const atRoot = cwd === '/';
  useBackHandler(pid, () => {
    if (renaming) {
      setRenaming(null);
      return true;
    }
    if (cwd && !atRoot && cwd !== home) {
      navigate(dirname(cwd));
      return true;
    }
    return false;
  });

  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    const list = entries.filter((e) => !q || e.name.toLowerCase().includes(q));
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      let c = 0;
      if (sort.key === 'size') c = a.size - b.size;
      else if (sort.key === 'date') c = a.mtime - b.mtime;
      if (c === 0) c = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return c * dir;
    });
  }, [entries, filter, sort]);

  // Operations
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      notify(label, errMessage(e), 'files');
    } finally {
      void refresh(true);
    }
  };

  const open = (entry: FsEntry) => (entry.type === 'dir' ? navigate(entry.path) : openFile(entry.path));

  const newFolder = () =>
    run('Could not create folder', async () => {
      const p = await uniquePath(cwd, 'New folder');
      await fsapi.mkdir(p);
      setSelected(p);
      setRenaming(p);
    });

  const newFile = () =>
    run('Could not create file', async () => {
      const p = await uniquePath(cwd, 'Untitled', '.txt');
      await fsapi.writeText(p, '');
      setSelected(p);
      setRenaming(p);
    });

  const trash = (path: string) =>
    run(fsapi.real ? 'Could not move to Trash' : 'Could not delete', async () => {
      await fsapi.trash(path);
      if (selected === path) setSelected(null);
    });

  const rename = (path: string, name: string) =>
    run('Could not rename', async () => {
      const clean = name.trim();
      if (!clean || clean === basename(path)) return;
      if (clean.includes('/')) throw new Error('Names cannot contain "/"');
      const to = pathJoin(dirname(path), clean);
      await fsapi.rename(path, to);
      setSelected(to);
    });

  const paste = () => pasteInto(cwd);

  const copySel = (path: string) => canCopy && clip.set('copy', [path]);
  const cutSel = (path: string) => clip.set('cut', [path]);
  const canPaste = !!clip.op && clip.paths.length > 0 && !!cwd && !error;

  const itemMenu = (e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(entry.path);
    const { launch } = useOS.getState();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => open(entry) },
      ...(entry.type === 'file'
        ? [
            { label: 'Open with Code Editor', action: () => launch('code', { path: entry.path }) },
            ...(fsapi.real && fsapi.openExternal ? [{ label: 'Open with default app', action: () => void run('Could not open', () => fsapi.openExternal!(entry.path)) }] : []),
          ]
        : [{ label: 'Open in Terminal', action: () => launch('terminal', { cwd: entry.path }) }]),
      { label: '', divider: true },
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => cutSel(entry.path) },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: !canCopy, action: () => copySel(entry.path) },
      ...(entry.type === 'dir' ? [{ label: 'Paste into folder', disabled: !clip.op, action: () => void pasteInto(entry.path) }] : []),
      { label: 'Rename', shortcut: 'F2', action: () => setRenaming(entry.path) },
      { label: 'Copy path', action: () => navigator.clipboard?.writeText(entry.path) },
      { label: '', divider: true },
      { label: fsapi.real ? 'Move to Trash' : 'Delete', danger: true, shortcut: 'Del', action: () => void trash(entry.path) },
    ]);
  };

  const pasteInto = async (dir: string) => {
    const { op, paths } = useFileClipboard.getState();
    if (!op) return;
    await run('Paste failed', async () => {
      for (const src of paths) {
        if (dir === src || dir.startsWith(src === '/' ? '/' : `${src}/`)) throw new Error(`Cannot paste ${basename(src)} into itself`);
        if (op === 'cut' && dirname(src) === dir) continue;
        const [base, ext] = splitName(basename(src));
        const dst = await uniquePath(dir, base, ext);
        if (op === 'copy') {
          if (!bridge.fs?.copy) throw new Error('Copy is only available on the real filesystem');
          await bridge.fs.copy(src, dst);
        } else await fsapi.rename(src, dst);
      }
      if (op === 'cut') useFileClipboard.getState().clear();
    });
  };

  const bgMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'New folder', action: () => void newFolder() },
      { label: 'New text file', action: () => void newFile() },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !canPaste, action: () => void paste() },
      { label: '', divider: true },
      { label: 'Refresh', shortcut: 'F5', action: () => void refresh() },
      { label: showHidden ? 'Hide hidden files' : 'Show hidden files', shortcut: 'Ctrl+H', action: () => setShowHidden(!showHidden) },
      { label: view === 'grid' ? 'List view' : 'Grid view', action: () => setView(view === 'grid' ? 'list' : 'grid') },
      { label: 'Open in Terminal', action: () => useOS.getState().launch('terminal', { cwd }) },
    ]);
  };

  const submitPath = (raw: string) => {
    setEditingPath(null);
    let p = raw.trim();
    if (!p) return;
    if (p === '~' || p.startsWith('~/')) p = home + p.slice(1);
    else if (!p.startsWith('/')) p = pathJoin(cwd, p);
    if (normalize(p) !== cwd) navigate(p);
  };

  const toggleSort = (key: SortKey) => setSort(sort.key === key ? { key, asc: !sort.asc } : { key, asc: key === 'name' });

  const crumbs = cwd.split('/').filter(Boolean);
  const totalSize = shown.reduce((a, e) => a + (e.type === 'file' ? e.size : 0), 0);
  const btn = cx('rounded-md hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-accent disabled:opacity-30', tv ? 'p-2.5' : 'p-1.5');
  const ic = tv ? 20 : 16;
  const isCut = (p: string) => clip.op === 'cut' && clip.paths.includes(p);

  return (
    <div
      className={cx('flex h-full flex-col bg-[#0f111a] text-white', tv && 'text-[15px]')}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (renaming || (e.target as HTMLElement).tagName === 'INPUT') return;
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'Delete' && selected) void trash(selected);
        else if (e.key === 'F2' && selected) setRenaming(selected);
        else if (e.key === 'F5') {
          e.preventDefault();
          void refresh();
        } else if (e.key === 'Backspace' && !atRoot) navigate(dirname(cwd));
        else if (mod && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          setShowHidden(!showHidden);
        } else if (mod && e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setEditingPath(cwd);
        } else if (mod && e.key.toLowerCase() === 'c' && selected) copySel(selected);
        else if (mod && e.key.toLowerCase() === 'x' && selected) cutSel(selected);
        else if (mod && e.key.toLowerCase() === 'v' && canPaste) void paste();
        else if (e.key === 'Enter' && selected) {
          const ent = shown.find((x) => x.path === selected);
          if (ent) open(ent);
        }
      }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-white/5 bg-[#131622] px-2 py-1.5">
        <button disabled={hIndex === 0} onClick={() => go(hIndex - 1)} className={btn} aria-label="Back" title="Back">
          <ArrowLeft size={ic} />
        </button>
        <button disabled={hIndex >= history.length - 1} onClick={() => go(hIndex + 1)} className={btn} aria-label="Forward" title="Forward">
          <ArrowRight size={ic} />
        </button>
        <button disabled={!cwd || atRoot} onClick={() => navigate(dirname(cwd))} className={btn} aria-label="Up" title="Up">
          <ArrowUp size={ic} />
        </button>
        <button onClick={() => void refresh()} className={btn} aria-label="Refresh" title="Refresh (F5)">
          {loading ? <Loader2 size={ic - 1} className="animate-spin" /> : <RefreshCw size={ic - 1} />}
        </button>

        {editingPath !== null ? (
          <input
            autoFocus
            value={editingPath}
            onChange={(e) => setEditingPath(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setEditingPath(null)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') submitPath(editingPath);
              if (e.key === 'Escape') setEditingPath(null);
            }}
            aria-label="Location"
            spellCheck={false}
            className={cx('mx-1 min-w-0 flex-1 rounded-md border border-os-accent bg-black/40 px-2 font-mono outline-none', tv ? 'py-2 text-[15px]' : 'py-1 text-[13px]')}
          />
        ) : (
          <div
            className={cx('mx-1 flex min-w-0 flex-1 cursor-text items-center gap-0.5 overflow-x-auto rounded-md bg-white/[.06] px-2', tv ? 'py-1.5 text-[15px]' : 'py-1 text-[13px]')}
            onClick={(e) => e.target === e.currentTarget && setEditingPath(cwd)}
            onDoubleClick={() => setEditingPath(cwd)}
            title="Click to type a location (Ctrl+L)"
          >
            <button className="shrink-0 rounded px-1 hover:bg-white/10" onClick={() => navigate('/')} aria-label="Root">
              <HardDrive size={14} />
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex shrink-0 items-center">
                <ChevronRight size={13} className="text-white/30" />
                <button className="rounded px-1.5 hover:bg-white/10" onClick={() => navigate('/' + crumbs.slice(0, i + 1).join('/'))}>
                  {c}
                </button>
              </span>
            ))}
            <span className="min-w-[24px] flex-1 self-stretch" onClick={() => setEditingPath(cwd)} />
          </div>
        )}

        <div className="hidden items-center gap-1.5 rounded-md bg-white/[.06] px-2 py-1 sm:flex">
          <Search size={13} className="text-white/40" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search ${basename(cwd || '/')}`} className="w-32 bg-transparent text-[12px] outline-none" />
        </div>
        <button onClick={() => void newFolder()} disabled={!!error} className={btn} aria-label="New folder" title="New folder">
          <FolderPlus size={ic} />
        </button>
        {mode !== 'mobile' && (
          <button onClick={() => void newFile()} disabled={!!error} className={btn} aria-label="New file" title="New file">
            <FilePlus size={ic} />
          </button>
        )}
        <button disabled={!selected} onClick={() => selected && cutSel(selected)} className={btn} aria-label="Cut" title="Cut (Ctrl+X)">
          <Scissors size={ic - 1} />
        </button>
        <button disabled={!selected || !canCopy} onClick={() => selected && copySel(selected)} className={btn} aria-label="Copy" title={canCopy ? 'Copy (Ctrl+C)' : 'Copy needs the real filesystem'}>
          <Copy size={ic - 1} />
        </button>
        <button disabled={!canPaste} onClick={() => void paste()} className={btn} aria-label="Paste" title="Paste (Ctrl+V)">
          <ClipboardPaste size={ic - 1} />
        </button>
        <button disabled={!selected} onClick={() => selected && setRenaming(selected)} className={btn} aria-label="Rename" title="Rename (F2)">
          <Pencil size={ic - 1} />
        </button>
        <button disabled={!selected} onClick={() => selected && void trash(selected)} className={btn} aria-label={fsapi.real ? 'Move to Trash' : 'Delete'} title={fsapi.real ? 'Move to Trash (Del)' : 'Delete (Del)'}>
          <Trash2 size={ic - 1} />
        </button>
        <button onClick={() => setShowHidden(!showHidden)} className={cx(btn, showHidden && 'bg-white/10')} aria-label={showHidden ? 'Hide hidden files' : 'Show hidden files'} aria-pressed={showHidden} title="Hidden files (Ctrl+H)">
          {showHidden ? <Eye size={ic - 1} /> : <EyeOff size={ic - 1} />}
        </button>
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const label = (k: SortKey, t: string) => `${sort.key === k ? (sort.asc ? '↑ ' : '↓ ') : ''}${t}`;
            openContextMenu(r.left, r.bottom, [
              { label: label('name', 'Name'), action: () => toggleSort('name') },
              { label: label('size', 'Size'), action: () => toggleSort('size') },
              { label: label('date', 'Date modified'), action: () => toggleSort('date') },
            ]);
          }}
          className={btn}
          aria-label="Sort"
          title="Sort"
        >
          <ArrowDownUp size={ic - 1} />
        </button>
        <div className="ml-1 flex rounded-md bg-white/[.06] p-0.5">
          <button onClick={() => setView('grid')} className={cx('rounded', tv ? 'p-2' : 'p-1', view === 'grid' && 'bg-white/15')} aria-label="Grid view">
            <LayoutGrid size={tv ? 18 : 14} />
          </button>
          <button onClick={() => setView('list')} className={cx('rounded', tv ? 'p-2' : 'p-1', view === 'list' && 'bg-white/15')} aria-label="List view">
            <List size={tv ? 18 : 14} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== 'mobile' && (
          <aside className={cx('shrink-0 overflow-y-auto border-r border-white/5 p-2', tv ? 'w-56' : 'w-44')}>
            {places.map((p) => {
              const Icon = PLACE_ICONS[p.icon] ?? Folder;
              return (
                <button
                  key={p.path + p.label}
                  onClick={() => navigate(p.path)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-accent',
                    tv ? 'py-2.5 text-[15px]' : 'py-1.5 text-[13px]',
                    cwd === p.path ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5',
                  )}
                >
                  <Icon size={tv ? 18 : 15} className="text-os-accent" /> {p.label}
                </button>
              );
            })}
          </aside>
        )}

        <main className="relative min-w-0 flex-1 overflow-y-auto p-3" onClick={() => setSelected(null)} onContextMenu={bgMenu}>
          {error ? (
            <div className="grid h-full place-items-center text-center">
              <div className="flex flex-col items-center gap-2 text-sm text-white/60">
                <AlertTriangle size={32} className="text-amber-400" />
                <div className="font-medium text-white/80">Can't open {basename(cwd)}</div>
                <div>{error}</div>
                <div className="mt-1 flex gap-2">
                  {hIndex > 0 && (
                    <button className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/15" onClick={() => go(hIndex - 1)}>
                      Go back
                    </button>
                  )}
                  <button className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/15" onClick={() => void refresh()}>
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : !cwd || (loading && entries.length === 0) ? (
            <div className="grid h-full place-items-center text-white/40">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-white/35">{filter ? 'No matching items' : 'This folder is empty'}</div>
          ) : view === 'grid' ? (
            <div className={cx('grid gap-1', tv ? 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(96px,1fr))]')}>
              {shown.map((entry) => (
                <button
                  key={entry.path}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(entry.path);
                    if (mode === 'mobile' && renaming !== entry.path) open(entry);
                  }}
                  onDoubleClick={() => open(entry)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renaming !== entry.path) {
                      e.stopPropagation();
                      open(entry);
                    }
                  }}
                  onFocus={() => setSelected(entry.path)}
                  onContextMenu={(e) => itemMenu(e, entry)}
                  title={entry.name}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-lg text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-accent',
                    tv ? 'p-3' : 'p-2',
                    selected === entry.path ? 'bg-os-accent/25 ring-1 ring-os-accent/50' : 'hover:bg-white/[.06]',
                    isCut(entry.path) && 'opacity-50',
                    entry.name.startsWith('.') && 'opacity-70',
                  )}
                >
                  {iconFor(entry, tv ? 60 : 46)}
                  {renaming === entry.path ? (
                    <RenameInput name={entry.name} onCommit={(n) => void rename(entry.path, n)} onDone={() => setRenaming(null)} />
                  ) : (
                    <span className={cx('line-clamp-2 break-all leading-tight text-white/85', tv ? 'text-[14px]' : 'text-[12px]')}>{entry.name}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <table className={cx('w-full text-left', tv ? 'text-[15px]' : 'text-[13px]')}>
              <thead className="text-[11px] text-white/40">
                <tr>
                  <SortTh label="Name" k="name" sort={sort} onSort={toggleSort} />
                  <SortTh label="Modified" k="date" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                  <th className="px-2 py-1 font-medium">Type</th>
                  <SortTh label="Size" k="size" sort={sort} onSort={toggleSort} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {shown.map((entry) => (
                  <tr
                    key={entry.path}
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(entry.path);
                      if (mode === 'mobile' && renaming !== entry.path) open(entry);
                    }}
                    onDoubleClick={() => open(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renaming !== entry.path) {
                        e.stopPropagation();
                        open(entry);
                      }
                    }}
                    onFocus={() => setSelected(entry.path)}
                    onContextMenu={(e) => itemMenu(e, entry)}
                    className={cx(
                      'cursor-default outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-accent',
                      selected === entry.path ? 'bg-os-accent/25' : 'hover:bg-white/[.05]',
                      isCut(entry.path) && 'opacity-50',
                    )}
                  >
                    <td className={cx('flex items-center gap-2 px-2', tv || mode === 'mobile' ? 'py-2.5' : 'py-1.5')}>
                      {iconFor(entry, tv ? 24 : 18)}
                      {renaming === entry.path ? (
                        <RenameInput name={entry.name} onCommit={(n) => void rename(entry.path, n)} onDone={() => setRenaming(null)} />
                      ) : (
                        <span className={cx('truncate', entry.name.startsWith('.') && 'text-white/60')}>{entry.name}</span>
                      )}
                    </td>
                    <td className="hidden px-2 py-1.5 text-white/45 sm:table-cell">{entry.mtime ? new Date(entry.mtime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td className="px-2 py-1.5 text-white/45">{entry.type === 'dir' ? 'Folder' : entry.broken ? 'Broken link' : `${extname(entry.name).toUpperCase() || 'File'}`}</td>
                    <td className="px-2 py-1.5 text-right text-white/45">{entry.type === 'dir' ? '—' : formatBytes(entry.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>
      <div className="flex justify-between border-t border-white/5 bg-[#131622] px-3 py-1 text-[11px] text-white/40">
        <span>
          {shown.length} items{selected ? ` · 1 selected` : ''}
          {clip.op ? ` · ${clip.paths.length} ${clip.op === 'cut' ? 'cut' : 'copied'}` : ''}
        </span>
        <span>
          {formatBytes(totalSize)}
          {fsapi.real ? '' : ' · virtual'}
        </span>
      </div>
    </div>
  );
}

function SortTh({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void; className?: string }) {
  return (
    <th className={cx('px-2 py-1 font-medium', className)} aria-sort={sort.key === k ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button className="rounded hover:text-white/80" onClick={() => onSort(k)}>
        {label}
        {sort.key === k ? (sort.asc ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

function RenameInput({ name, onCommit, onDone }: { name: string; onCommit: (name: string) => void; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && value.trim() && value !== name) onCommit(value);
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.setSelectionRange(0, value.lastIndexOf('.') > 0 ? value.lastIndexOf('.') : value.length)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      className="w-full rounded border border-os-accent bg-black/60 px-1 text-center text-[12px] outline-none"
    />
  );
}
