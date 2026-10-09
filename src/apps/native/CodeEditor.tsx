/** Code Editor — a VS Code-style IDE (activity bar, explorer, tabs, status bar) on CodeMirror 6. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Files, Search, GitBranch, Blocks, Play, X, ChevronRight, ChevronDown, FileCode2, FilePlus, Save, Circle, FolderOpen } from 'lucide-react';
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
import { HOME, basename, dirname, extname, listDir, useFs } from '../../lib/vfs';
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
  const nodes = useFs((s) => s.nodes);
  const initialPath = params?.path as string | undefined;
  const [root, setRoot] = useState(() => (initialPath ? dirname(initialPath) : `${HOME}/Projects/opos-app`));
  const [tabs, setTabs] = useState<string[]>(() => (initialPath ? [initialPath] : [`${HOME}/Projects/opos-app/src/index.js`]));
  const [active, setActive] = useState<string>(tabs[0]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [panel, setPanel] = useState<'explorer' | 'search'>('explorer');
  const [query, setQuery] = useState('');
  const [output, setOutput] = useState<string[] | null>(null);
  const [palette, setPalette] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const activeRef = useRef(active);
  activeRef.current = active;
  const setTitle = useOS((s) => s.setTitle);

  // Open files requested via params (e.g. from File Explorer).
  useEffect(() => {
    if (!initialPath) return;
    setTabs((t) => (t.includes(initialPath) ? t : [...t, initialPath]));
    setActive(initialPath);
  }, [initialPath]);

  const save = (path = activeRef.current) => {
    const st = path === activeRef.current && view.current ? view.current.state : states.current.get(path);
    if (!st) return;
    useFs.getState().write(path, st.doc.toString());
    setDirty((d) => {
      const n = new Set(d);
      n.delete(path);
      return n;
    });
  };

  const makeState = (path: string) =>
    EditorState.create({
      doc: useFs.getState().nodes[path]?.content ?? '',
      extensions: [
        basicSetup,
        oneDark,
        editorTheme,
        ...languageFor(path).ext,
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (save(), true) },
          { key: 'Mod-Shift-p', preventDefault: true, run: () => (setPalette(true), true) },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDirty((d) => new Set(d).add(activeRef.current));
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

  // Swap documents when switching tabs (each tab keeps its own state + undo history).
  useEffect(() => {
    const v = view.current;
    if (!v || !active) return;
    let st = states.current.get(active);
    if (!st) {
      st = makeState(active);
      states.current.set(active, st);
    }
    v.setState(st);
    v.focus();
    setTitle(pid, `${basename(active)} — Code Editor`);
    return () => {
      states.current.set(active, v.state);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = (path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
  };
  const closeTab = (path: string) => {
    states.current.delete(path);
    setTabs((t) => {
      const next = t.filter((x) => x !== path);
      if (active === path) setActive(next[next.length - 1] ?? '');
      return next;
    });
  };

  const newFile = () => {
    let i = 1;
    let p = `${root}/untitled-${i}.js`;
    while (useFs.getState().nodes[p]) p = `${root}/untitled-${++i}.js`;
    useFs.getState().write(p, '');
    openFile(p);
  };

  const runFile = () => {
    if (!['js', 'mjs'].includes(extname(active))) {
      setOutput([`Run is supported for JavaScript files (current: ${languageFor(active).name}).`]);
      return;
    }
    const logs: string[] = [];
    const fmt = (a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a));
    const fakeConsole = { log: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')), error: (...a: unknown[]) => logs.push('✖ ' + a.map(fmt).join(' ')), warn: (...a: unknown[]) => logs.push('⚠ ' + a.map(fmt).join(' ')) };
    // Inline relative ES imports from the VFS so small multi-file projects run.
    const load = (path: string, seen = new Set<string>()): string => {
      if (seen.has(path)) return '';
      seen.add(path);
      const src = path === active && view.current ? view.current.state.doc.toString() : useFs.getState().nodes[path]?.content ?? '';
      return src
        .replace(/^\s*import\s+[^'"]*from\s+['"](\.[^'"]+)['"];?/gm, (_m, rel: string) => load(`${dirname(path)}/${rel.replace(/^\.\//, '')}`, seen))
        .replace(/^\s*export\s+(default\s+)?/gm, '');
    };
    try {
      const code = load(active);
      Function('console', `"use strict";\n${code}`)(fakeConsole);
      setOutput([`> node ${basename(active)}`, ...logs, '', '[Process exited with code 0]']);
    } catch (e) {
      setOutput([`> node ${basename(active)}`, ...logs, `✖ ${(e as Error).message}`, '[Process exited with code 1]']);
    }
  };

  const searchResults = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return Object.entries(nodes)
      .filter(([p, n]) => p.startsWith(root) && n.type === 'file' && !n.content?.startsWith('data:'))
      .flatMap(([p, n]) =>
        (n.content ?? '')
          .split('\n')
          .map((line, i) => ({ p, line: line.trim(), n: i + 1 }))
          .filter((r) => r.line.toLowerCase().includes(q)),
      )
      .slice(0, 100);
  }, [query, nodes, root]);

  const commands = [
    { label: 'File: Save', run: () => save() },
    { label: 'File: Save All', run: () => tabs.forEach((t) => save(t)) },
    { label: 'File: New File', run: newFile },
    { label: 'Run: Run Active File', run: runFile },
    { label: 'View: Toggle Output', run: () => setOutput((o) => (o ? null : [])) },
    { label: 'Workspace: Open Home Folder', run: () => setRoot(HOME) },
    { label: 'Workspace: Open Projects', run: () => setRoot(`${HOME}/Projects/opos-app`) },
  ];

  return (
    <div className="relative flex h-full flex-col bg-[#1e1f29] text-[13px] text-[#cccccc]">
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
                <button onClick={() => setRoot(dirname(root))} aria-label="Parent folder" title="Open parent folder" className="hover:text-white">
                  <FolderOpen size={14} />
                </button>
              </div>
            )}
          </div>
          {panel === 'explorer' ? (
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <div className="px-3 pb-1 text-[11px] font-bold uppercase text-white/70">{basename(root)}</div>
              <Tree path={root} depth={0} active={active} onOpen={openFile} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="mb-2 rounded border border-white/10 bg-[#2a2b36] px-2 py-1 outline-none focus:border-sky-500" />
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
              <div key={t} onClick={() => setActive(t)} className={cx('group flex shrink-0 cursor-default items-center gap-2 border-r border-black/30 px-3', t === active ? 'border-t border-t-sky-500 bg-[#1e1f29] text-white' : 'text-white/50 hover:bg-white/[.03]')}>
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
            {active
              .replace(HOME, '~')
              .split('/')
              .filter(Boolean)
              .map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {seg}
                  {i < arr.length - 1 && <ChevronRight size={12} />}
                </span>
              ))}
          </div>
          <div ref={host} className={cx('min-h-0 flex-1 overflow-hidden', !active && 'hidden')} />
          {!active && (
            <div className="grid flex-1 place-items-center text-white/30">
              <div className="text-center">
                <FileCode2 size={64} className="mx-auto mb-3 opacity-40" />
                Open a file from the Explorer · <kbd className="rounded bg-white/10 px-1">Ctrl+Shift+P</kbd> for commands
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
    </div>
  );
}

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

function Tree({ path, depth, active, onOpen }: { path: string; depth: number; active: string; onOpen: (p: string) => void }) {
  const nodes = useFs((s) => s.nodes);
  const [open, setOpen] = useState<Record<string, boolean>>({ [`${path}/src`]: true });
  return (
    <>
      {listDir(nodes, path).map((e) =>
        e.node.type === 'dir' ? (
          <div key={e.path}>
            <button onClick={() => setOpen((o) => ({ ...o, [e.path]: !o[e.path] }))} className="flex w-full items-center gap-1 py-0.5 text-left hover:bg-white/5" style={{ paddingLeft: 8 + depth * 12 }}>
              {open[e.path] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {e.name}
            </button>
            {open[e.path] && <Tree path={e.path} depth={depth + 1} active={active} onOpen={onOpen} />}
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
