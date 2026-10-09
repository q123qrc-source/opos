/** Code Editor — a VS Code-style IDE (activity bar, explorer, tabs, status bar) on CodeMirror 6, editing files through fsapi. */
import { useEffect, useRef, useState } from 'react';
import { Files, Search, GitBranch, Blocks, Play, X, ChevronRight, ChevronDown, FileCode2, FilePlus, Save, Circle, FolderOpen, ArrowUp, RefreshCw } from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import type { AppProps } from '../../types';
import { extname } from '../../lib/vfs';
import { fsapi, basename, dirname, pathJoin, uniquePath } from '../../lib/fsapi';
import type { FsEntry } from '../../lib/bridge';
import { ErrorBanner, FileDialog, errorText, useHome } from './shared/FileDialog';
import { useOS } from '../../store/useOS';
import { cx } from '../../lib/hooks';

function languageFor(path: string): { ext: Extension[]; name: string } {
  switch (extname(path)) {
    case 'js':
    case 'mjs':
      return { ext: [javascript()], name: 'JavaScript' };
    case 'jsx':
      return { ext: [javascript({ jsx: true })], name: 'JavaScript React' };
    case 'ts':
      return { ext: [javascript({ typescript: true })], name: 'TypeScript' };
    case 'tsx':
      return { ext: [javascript({ typescript: true, jsx: true })], name: 'TypeScript React' };
    case 'html':
      return { ext: [html()], name: 'HTML' };
    case 'css':
      return { ext: [css()], name: 'CSS' };
    case 'md':
      return { ext: [markdown()], name: 'Markdown' };
    case 'json':
      return { ext: [json()], name: 'JSON' };
    case 'py':
      return { ext: [python()], name: 'Python' };
    default:
      return { ext: [], name: 'Plain Text' };
  }
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: '#1e1f29' },
  '.cm-gutters': { backgroundColor: '#1e1f29', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#2a2c3a' },
});

export default function CodeEditor({ params, pid }: AppProps) {
  const initialPath = params?.path as string | undefined;
  const home = useHome();
  const [root, setRoot] = useState<string | null>(initialPath ? dirname(initialPath) : null);
  const [tabs, setTabs] = useState<string[]>(initialPath ? [initialPath] : []);
  const [active, setActive] = useState<string>(initialPath ?? '');
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [panel, setPanel] = useState<'explorer' | 'search'>('explorer');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ p: string; line: string; n: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [output, setOutput] = useState<string[] | null>(null);
  const [palette, setPalette] = useState(false);
  const [dialog, setDialog] = useState<'open' | 'save' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // bump to reload the explorer tree
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const shown = useRef<string | null>(null); // path whose state is currently inside the view
  const activeRef = useRef(active);
  activeRef.current = active;
  const setTitle = useOS((s) => s.setTitle);

  // Default workspace: the demo project when present (browser VFS), else ~/Documents.
  useEffect(() => {
    if (!home || root) return;
    const demo = `${home}/Projects/opos-app`;
    fsapi.exists(`${demo}/src/index.js`).then((ok) => {
      setRoot((r) => r ?? (ok ? demo : `${home}/Documents`));
      if (ok) {
        setTabs((t) => (t.length ? t : [`${demo}/src/index.js`]));
        setActive((a) => a || `${demo}/src/index.js`);
      }
    });
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open files requested via params (e.g. from File Explorer).
  useEffect(() => {
    if (!initialPath) return;
    setTabs((t) => (t.includes(initialPath) ? t : [...t, initialPath]));
    setActive(initialPath);
  }, [initialPath]);

  const markClean = (path: string) =>
    setDirty((d) => {
      if (!d.has(path)) return d;
      const n = new Set(d);
      n.delete(path);
      return n;
    });

  const currentState = (path: string) => (path === shown.current && view.current ? view.current.state : states.current.get(path));

  const save = async (path = activeRef.current) => {
    const st = currentState(path);
    if (!path || !st) return;
    try {
      await fsapi.writeText(path, st.doc.toString());
      markClean(path);
      setRev((r) => r + 1);
    } catch (e) {
      setError(`Could not save ${basename(path)}: ${errorText(e)}`);
    }
  };

  const saveAs = async (target: string) => {
    const from = activeRef.current;
    if (target === from) return save(from);
    const st = currentState(from);
    if (!st) return;
    const text = st.doc.toString();
    try {
      await fsapi.writeText(target, text);
    } catch (e) {
      setError(`Could not save ${basename(target)}: ${errorText(e)}`);
      return;
    }
    // Re-create the state so the language mode follows the new extension.
    states.current.delete(from);
    if (shown.current === from) shown.current = null;
    states.current.set(target, makeState(target, text));
    markClean(from);
    setTabs((t) => {
      const without = t.filter((x) => x !== target);
      return without.includes(from) ? without.map((x) => (x === from ? target : x)) : [...without, target];
    });
    setActive(target);
    setRev((r) => r + 1);
  };

  const makeState = (path: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        basicSetup,
        oneDark,
        editorTheme,
        ...languageFor(path).ext,
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (save(), true) },
          { key: 'Mod-Shift-s', preventDefault: true, run: () => (setDialog('save'), true) },
          { key: 'Mod-o', preventDefault: true, run: () => (setDialog('open'), true) },
          { key: 'Mod-Shift-p', preventDefault: true, run: () => (setPalette(true), true) },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDirty((d) => (d.has(activeRef.current) ? d : new Set(d).add(activeRef.current)));
          if (u.selectionSet || u.docChanged) {
            const pos = u.state.selection.main.head;
            const line = u.state.doc.lineAt(pos);
            setCursor({ line: line.number, col: pos - line.from + 1 });
          }
        }),
      ],
    });

  // Create the view once.
  useEffect(() => {
    view.current = new EditorView({ parent: host.current! });
    return () => view.current?.destroy();
  }, []);

  const closeTab = (path: string) => {
    if (dirty.has(path) && !window.confirm(`${basename(path)} has unsaved changes. Close anyway?`)) return;
    states.current.delete(path);
    if (shown.current === path) shown.current = null;
    markClean(path);
    setTabs((t) => {
      const next = t.filter((x) => x !== path);
      if (activeRef.current === path) setActive(next[next.length - 1] ?? '');
      return next;
    });
  };

  // Swap documents when switching tabs (each tab keeps its own state + undo history); load from disk on first open.
  useEffect(() => {
    const v = view.current;
    if (!v || !active) return;
    let live = true;
    const show = (st: EditorState) => {
      v.setState(st);
      shown.current = active;
      v.focus();
    };
    const cached = states.current.get(active);
    if (cached) show(cached);
    else {
      setLoading(true);
      fsapi
        .readText(active)
        .then((text) => {
          if (!live) return;
          const st = makeState(active, text);
          states.current.set(active, st);
          show(st);
        })
        .catch((e) => {
          if (!live) return;
          setError(`Could not open ${basename(active)}: ${errorText(e)}`);
          const failed = active;
          setTabs((t) => {
            const next = t.filter((x) => x !== failed);
            setActive(next[next.length - 1] ?? '');
            return next;
          });
        })
        .finally(() => live && setLoading(false));
    }
    return () => {
      live = false;
      if (shown.current === active) states.current.set(active, v.state);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitle(pid, active ? `${dirty.has(active) ? '● ' : ''}${basename(active)} — Code Editor` : 'Code Editor');
  }, [active, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = (path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
  };

  const newFile = async () => {
    if (!root) return;
    try {
      const p = await uniquePath(root, 'untitled', '.js');
      await fsapi.writeText(p, '');
      setRev((r) => r + 1);
      openFile(p);
    } catch (e) {
      setError(`Could not create file: ${errorText(e)}`);
    }
  };

  const runFile = async () => {
    if (!['js', 'mjs'].includes(extname(active))) {
      setOutput([`Run is supported for JavaScript files (current: ${languageFor(active).name}).`]);
      return;
    }
    const logs: string[] = [];
    const fmt = (a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a));
    const fakeConsole = { log: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')), error: (...a: unknown[]) => logs.push('✖ ' + a.map(fmt).join(' ')), warn: (...a: unknown[]) => logs.push('⚠ ' + a.map(fmt).join(' ')) };
    // Inline relative ES imports from disk so small multi-file projects run.
    const load = async (path: string, seen = new Set<string>()): Promise<string> => {
      if (seen.has(path)) return '';
      seen.add(path);
      const open = currentState(path);
      const src = open ? open.doc.toString() : await fsapi.readText(path).catch(() => '');
      const re = /^\s*import\s+[^'"]*from\s+['"](\.[^'"]+)['"];?/gm;
      let out = '';
      let last = 0;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        out += src.slice(last, m.index) + (await load(pathJoin(dirname(path), m[1]), seen));
        last = m.index + m[0].length;
      }
      return (out + src.slice(last)).replace(/^\s*export\s+(default\s+)?/gm, '');
    };
    try {
      const code = await load(active);
      Function('console', `"use strict";\n${code}`)(fakeConsole);
      setOutput([`> node ${basename(active)}`, ...logs, '', '[Process exited with code 0]']);
    } catch (e) {
      setOutput([`> node ${basename(active)}`, ...logs, `✖ ${(e as Error).message}`, '[Process exited with code 1]']);
    }
  };

  // Workspace search: walks the root folder via fsapi (bounded, skips heavy folders).
  useEffect(() => {
    if (!query || !root) {
      setSearchResults([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      const q = query.toLowerCase();
      const results: { p: string; line: string; n: number }[] = [];
      let files = 0;
      const walk = async (dir: string, depth: number): Promise<void> => {
        if (!live || depth > 5 || files > 400 || results.length >= 100) return;
        const entries = await fsapi.list(dir).catch(() => []);
        for (const e of entries) {
          if (!live || results.length >= 100) return;
          if (e.type === 'dir') {
            if (!SKIP_DIRS.has(e.name)) await walk(e.path, depth + 1);
          } else if (e.size < 512 * 1024 && !BINARY_EXT.has(extname(e.name))) {
            files++;
            const text = await fsapi.readText(e.path).catch(() => '');
            if (text.startsWith('data:')) continue;
            text.split('\n').forEach((line, i) => {
              if (results.length < 100 && line.toLowerCase().includes(q)) results.push({ p: e.path, line: line.trim(), n: i + 1 });
            });
          }
        }
      };
      await walk(root, 0);
      if (live) {
        setSearchResults(results);
        setSearching(false);
      }
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [query, root, rev]);

  const commands = [
    { label: 'File: Save', run: () => save() },
    { label: 'File: Save As…', run: () => setDialog('save') },
    { label: 'File: Open File…', run: () => setDialog('open') },
    { label: 'File: Save All', run: () => tabs.forEach((t) => save(t)) },
    { label: 'File: New File', run: newFile },
    { label: 'Run: Run Active File', run: runFile },
    { label: 'View: Toggle Output', run: () => setOutput((o) => (o ? null : [])) },
    ...(home
      ? [
          { label: 'Workspace: Open Home Folder', run: () => setRoot(home) },
          { label: 'Workspace: Open Documents', run: () => setRoot(`${home}/Documents`) },
        ]
      : []),
    ...(active ? [{ label: 'Workspace: Open Folder of Active File', run: () => setRoot(dirname(active)) }] : []),
  ];

  return (
    <div className="relative flex h-full flex-col bg-[#1e1f29] text-[13px] text-[#cccccc]">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 bg-[#16171f] py-2">
          {[
            { id: 'explorer', icon: Files },
            { id: 'search', icon: Search },
          ].map((a) => (
            <button key={a.id} onClick={() => setPanel(a.id as typeof panel)} className={cx('relative grid h-11 w-12 place-items-center', panel === a.id ? 'text-white' : 'text-white/40 hover:text-white/80')} aria-label={a.id}>
              {panel === a.id && <span className="absolute left-0 h-6 w-0.5 bg-white" />}
              <a.icon size={22} strokeWidth={1.5} />
            </button>
          ))}
          <div className="grid h-11 w-12 place-items-center text-white/40">
            <GitBranch size={22} strokeWidth={1.5} />
          </div>
          <div className="grid h-11 w-12 place-items-center text-white/40">
            <Blocks size={22} strokeWidth={1.5} />
          </div>
          <button className="mt-auto grid h-11 w-12 place-items-center text-emerald-400/80 hover:text-emerald-300" onClick={runFile} aria-label="Run" title="Run (JavaScript)">
            <Play size={20} />
          </button>
        </div>

        {/* Side bar */}
        <div className="flex w-56 shrink-0 flex-col border-r border-black/30 bg-[#191a23]">
          <div className="flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            {panel === 'explorer' ? 'Explorer' : 'Search'}
            {panel === 'explorer' && (
              <div className="flex gap-1">
                <button onClick={newFile} aria-label="New file" title="New file" className="hover:text-white">
                  <FilePlus size={14} />
                </button>
                <button onClick={() => setDialog('open')} aria-label="Open file" title="Open file… (Ctrl+O)" className="hover:text-white">
                  <FolderOpen size={14} />
                </button>
                <button onClick={() => root && setRoot(dirname(root))} aria-label="Parent folder" title="Open parent folder" className="hover:text-white">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => setRev((r) => r + 1)} aria-label="Refresh" title="Refresh" className="hover:text-white">
                  <RefreshCw size={13} />
                </button>
              </div>
            )}
          </div>
          {panel === 'explorer' ? (
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              {root ? (
                <>
                  <div className="truncate px-3 pb-1 text-[11px] font-bold uppercase text-white/70" title={root}>
                    {basename(root)}
                  </div>
                  <Tree path={root} depth={0} active={active} onOpen={openFile} rev={rev} />
                </>
              ) : (
                <div className="px-3 text-white/40">Loading…</div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="mb-2 rounded border border-white/10 bg-[#2a2b36] px-2 py-1 outline-none focus:border-sky-500" />
              {searching && <div className="mb-1 text-[11px] text-white/40">Searching…</div>}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => openFile(r.p)} className="block w-full truncate rounded px-1 py-0.5 text-left text-[12px] hover:bg-white/5">
                    <span className="text-sky-300">{basename(r.p)}</span>
                    <span className="text-white/35">:{r.n} </span>
                    {r.line}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="no-scrollbar flex h-9 shrink-0 overflow-x-auto bg-[#16171f]">
            {tabs.map((t) => (
              <div key={t} onClick={() => setActive(t)} title={t} className={cx('group flex shrink-0 cursor-default items-center gap-2 border-r border-black/30 px-3', t === active ? 'border-t border-t-sky-500 bg-[#1e1f29] text-white' : 'text-white/50 hover:bg-white/[.03]')}>
                <FileCode2 size={14} className="text-amber-300" />
                {basename(t)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t);
                  }}
                  className="grid h-4 w-4 place-items-center rounded hover:bg-white/10"
                  aria-label={`Close ${basename(t)}`}
                >
                  {dirty.has(t) ? <Circle size={8} fill="currentColor" className="group-hover:hidden" /> : null}
                  <X size={12} className={dirty.has(t) ? 'hidden group-hover:block' : ''} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-1 px-4 text-[12px] text-white/40">
            {(home && active.startsWith(home) ? '~' + active.slice(home.length) : active)
              .split('/')
              .filter(Boolean)
              .map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {seg}
                  {i < arr.length - 1 && <ChevronRight size={12} />}
                </span>
              ))}
          </div>
          <div ref={host} className={cx('min-h-0 flex-1 overflow-hidden', (!active || loading) && 'hidden')} />
          {active && loading && <div className="grid flex-1 place-items-center text-white/40">Loading {basename(active)}…</div>}
          {!active && (
            <div className="grid flex-1 place-items-center text-white/30">
              <div className="text-center">
                <FileCode2 size={64} className="mx-auto mb-3 opacity-40" />
                Open a file from the Explorer · <kbd className="rounded bg-white/10 px-1">Ctrl+O</kbd> to open · <kbd className="rounded bg-white/10 px-1">Ctrl+Shift+P</kbd> for commands
              </div>
            </div>
          )}
          {output && (
            <div className="h-40 shrink-0 border-t border-white/10 bg-[#16171f]">
              <div className="flex items-center justify-between px-4 py-1 text-[11px] uppercase tracking-wider text-white/50">
                Output
                <button onClick={() => setOutput(null)} aria-label="Close output">
                  <X size={13} />
                </button>
              </div>
              <pre className="selectable h-[calc(100%-24px)] overflow-y-auto px-4 font-mono text-[12px] text-white/80">{output.join('\n')}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 bg-[#2563eb] px-3 text-[11px] text-white">
        <span className="flex items-center gap-1">
          <GitBranch size={12} /> main
        </span>
        <span>{dirty.size ? `${dirty.size} unsaved` : 'All saved'}</span>
        <button className="flex items-center gap-1 hover:bg-white/10" onClick={() => save()}>
          <Save size={12} /> Save
        </button>
        <button className="flex items-center gap-1 hover:bg-white/10" onClick={() => active && setDialog('save')}>
          Save As…
        </button>
        <span className="ml-auto">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>{active ? languageFor(active).name : ''}</span>
      </div>

      {palette && (
        <div className="absolute inset-0 z-20 flex justify-center bg-black/30 pt-10" onClick={() => setPalette(false)}>
          <CommandPalette commands={commands} onClose={() => setPalette(false)} />
        </div>
      )}

      {dialog && (
        <FileDialog
          mode={dialog}
          initialDir={active ? dirname(active) : root ?? home ?? '/'}
          defaultName={dialog === 'save' && active ? basename(active) : ''}
          onCancel={() => setDialog(null)}
          onConfirm={(p) => {
            setDialog(null);
            if (dialog === 'open') openFile(p);
            else if (activeRef.current) saveAs(p);
          }}
        />
      )}
    </div>
  );
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next', 'target', '__pycache__']);
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'pdf', 'zip', 'gz', 'tar', 'mp3', 'mp4', 'wav', 'webm', 'woff', 'woff2', 'ttf', 'otf', 'so', 'o', 'bin', 'exe']);

function CommandPalette({ commands, onClose }: { commands: { label: string; run: () => void }[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="h-fit w-[min(520px,90%)] overflow-hidden rounded-lg border border-white/10 bg-[#252632] shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setI(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setI((x) => Math.min(list.length - 1, x + 1));
          else if (e.key === 'ArrowUp') setI((x) => Math.max(0, x - 1));
          else if (e.key === 'Enter' && list[i]) {
            list[i].run();
            onClose();
          } else if (e.key === 'Escape') onClose();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
        placeholder="> Type a command"
        className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-[13px] outline-none"
      />
      {list.map((c, idx) => (
        <button
          key={c.label}
          onMouseEnter={() => setI(idx)}
          onClick={() => {
            c.run();
            onClose();
          }}
          className={cx('block w-full px-3 py-1.5 text-left text-[13px]', idx === i ? 'bg-sky-600/40 text-white' : 'text-white/75')}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Tree({ path, depth, active, onOpen, rev }: { path: string; depth: number; active: string; onOpen: (p: string) => void; rev: number }) {
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ [`${path}/src`]: true });
  useEffect(() => {
    let live = true;
    fsapi.list(path).then(
      (list) => {
        if (!live) return;
        setErr(null);
        setEntries([...list].sort((x, y) => (x.type === y.type ? x.name.localeCompare(y.name) : x.type === 'dir' ? -1 : 1)));
      },
      (e) => live && setErr(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [path, rev]);
  if (err) return <div className="truncate py-0.5 text-[12px] text-red-300/80" style={{ paddingLeft: 22 + depth * 12 }} title={err}>{err}</div>;
  if (!entries) return <div className="py-0.5 text-[12px] text-white/30" style={{ paddingLeft: 22 + depth * 12 }}>…</div>;
  return (
    <>
      {entries.map((e) =>
        e.type === 'dir' ? (
          <div key={e.path}>
            <button onClick={() => setOpen((o) => ({ ...o, [e.path]: !o[e.path] }))} className="flex w-full items-center gap-1 py-0.5 text-left hover:bg-white/5" style={{ paddingLeft: 8 + depth * 12 }}>
              {open[e.path] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="truncate">{e.name}</span>
            </button>
            {open[e.path] && <Tree path={e.path} depth={depth + 1} active={active} onOpen={onOpen} rev={rev} />}
          </div>
        ) : (
          <button key={e.path} onClick={() => onOpen(e.path)} className={cx('flex w-full items-center gap-1.5 py-0.5 text-left', e.path === active ? 'bg-sky-600/30 text-white' : 'hover:bg-white/5')} style={{ paddingLeft: 22 + depth * 12 }}>
            <FileCode2 size={13} className={extname(e.name) === 'md' ? 'text-sky-300' : extname(e.name) === 'json' ? 'text-yellow-300' : 'text-amber-300'} />
            <span className="truncate">{e.name}</span>
          </button>
        ),
      )}
    </>
  );
}
