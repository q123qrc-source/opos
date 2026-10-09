/**
 * Back navigation stack. Apps register handlers (e.g. "leave conversation", "webview.goBack()");
 * the shell's Back button / ESC / remote Back walks them before falling back to "go home".
 */
import { useEffect, useRef } from 'react';
import { useOS } from '../store/useOS';

type Handler = () => boolean;
const handlers = new Map<string, Set<{ fn: Handler }>>();

export function registerBack(pid: string, fn: Handler): () => void {
  const entry = { fn };
  if (!handlers.has(pid)) handlers.set(pid, new Set());
  handlers.get(pid)!.add(entry);
  return () => handlers.get(pid)?.delete(entry);
}

/** Register a back handler for the lifetime of the component. Return true if handled. */
export function useBackHandler(pid: string, fn: Handler, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    return registerBack(pid, () => ref.current());
  }, [pid, enabled]);
}

export function performBack(): boolean {
  const s = useOS.getState();
  if (s.contextMenu) {
    s.closeContextMenu();
    return true;
  }
  if (s.overlay !== 'none') {
    s.setOverlay('none');
    return true;
  }
  const pid = s.focusedPid;
  if (pid) {
    const list = Array.from(handlers.get(pid) ?? []).reverse(); // most recently registered first
    for (const h of list) if (h.fn()) return true;
    if (s.mode !== 'desktop') {
      s.goHome();
      return true;
    }
  }
  return false;
}
