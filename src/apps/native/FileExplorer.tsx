/** File Explorer — grid/list file manager over the shared VFS. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Folder, FileText, FileCode2, Image, Music, Home, Monitor, Download, LayoutGrid, List, FolderPlus, FilePlus, Trash2, Pencil, HardDrive, Search, ChevronRight } from 'lucide-react';
import type { AppProps } from '../../types';
import { HOME, basename, dirname, extname, formatBytes, listDir, normalize, useFs, type FsNode } from '../../lib/vfs';
import { openFile } from '../../lib/openFile';
import { useOS } from '../../store/useOS';
import { useBackHandler } from '../../lib/backStack';
import { cx, usePersistentState } from '../../lib/hooks';

const PLACES = [
  { label: 'Home', path: HOME, icon: Home },
  { label: 'Desktop', path: `${HOME}/Desktop`, icon: Monitor },
  { label: 'Documents', path: `${HOME}/Documents`, icon: FileText },
  { label: 'Downloads', path: `${HOME}/Downloads`, icon: Download },
  { label: 'Pictures', path: `${HOME}/Pictures`, icon: Image },
  { label: 'Music', path: `${HOME}/Music`, icon: Music },
  { label: 'Projects', path: `${HOME}/Projects`, icon: FileCode2 },
  { label: 'System', path: '/', icon: HardDrive },
];

function iconFor(name: string, node: FsNode, size: number) {
  if (node.type === 'dir') return <Folder size={size} className="fill-amber-300/90 text-amber-400" strokeWidth={1.2} />;
  const ext = extname(name);
  if (['png', 'jpg', 'jpeg'].includes(ext)) return <Image size={size} className="text-pink-300" strokeWidth={1.2} />;
  if (['js', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'sh'].includes(ext)) return <FileCode2 size={size} className="text-sky-300" strokeWidth={1.2} />;
  if (['m3u', 'mp3', 'ogg'].includes(ext)) return <Music size={size} className="text-emerald-300" strokeWidth={1.2} />;
  return <FileText size={size} className="text-slate-200" strokeWidth={1.2} />;
}

export default function FileExplorer({ pid, mode, params }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const fsApi = useFs.getState();
  const openContextMenu = useOS((s) => s.openContextMenu);
  const [history, setHistory] = useState<string[]>([(params?.path as string) ?? HOME]);
  const [hIndex, setHIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setView] = usePersistentState<'grid' | 'list'>('files-view', mode === 'mobile' ? 'list' : 'grid');
  const [filter, setFilter] = useState('');
  const cwd = history[hIndex];

  const navigate = (p: string) => {
    const next = normalize(p);
    if (!nodes[next] || nodes[next].type !== 'dir') return;
    setHistory((h) => [...h.slice(0, hIndex + 1), next]);
    setHIndex((i) => i + 1);
    setSelected(null);
  };

  useEffect(() => {
    if (params?.path && params.path !== cwd) navigate(params.path as string);
  }, [params?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useBackHandler(pid, () => {
    if (cwd !== '/' && cwd !== HOME) {
      navigate(dirname(cwd));
      return true;
    }
    return false;
  });

  const entries = useMemo(() => listDir(nodes, cwd).filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase())), [nodes, cwd, filter]);

  const open = (path: string, node: FsNode) => (node.type === 'dir' ? navigate(path) : openFile(path));
  const unique = (base: string, ext = '') => {
    let p = `${cwd === '/' ? '' : cwd}/${base}${ext}`;
    let i = 2;
    while (nodes[p]) p = `${cwd === '/' ? '' : cwd}/${base} (${i++})${ext}`;
    return p;
  };

  const newFolder = () => {
    const p = unique('New folder');
    fsApi.mkdir(p);
    setRenaming(p);
  };

  const itemMenu = (e: React.MouseEvent, path: string, node: FsNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(path);
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open', action: () => open(path, node) },
      ...(node.type === 'file' ? [{ label: 'Open with Code Editor', action: () => useOS.getState().launch('code', { path }) }] : [{ label: 'Open in Terminal', action: () => useOS.getState().launch('terminal', { cwd: path }) }]),
      { label: 'Rename', shortcut: 'F2', action: () => setRenaming(path) },
      { label: 'Copy path', action: () => navigator.clipboard?.writeText(path) },
      { label: '', divider: true },
      { label: 'Delete', danger: true, shortcut: 'Del', action: () => fsApi.remove(path) },
    ]);
  };

  const bgMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: 'New folder', action: () => newFolder() },
      { label: 'New text file', action: () => fsApi.write(unique('Untitled', '.txt'), '') },
      { label: '', divider: true },
      { label: view === 'grid' ? 'List view' : 'Grid view', action: () => setView(view === 'grid' ? 'list' : 'grid') },
      { label: 'Open in Terminal', action: () => useOS.getState().launch('terminal', { cwd }) },
    ]);
  };

  const crumbs = cwd.split('/').filter(Boolean);
  const totalSize = entries.reduce((a, e) => a + (e.node.content?.length ?? 0), 0);

  return (
    <div
      className="flex h-full flex-col bg-[#0f111a] text-white"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (renaming || (e.target as HTMLElement).tagName === 'INPUT') return;
        if (e.key === 'Delete' && selected) fsApi.remove(selected);
        if (e.key === 'F2' && selected) setRenaming(selected);
        if (e.key === 'Backspace' && cwd !== '/') navigate(dirname(cwd));
      }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-white/5 bg-[#131622] px-2 py-1.5">
        <button disabled={hIndex === 0} onClick={() => { setHIndex(hIndex - 1); setSelected(null); }} className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <button disabled={hIndex >= history.length - 1} onClick={() => setHIndex(hIndex + 1)} className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Forward">
          <ArrowRight size={16} />
        </button>
        <button disabled={cwd === '/'} onClick={() => navigate(dirname(cwd))} className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Up">
          <ArrowUp size={16} />
        </button>
        <div className="mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-md bg-white/[.06] px-2 py-1 text-[13px]">
          <button className="rounded px-1 hover:bg-white/10" onClick={() => navigate('/')}>
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
        </div>
        <div className="hidden items-center gap-1.5 rounded-md bg-white/[.06] px-2 py-1 sm:flex">
          <Search size={13} className="text-white/40" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search ${basename(cwd)}`} className="w-32 bg-transparent text-[12px] outline-none" />
        </div>
        <button onClick={() => newFolder()} className="rounded-md p-1.5 hover:bg-white/10" aria-label="New folder" title="New folder">
          <FolderPlus size={16} />
        </button>
        <button onClick={() => fsApi.write(unique('Untitled', '.txt'), '')} className="rounded-md p-1.5 hover:bg-white/10" aria-label="New file" title="New file">
          <FilePlus size={16} />
        </button>
        <button disabled={!selected} onClick={() => selected && setRenaming(selected)} className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Rename">
          <Pencil size={15} />
        </button>
        <button disabled={!selected} onClick={() => selected && fsApi.remove(selected)} className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Delete">
          <Trash2 size={15} />
        </button>
        <div className="ml-1 flex rounded-md bg-white/[.06] p-0.5">
          <button onClick={() => setView('grid')} className={cx('rounded p-1', view === 'grid' && 'bg-white/15')} aria-label="Grid view">
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => setView('list')} className={cx('rounded p-1', view === 'list' && 'bg-white/15')} aria-label="List view">
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== 'mobile' && (
          <aside className="w-44 shrink-0 overflow-y-auto border-r border-white/5 p-2">
            {PLACES.map((p) => (
              <button key={p.path} onClick={() => navigate(p.path)} className={cx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px]', cwd === p.path ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5')}>
                <p.icon size={15} className="text-os-accent" /> {p.label}
              </button>
            ))}
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-3" onClick={() => setSelected(null)} onContextMenu={bgMenu}>
          {entries.length === 0 && <div className="grid h-full place-items-center text-sm text-white/35">This folder is empty</div>}
          {view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1">
              {entries.map(({ path, name, node }) => (
                <button
                  key={path}
                  onClick={(e) => { e.stopPropagation(); setSelected(path); }}
                  onDoubleClick={() => open(path, node)}
                  onContextMenu={(e) => itemMenu(e, path, node)}
                  className={cx('flex flex-col items-center gap-1 rounded-lg p-2 text-center', selected === path ? 'bg-os-accent/25 ring-1 ring-os-accent/50' : 'hover:bg-white/[.06]')}
                >
                  {iconFor(name, node, 46)}
                  {renaming === path ? (
                    <RenameInput path={path} onDone={() => setRenaming(null)} />
                  ) : (
                    <span className="line-clamp-2 break-all text-[12px] leading-tight text-white/85">{name}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] text-white/40">
                <tr>
                  <th className="px-2 py-1 font-medium">Name</th>
                  <th className="hidden px-2 py-1 font-medium sm:table-cell">Modified</th>
                  <th className="px-2 py-1 font-medium">Type</th>
                  <th className="px-2 py-1 text-right font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ path, name, node }) => (
                  <tr
                    key={path}
                    onClick={(e) => { e.stopPropagation(); setSelected(path); if (mode === 'mobile') open(path, node); }}
                    onDoubleClick={() => open(path, node)}
                    onContextMenu={(e) => itemMenu(e, path, node)}
                    className={cx('cursor-default', selected === path ? 'bg-os-accent/25' : 'hover:bg-white/[.05]')}
                  >
                    <td className="flex items-center gap-2 px-2 py-1.5">
                      {iconFor(name, node, 18)}
                      {renaming === path ? <RenameInput path={path} onDone={() => setRenaming(null)} /> : <span className="truncate">{name}</span>}
                    </td>
                    <td className="hidden px-2 py-1.5 text-white/45 sm:table-cell">{new Date(node.mtime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-2 py-1.5 text-white/45">{node.type === 'dir' ? 'Folder' : `${extname(name).toUpperCase() || 'File'}`}</td>
                    <td className="px-2 py-1.5 text-right text-white/45">{node.type === 'dir' ? '—' : formatBytes(node.content?.length ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>
      <div className="flex justify-between border-t border-white/5 bg-[#131622] px-3 py-1 text-[11px] text-white/40">
        <span>
          {entries.length} items{selected ? ` · 1 selected` : ''}
        </span>
        <span>{formatBytes(totalSize)}</span>
      </div>
    </div>
  );
}

function RenameInput({ path, onDone }: { path: string; onDone: () => void }) {
  const [value, setValue] = useState(basename(path));
  const commit = () => {
    if (value.trim() && value !== basename(path)) useFs.getState().rename(path, `${dirname(path)}/${value.trim()}`.replace('//', '/'));
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.setSelectionRange(0, value.lastIndexOf('.') > 0 ? value.lastIndexOf('.') : value.length)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
      }}
      className="w-full rounded border border-os-accent bg-black/60 px-1 text-center text-[12px] outline-none"
    />
  );
}
