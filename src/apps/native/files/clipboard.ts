/** File clipboard shared by every File Explorer window (copy/cut → paste). */
import { create } from 'zustand';

export interface FileClipboard {
  op: 'copy' | 'cut' | null;
  paths: string[];
  set: (op: 'copy' | 'cut', paths: string[]) => void;
  clear: () => void;
}

export const useFileClipboard = create<FileClipboard>()((set) => ({
  op: null,
  paths: [],
  set: (op, paths) => set({ op, paths }),
  clear: () => set({ op: null, paths: [] }),
}));

/** Electron wraps IPC errors as "Error invoking remote method 'x': Error: msg" — keep just msg. */
export function errMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)$/s);
  const msg = (m ? m[1] : raw).trim();
  if (/EACCES|EPERM/.test(msg)) return 'Permission denied';
  if (/ENOENT/.test(msg)) return 'No such file or folder';
  if (/ENOTDIR/.test(msg)) return 'Not a folder';
  if (/EEXIST/.test(msg)) return 'Already exists';
  return msg || 'Unknown error';
}
