/** Minimal Open / Save-As dialog for document apps, backed by fsapi (real FS in Electron, VFS in the browser). */
import { useEffect, useState } from 'react';
import { ArrowUp, File, Folder, X, AlertTriangle } from 'lucide-react';
import { fsapi, basename, dirname, pathJoin } from '../../../lib/fsapi';
import type { FsEntry, Place } from '../../../lib/bridge';
import { cx } from '../../../lib/hooks';

/** Turns IPC / fs errors ("Error invoking remote method 'x': Error: EACCES: …") into a readable line. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '');
}

/** The user's home directory ($HOME in Electron, /home/guest in the browser). null until resolved. */
export function useHome() {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fsapi.home().then(
      (h) => live && setHome(h),
      () => live && setHome('/'),
    );
    return () => {
      live = false;
    };
  }, []);
  return home;
}

export function ErrorBanner({ error, onClose }: { error: string | null; onClose: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-red-500/30 bg-red-500/15 px-3 py-1.5 text-[12px] text-red-200">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate" title={error}>
        {error}
      </span>
      <button onClick={onClose} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-white/10">
        <X size={13} />
      </button>
    </div>
  );
}

export interface FileDialogProps {
  mode: 'open' | 'save';
  title?: string;
  initialDir: string;
  defaultName?: string;
  /** Lower-case extensions (without dot) shown for picking; directories are always shown. */
  accept?: string[];
  onCancel: () => void;
  onConfirm: (path: string) => void;
}

const extOf = (n: string) => {
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1).toLowerCase() : '';
};

export function FileDialog({ mode, title, initialDir, defaultName = '', accept, onCancel, onConfirm }: FileDialogProps) {
  const [dir, setDir] = useState(initialDir);
  const [dirInput, setDirInput] = useState(initialDir);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fsapi.places().then(setPlaces, () => setPlaces([]));
  }, []);

  useEffect(() => {
    let live = true;
    setDirInput(dir);
    setLoading(true);
    setError(null);
    fsapi
      .list(dir)
      .then((list) => {
        if (!live) return;
        setEntries(
          list
            .filter((e) => e.type === 'dir' || !accept?.length || accept.includes(extOf(e.name)))
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)),
        );
      })
      .catch((e) => {
        if (!live) return;
        setEntries([]);
        setError(errorText(e));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [dir]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async (target?: string) => {
    const n = name.trim();
    const p = target ?? (n ? (n.startsWith('/') ? pathJoin(n) : pathJoin(dir, n)) : '');
    if (!p) return;
    if (mode === 'save' && !target && (await fsapi.exists(p)) && !window.confirm(`${basename(p)} already exists. Replace it?`)) return;
    onConfirm(p);
  };

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className="flex h-[min(440px,100%)] w-[min(620px,100%)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#23242e] text-[13px] text-white shadow-2xl" role="dialog" aria-label={title ?? (mode === 'open' ? 'Open file' : 'Save file')}>
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="font-semibold">{title ?? (mode === 'open' ? 'Open' : 'Save As')}</span>
          <button onClick={onCancel} aria-label="Close dialog" className="rounded p-1 hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
          <button onClick={() => setDir(dirname(dir))} disabled={dir === '/'} aria-label="Parent folder" className="rounded p-1 hover:bg-white/10 disabled:opacity-30">
            <ArrowUp size={14} />
          </button>
          <input
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setDir(pathJoin(dirInput || '/'))}
            className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 font-mono text-[12px] outline-none focus:bg-white/15"
            aria-label="Folder path"
          />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-36 shrink-0 overflow-y-auto border-r border-white/10 py-1">
            {places.map((p) => (
              <button key={p.path} onClick={() => setDir(p.path)} className={cx('block w-full truncate px-3 py-1 text-left', dir === p.path ? 'bg-sky-600/30' : 'text-white/75 hover:bg-white/5')}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto py-1">
            {error && <div className="px-3 py-2 text-red-300">{error}</div>}
            {loading && !entries.length && <div className="px-3 py-2 text-white/40">Loading…</div>}
            {!loading && !error && !entries.length && <div className="px-3 py-2 text-white/40">Empty folder</div>}
            {entries.map((e) => (
              <button
                key={e.path}
                onClick={() => (e.type === 'dir' ? setDir(e.path) : setName(e.name))}
                onDoubleClick={() => e.type === 'file' && confirm(e.path)}
                className={cx('flex w-full items-center gap-2 px-3 py-1 text-left', e.type === 'file' && e.name === name ? 'bg-sky-600/30' : 'hover:bg-white/5')}
              >
                {e.type === 'dir' ? <Folder size={14} className="shrink-0 text-sky-300" /> : <File size={14} className="shrink-0 text-white/50" />}
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
          <input
            autoFocus={mode === 'save'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder={mode === 'open' ? 'File name' : 'Save as…'}
            className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 outline-none focus:bg-white/15"
            aria-label="File name"
          />
          <button onClick={onCancel} className="rounded px-3 py-1 text-white/75 hover:bg-white/10">
            Cancel
          </button>
          <button onClick={() => confirm()} disabled={!name.trim()} className="rounded bg-sky-600 px-3 py-1 font-medium hover:bg-sky-500 disabled:opacity-40">
            {mode === 'open' ? 'Open' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
