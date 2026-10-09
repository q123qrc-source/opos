/**
 * Virtual file system shared by File Explorer, Terminal, Code Editor, Writer, Notes & Photo Editor.
 * Flat path-keyed map persisted to localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FsNode {
  type: 'dir' | 'file';
  content?: string;
  mtime: number;
}

export const HOME = '/home/guest';

const now = Date.now();
const file = (content: string, ageMin = 0): FsNode => ({ type: 'file', content, mtime: now - ageMin * 60000 });
const dir = (ageMin = 0): FsNode => ({ type: 'dir', mtime: now - ageMin * 60000 });

const SEED: Record<string, FsNode> = {
  '/': dir(),
  '/home': dir(),
  [HOME]: dir(),
  [`${HOME}/Desktop`]: dir(),
  [`${HOME}/Documents`]: dir(),
  [`${HOME}/Downloads`]: dir(),
  [`${HOME}/Music`]: dir(),
  [`${HOME}/Pictures`]: dir(),
  [`${HOME}/Projects`]: dir(),
  [`${HOME}/Projects/opos-app`]: dir(),
  [`${HOME}/Projects/opos-app/src`]: dir(),
  '/system': dir(),
  '/system/apps': dir(),
  [`${HOME}/Documents/Welcome.txt`]: file(
    'Welcome to OPOS — the Open Platform OS.\n\nOne shell, three environments:\n  • Desktop — move the mouse or widen the window\n  • Mobile  — touch the screen or go narrow & portrait\n  • TV      — press the arrow keys / Enter three times\n\nTry the Terminal: type `help`.\n',
    120,
  ),
  [`${HOME}/Documents/Roadmap.md`]: file(
    '# OPOS Roadmap\n\n- [x] Convergence engine\n- [x] Spatial navigation\n- [x] Window manager\n- [ ] Multi-display\n- [ ] OTA updates\n',
    60 * 26,
  ),
  [`${HOME}/Documents/Budget.csv`]: file('month,income,expenses\nJan,4200,3100\nFeb,4300,2900\nMar,4500,3300\n', 60 * 72),
  [`${HOME}/Desktop/todo.txt`]: file('- Test Widevine in OPOS Cinema\n- Pair the game controller\n- Write the quarterly report\n', 30),
  [`${HOME}/Projects/opos-app/package.json`]: file(
    '{\n  "name": "opos-app",\n  "version": "0.1.0",\n  "main": "src/index.js",\n  "scripts": { "start": "node src/index.js" }\n}\n',
    300,
  ),
  [`${HOME}/Projects/opos-app/README.md`]: file('# opos-app\n\nA sample project for the OPOS Code Editor.\n', 300),
  [`${HOME}/Projects/opos-app/src/index.js`]: file(
    "import { greet } from './greet.js';\n\nconst modes = ['desktop', 'mobile', 'tv'];\n\nfor (const mode of modes) {\n  console.log(greet(mode));\n}\n",
    200,
  ),
  [`${HOME}/Projects/opos-app/src/greet.js`]: file(
    "/** Returns a friendly greeting for an OPOS environment. */\nexport function greet(mode) {\n  return `Hello from ${mode.toUpperCase()} mode!`;\n}\n",
    200,
  ),
  [`${HOME}/Projects/opos-app/src/styles.css`]: file(':root {\n  --accent: #6366f1;\n}\n\nbody {\n  margin: 0;\n  background: #07080d;\n  color: white;\n}\n', 200),
  [`${HOME}/Music/playlist.m3u`]: file('#EXTM3U\nNeon Cascade.ogg\nPaper Lanterns.ogg\nLow Orbit.ogg\n', 600),
  '/system/version': file('OPOS 1.0.0 "Convergence"\n'),
};

interface FsState {
  nodes: Record<string, FsNode>;
  write: (path: string, content: string) => void;
  mkdir: (path: string) => void;
  remove: (path: string) => void;
  rename: (from: string, to: string) => void;
  reset: () => void;
}

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

export function resolvePath(cwd: string, input: string): string {
  if (!input) return cwd;
  if (input === '~') return HOME;
  if (input.startsWith('~/')) return normalize(HOME + input.slice(1));
  return normalize(input.startsWith('/') ? input : `${cwd}/${input}`);
}

export const dirname = (p: string) => normalize(p.split('/').slice(0, -1).join('/') || '/');
export const basename = (p: string) => p.split('/').filter(Boolean).pop() ?? '/';
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};

export const useFs = create<FsState>()(
  persist(
    (set) => ({
      nodes: SEED,
      write: (path, content) =>
        set((s) => {
          const p = normalize(path);
          const nodes = { ...s.nodes };
          ensureParents(nodes, p);
          nodes[p] = { type: 'file', content, mtime: Date.now() };
          return { nodes };
        }),
      mkdir: (path) =>
        set((s) => {
          const p = normalize(path);
          if (s.nodes[p]) return s;
          const nodes = { ...s.nodes };
          ensureParents(nodes, p);
          nodes[p] = { type: 'dir', mtime: Date.now() };
          return { nodes };
        }),
      remove: (path) =>
        set((s) => {
          const p = normalize(path);
          const nodes: Record<string, FsNode> = {};
          for (const [k, v] of Object.entries(s.nodes)) if (k !== p && !k.startsWith(p + '/')) nodes[k] = v;
          return { nodes };
        }),
      rename: (from, to) =>
        set((s) => {
          const a = normalize(from);
          const b = normalize(to);
          if (a === b || !s.nodes[a] || s.nodes[b]) return s;
          const nodes: Record<string, FsNode> = {};
          for (const [k, v] of Object.entries(s.nodes)) {
            if (k === a) nodes[b] = { ...v, mtime: Date.now() };
            else if (k.startsWith(a + '/')) nodes[b + k.slice(a.length)] = v;
            else nodes[k] = v;
          }
          return { nodes };
        }),
      reset: () => set({ nodes: SEED }),
    }),
    { name: 'opos-fs' },
  ),
);

function ensureParents(nodes: Record<string, FsNode>, p: string) {
  let cur = dirname(p);
  const missing: string[] = [];
  while (!nodes[cur] && cur !== '/') {
    missing.push(cur);
    cur = dirname(cur);
  }
  for (const m of missing) nodes[m] = { type: 'dir', mtime: Date.now() };
}

export function listDir(nodes: Record<string, FsNode>, path: string): { path: string; name: string; node: FsNode }[] {
  const p = normalize(path);
  const prefix = p === '/' ? '/' : p + '/';
  return Object.entries(nodes)
    .filter(([k]) => k !== p && k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
    .map(([k, node]) => ({ path: k, name: basename(k), node }))
    .sort((x, y) => (x.node.type === y.node.type ? x.name.localeCompare(y.name) : x.node.type === 'dir' ? -1 : 1));
}

export const fs = {
  get: () => useFs.getState(),
  stat: (path: string) => useFs.getState().nodes[normalize(path)],
  read: (path: string) => useFs.getState().nodes[normalize(path)]?.content,
  list: (path: string) => listDir(useFs.getState().nodes, path),
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
