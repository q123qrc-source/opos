/**
 * One async filesystem API for OPOS apps. In Electron it is the real filesystem (main process);
 * in a plain browser it is the persisted virtual filesystem from ./vfs.
 */
import { bridge, type FsEntry, type Place } from './bridge';
import { HOME as VHOME, basename, dirname, fs as vfs, listDir, normalize, useFs } from './vfs';

export interface FsAdapter {
  real: boolean;
  home(): Promise<string>;
  places(): Promise<Place[]>;
  list(dir: string, opts?: { hidden?: boolean }): Promise<FsEntry[]>;
  readText(p: string): Promise<string>;
  readDataUrl(p: string): Promise<string>;
  writeText(p: string, content: string): Promise<void>;
  writeDataUrl(p: string, data: string): Promise<void>;
  mkdir(p: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  trash(p: string): Promise<void>;
  exists(p: string): Promise<boolean>;
  /** Open with the system's default application (real FS only). */
  openExternal?(p: string): Promise<void>;
}

const realFs: FsAdapter | null = bridge.fs
  ? {
      real: true,
      home: () => bridge.fs!.home(),
      places: () => bridge.fs!.places(),
      list: (d, o) => bridge.fs!.list(d, o),
      readText: (p) => bridge.fs!.readText(p),
      readDataUrl: (p) => bridge.fs!.readDataUrl(p),
      writeText: (p, c) => bridge.fs!.writeText(p, c),
      writeDataUrl: (p, d) => bridge.fs!.writeDataUrl(p, d),
      mkdir: (p) => bridge.fs!.mkdir(p),
      rename: (a, b) => bridge.fs!.rename(a, b),
      trash: (p) => bridge.fs!.trash(p),
      exists: (p) =>
        bridge.fs!.stat(p).then(
          () => true,
          () => false,
        ),
      openExternal: (p) => bridge.fs!.open(p),
    }
  : null;

const virtualFs: FsAdapter = {
  real: false,
  home: async () => VHOME,
  places: async () =>
    [
      ['Home', VHOME, 'home'],
      ['Desktop', `${VHOME}/Desktop`, 'desktop'],
      ['Documents', `${VHOME}/Documents`, 'documents'],
      ['Downloads', `${VHOME}/Downloads`, 'downloads'],
      ['Pictures', `${VHOME}/Pictures`, 'pictures'],
      ['Music', `${VHOME}/Music`, 'music'],
      ['Computer', '/', 'drive'],
    ].map(([label, path, icon]) => ({ label, path, icon })),
  list: async (dir, opts) =>
    listDir(useFs.getState().nodes, dir)
      .filter((e) => opts?.hidden || !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: e.path, type: e.node.type, size: e.node.content?.length ?? 0, mtime: e.node.mtime })),
  readText: async (p) => {
    const c = vfs.read(p);
    if (c === undefined) throw new Error(`${basename(p)} not found`);
    return c;
  },
  readDataUrl: async (p) => {
    const c = vfs.read(p);
    if (!c?.startsWith('data:')) throw new Error('Not an image');
    return c;
  },
  writeText: async (p, c) => useFs.getState().write(p, c),
  writeDataUrl: async (p, d) => useFs.getState().write(p, d),
  mkdir: async (p) => useFs.getState().mkdir(p),
  rename: async (a, b) => {
    if (vfs.stat(b)) throw new Error(`${basename(b)} already exists`);
    useFs.getState().rename(a, b);
  },
  trash: async (p) => useFs.getState().remove(p),
  exists: async (p) => !!vfs.stat(p),
};

export const fsapi: FsAdapter = realFs ?? virtualFs;

export const pathJoin = (...parts: string[]) => normalize(parts.join('/'));
export { basename, dirname };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export async function uniquePath(dir: string, base: string, ext = '') {
  let p = pathJoin(dir, `${base}${ext}`);
  for (let i = 2; await fsapi.exists(p); i++) p = pathJoin(dir, `${base} (${i})${ext}`);
  return p;
}
