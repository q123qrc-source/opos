/**
 * Mirrors the shared shell state between this renderer and the session's main process.
 * Every surface (desktop, panels, overlays, app windows) runs this, so a Start-menu click in the
 * panel opens the overlay window, a mode switch re-lays out every surface, and so on.
 */
import { bridge, isSession } from '../lib/bridge';
import { useOS } from '../store/useOS';
import { DEFAULT_SETTINGS } from '../store/useOS';

/** Keys owned jointly by all surfaces. `windows`/`screen` are written only by the main process. */
const SHARED = ['mode', 'modeLock', 'settings', 'pinned', 'mobileDock', 'overlay', 'toasts', 'history'] as const;
const MAIN_OWNED = ['windows', 'screen'] as const;

let applyingRemote = false;

function normalize(state: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of [...SHARED, ...MAIN_OWNED]) if (k in state) out[k] = state[k];
  if (out.settings) out.settings = { ...DEFAULT_SETTINGS, ...(out.settings as object) };
  if (Array.isArray(out.pinned) && out.pinned.length === 0) delete out.pinned; // keep renderer defaults on first run
  if (Array.isArray(out.mobileDock) && out.mobileDock.length === 0) delete out.mobileDock;
  return out;
}

export function startSessionSync() {
  if (!isSession || !bridge.session) return;
  const session = bridge.session;

  applyingRemote = true;
  useOS.setState(normalize(session.initialState ?? {}));
  applyingRemote = false;

  // Push first-run defaults (pinned apps, dock) back so every surface agrees.
  const st = useOS.getState();
  session.patch({ pinned: st.pinned, mobileDock: st.mobileDock, settings: st.settings });

  session.onPatch((changed) => {
    applyingRemote = true;
    useOS.setState(normalize(changed));
    applyingRemote = false;
  });

  useOS.subscribe((s, prev) => {
    if (applyingRemote) return;
    const patch: Record<string, unknown> = {};
    for (const k of SHARED) if (s[k] !== prev[k]) patch[k] = s[k];
    if (Object.keys(patch).length) session.patch(patch);
  });

  // Installed applications (each surface keeps its own copy).
  void bridge.apps?.list().then((apps) => useOS.setState({ installedApps: apps }));
  bridge.apps?.onChange((apps) => useOS.setState({ installedApps: apps }));
}
