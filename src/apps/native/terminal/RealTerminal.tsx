/** Real terminal: xterm.js tabs connected to PTYs via the Electron bridge (node-pty, $SHELL -l). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Plus, X } from 'lucide-react';
import { bridge } from '../../../lib/bridge';
import { useOS } from '../../../store/useOS';

type Pty = NonNullable<typeof bridge.pty>;

const THEME: ITheme = {
  background: '#0a0c12',
  foreground: '#e5e7eb',
  cursor: '#67e8f9',
  cursorAccent: '#0a0c12',
  selectionBackground: 'rgba(103, 232, 249, 0.28)',
  black: '#1f2430',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fcd34d',
  blue: '#38bdf8',
  magenta: '#e879f9',
  cyan: '#67e8f9',
  white: '#d1d5db',
  brightBlack: '#6b7280',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fde68a',
  brightBlue: '#7dd3fc',
  brightMagenta: '#f0abfc',
  brightCyan: '#a5f3fc',
  brightWhite: '#ffffff',
};

const FONT = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace";

interface Tab {
  key: number;
  title: string;
}
let tabSeq = 0;

/** A cwd is only passed on if it exists on the real filesystem (params may carry virtual paths). */
async function realCwd(cwd: unknown): Promise<string | undefined> {
  if (typeof cwd !== 'string' || !cwd) return undefined;
  if (!bridge.fs) return cwd;
  try {
    if ((await bridge.fs.stat(cwd)).type === 'dir') return cwd;
  } catch {
    /* missing */
  }
  return undefined;
}

export default function RealTerminal({ pty, pid, cwd }: { pty: Pty; pid: string; cwd?: string }) {
  const [tabs, setTabs] = useState<Tab[]>(() => [{ key: ++tabSeq, title: 'shell' }]);
  const [active, setActive] = useState(tabs[0].key);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const newTab = useCallback(() => {
    const t = { key: ++tabSeq, title: 'shell' };
    setTabs((ts) => [...ts, t]);
    setActive(t.key);
  }, []);

  const closeTab = useCallback(
    (key: number) => {
      const ts = tabsRef.current;
      const idx = ts.findIndex((t) => t.key === key);
      if (idx < 0) return;
      const next = ts.filter((t) => t.key !== key);
      if (!next.length) {
        useOS.getState().close(pid);
        return;
      }
      setTabs(next);
      setActive((a) => (a === key ? next[Math.min(idx, next.length - 1)].key : a));
    },
    [pid],
  );

  const setTitle = useCallback((key: number, title: string) => {
    setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, title: title || 'shell' } : t)));
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#0a0c12] text-white/90">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-black/30 px-1.5 py-1 text-xs">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div
              key={t.key}
              onMouseDown={() => setActive(t.key)}
              className={`group flex min-w-0 max-w-[14rem] shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 py-1 ${t.key === active ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5'}`}
            >
              <span className="truncate">{t.title}</span>
              <button
                aria-label="Close tab"
                className="rounded p-0.5 opacity-60 hover:bg-white/15 hover:opacity-100"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => closeTab(t.key)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <button aria-label="New tab" title="New tab (Ctrl+Shift+T)" className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={newTab}>
          <Plus size={14} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <XtermPane key={t.key} pty={pty} cwd={cwd} active={t.key === active} onTitle={(s) => setTitle(t.key, s)} onNewTab={newTab} onClose={() => closeTab(t.key)} />
        ))}
      </div>
    </div>
  );
}

interface PaneProps {
  pty: Pty;
  cwd?: string;
  active: boolean;
  onTitle(title: string): void;
  onNewTab(): void;
  onClose(): void;
}

function XtermPane({ pty, cwd, active, onTitle, onNewTab, onClose }: PaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Latest callbacks, so the terminal setup effect runs only once per pane.
  const cb = useRef({ onTitle, onNewTab, onClose });
  cb.current = { onTitle, onNewTab, onClose };

  useEffect(() => {
    const host = hostRef.current!;
    const term = new XTerm({
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => bridge.openExternal(uri)));
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    let id: number | null = null;
    let exited = false;
    let starting = false;
    let pending: [number, string][] = [];

    const safeFit = () => {
      if (!host.offsetWidth || !host.offsetHeight) return;
      try {
        fit.fit();
      } catch {
        /* not rendered yet */
      }
    };

    const start = async () => {
      if (starting || disposed) return;
      starting = true;
      exited = false;
      pending = [];
      safeFit();
      const dir = await realCwd(cwd);
      let newId: number;
      try {
        newId = await pty.create({ cols: term.cols, rows: term.rows, cwd: dir }).catch((e) => (dir ? pty.create({ cols: term.cols, rows: term.rows }) : Promise.reject(e)));
      } catch (e) {
        starting = false;
        exited = true;
        term.write(`\r\n\x1b[31mFailed to start shell: ${e instanceof Error ? e.message : String(e)}\x1b[0m\r\n\x1b[2mPress Enter to retry, or Esc to close this tab.\x1b[0m\r\n`);
        return;
      }
      starting = false;
      if (disposed) {
        pty.kill(newId);
        return;
      }
      id = newId;
      for (const [pid, data] of pending) if (pid === newId) term.write(data);
      pending = [];
      pty.resize(newId, term.cols, term.rows);
    };

    const offData = pty.onData((pid, data) => {
      if (pid === id) term.write(data);
      else if (starting) pending.push([pid, data]);
    });
    const offExit = pty.onExit((pid, code) => {
      if (pid !== id) return;
      id = null;
      exited = true;
      term.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n\x1b[2mPress Enter to restart, or Esc to close this tab.\x1b[0m\r\n`);
    });

    const copy = () => {
      const sel = term.getSelection();
      if (sel) void navigator.clipboard?.writeText(sel).catch(() => {});
    };
    const paste = () => {
      void navigator.clipboard
        ?.readText()
        .then((t) => t && term.paste(t))
        .catch(() => {});
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        const action = k === 'c' ? copy : k === 'v' ? paste : k === 't' ? cb.current.onNewTab : k === 'w' ? cb.current.onClose : null;
        if (action) {
          e.preventDefault();
          action();
          return false;
        }
      }
      return true;
    });

    const offInput = term.onData((data) => {
      if (id !== null) pty.write(id, data);
      else if (exited) {
        if (data === '\r') void start();
        else if (data === '\x1b') cb.current.onClose();
      }
    });
    const offResize = term.onResize(({ cols, rows }) => id !== null && pty.resize(id, cols, rows));
    const offTitle = term.onTitleChange((t) => cb.current.onTitle(t));

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(safeFit);
    });
    ro.observe(host);

    void start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      offData();
      offExit();
      offInput.dispose();
      offResize.dispose();
      offTitle.dispose();
      if (id !== null) pty.kill(id);
      termRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      const host = hostRef.current;
      if (host?.offsetWidth && host.offsetHeight) {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div className="absolute inset-0 px-2 pb-1 pt-1.5" style={{ display: active ? 'block' : 'none' }}>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
