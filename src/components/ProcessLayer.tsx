/**
 * ProcessLayer renders every running app exactly once, at a stable position in the React tree, and
 * only swaps the *frame* around it when the environment changes. That keeps app state (and, in
 * Electron, live <webview> guests) alive across Desktop ⇄ Mobile ⇄ TV transitions.
 *
 *  Desktop: floating, draggable, resizable windows with snap (top = maximize, sides = half).
 *  Mobile:  fullscreen between status bar and nav bar, with a swipe-up-to-home gesture zone.
 *  TV:      fullscreen immersive surfaces.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPE } from 'react';
import { Minus, Square, Copy, X, GripHorizontal, RotateCcw } from 'lucide-react';
import { useOS, TASKBAR_HEIGHT, selectForeground } from '../store/useOS';
import { getApp } from '../apps/manifest';
import { APP_COMPONENTS } from '../apps/components';
import type { Bounds, Mode, Process } from '../types';
import { AppIcon } from './AppIcon';
import { WebApp } from './WebApp';
import { Spinner } from './ui';
import { cx } from '../lib/hooks';

export const MOBILE_STATUS_H = 30;
export const MOBILE_NAV_H = 48;

export function ProcessLayer() {
  const processes = useOS((s) => s.processes);
  const mode = useOS((s) => s.mode);
  const focusedPid = useOS((s) => s.focusedPid);
  const foreground = useOS(selectForeground);

  // Stable render order (by launch) so React never re-parents frames; stacking uses z-index ranks.
  const ranks = useMemo(() => {
    const sorted = [...processes].sort((a, b) => a.z - b.z);
    return new Map(sorted.map((p, i) => [p.pid, i]));
  }, [processes]);

  return (
    <>
      {processes.map((p) => (
        <ProcessFrame
          key={p.pid}
          process={p}
          mode={mode}
          rank={ranks.get(p.pid) ?? 0}
          focused={focusedPid === p.pid}
          foreground={foreground?.pid === p.pid}
        />
      ))}
      <SnapPreview />
    </>
  );
}

/* --------------------------------------------------------------------------- */

type SnapZone = 'max' | 'left' | 'right' | null;
let setSnapPreview: (z: SnapZone) => void = () => {};

function SnapPreview() {
  const [zone, setZone] = useState<SnapZone>(null);
  setSnapPreview = setZone;
  if (!zone) return null;
  const style: React.CSSProperties =
    zone === 'max'
      ? { left: 8, top: 8, right: 8, bottom: TASKBAR_HEIGHT + 8 }
      : zone === 'left'
        ? { left: 8, top: 8, width: 'calc(50% - 12px)', bottom: TASKBAR_HEIGHT + 8 }
        : { right: 8, top: 8, width: 'calc(50% - 12px)', bottom: TASKBAR_HEIGHT + 8 };
  return <div className="pointer-events-none absolute z-[7990] rounded-2xl border border-white/30 bg-white/10 backdrop-blur-sm transition-all" style={style} />;
}

/* --------------------------------------------------------------------------- */

function ProcessFrame({ process: p, mode, rank, focused, foreground }: { process: Process; mode: Mode; rank: number; focused: boolean; foreground: boolean }) {
  const app = getApp(p.appId)!;
  const { focus } = useOS.getState();
  const frameRef = useRef<HTMLDivElement>(null);
  const launch = app.launch;
  const isOverlay = launch === 'overlay';
  const isFloating = launch === 'floating';
  const desktopWindow = mode === 'desktop' && !isOverlay;

  let className = 'absolute flex flex-col overflow-hidden';
  let style: React.CSSProperties = {};
  let visible = true;
  let navPriority = 10;

  if (isOverlay) {
    style = { inset: 0, zIndex: 9990 };
    navPriority = 50;
  } else if (isFloating) {
    const b = clampBounds(p.bounds, mode);
    style = { left: b.x, top: b.y, width: b.w, height: b.h, zIndex: 8000 + rank };
    className += ' rounded-2xl bg-[#11131c]/95 shadow-window backdrop-blur-xl';
    visible = mode === 'desktop' ? !p.minimized : true;
    navPriority = -1;
  } else if (mode === 'desktop') {
    style = p.maximized
      ? { left: 0, top: 0, right: 0, bottom: TASKBAR_HEIGHT, zIndex: 100 + rank }
      : { left: p.bounds.x, top: p.bounds.y, width: p.bounds.w, height: p.bounds.h, zIndex: 100 + rank };
    className += cx(
      ' bg-os-panel',
      p.maximized ? '' : ' rounded-xl',
      focused ? ' shadow-window ring-1 ring-white/10' : ' shadow-[0_20px_50px_-20px_rgba(0,0,0,.7)] ring-1 ring-white/5',
    );
    visible = !p.minimized;
  } else if (mode === 'mobile') {
    style = { left: 0, right: 0, top: MOBILE_STATUS_H, bottom: MOBILE_NAV_H, zIndex: 100 };
    className += ' bg-black';
    visible = foreground;
  } else {
    style = { inset: 0, zIndex: 100 };
    className += ' bg-black';
    visible = foreground;
  }

  return (
    <div
      ref={frameRef}
      className={cx(className, 'os-frame', !visible && 'os-frame-hidden', desktopWindow && 'animate-pop-in')}
      style={style}
      data-pid={p.pid}
      data-nav-scope={visible ? '' : undefined}
      data-nav-priority={navPriority}
      aria-hidden={!visible}
      onPointerDownCapture={() => {
        if (!focused) focus(p.pid);
      }}
    >
      {(desktopWindow || isFloating) && <TitleBar process={p} mode={mode} focused={focused} floating={isFloating} frameRef={frameRef} />}
      <div className="relative min-h-0 flex-1">
        <AppErrorBoundary appName={app.name}>
          <Suspense fallback={<AppSplash appId={p.appId} />}>
            <AppContent process={p} mode={mode} active={focused || foreground} />
          </Suspense>
        </AppErrorBoundary>
      </div>
      {desktopWindow && !isFloating && !p.maximized && <ResizeHandles process={p} />}
      {mode === 'mobile' && !isOverlay && !isFloating && <HomeGesture visible={visible} />}
    </div>
  );
}

export function AppContent({ process: p, mode, active }: { process: Process; mode: Mode; active: boolean }) {
  const app = getApp(p.appId)!;
  if (app.kind === 'webview') return <WebApp app={app} pid={p.pid} mode={mode} active={active} />;
  const Comp = APP_COMPONENTS[p.appId];
  if (!Comp) return <div className="p-6 text-white/60">Missing component for {p.appId}</div>;
  return <Comp pid={p.pid} mode={mode} params={p.params} />;
}

export function AppSplash({ appId }: { appId: string }) {
  const app = getApp(appId)!;
  return (
    <div className="grid h-full w-full place-items-center bg-[#0b0c12]">
      <div className="flex flex-col items-center gap-4">
        <AppIcon app={app} size={64} className="animate-pulse-soft" />
        <Spinner />
      </div>
    </div>
  );
}

export class AppErrorBoundary extends Component<{ appName: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0b0c12] p-6 text-center">
        <div className="text-lg font-semibold text-white">{this.props.appName} stopped responding</div>
        <div className="max-w-md font-mono text-xs text-red-300/80">{this.state.error.message}</div>
        <button className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20" onClick={() => this.setState({ error: null })}>
          <RotateCcw size={14} /> Restart app
        </button>
      </div>
    );
  }
}

/* ------------------------------------------------------------------ desktop */

function clampBounds(b: Bounds, mode: Mode): Bounds {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (mode === 'desktop') return b;
  const w = Math.min(b.w, vw - 24);
  const h = Math.min(b.h, vh - 140);
  const bottomInset = mode === 'mobile' ? MOBILE_NAV_H + 12 : 32;
  return { w, h, x: Math.min(Math.max(12, b.x), vw - w - 12), y: Math.min(Math.max(MOBILE_STATUS_H + 12, b.y), vh - h - bottomInset) };
}

function TitleBar({ process: p, mode, focused, floating, frameRef }: { process: Process; mode: Mode; focused: boolean; floating: boolean; frameRef: React.RefObject<HTMLDivElement> }) {
  const app = getApp(p.appId)!;
  const { minimize, toggleMaximize, close, setBounds, setInteracting, openContextMenu } = useOS.getState();

  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const container = frameRef.current?.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    let origin = { ...clampBounds(p.bounds, mode) };
    let restored = !p.maximized;
    let zone: SnapZone = null;
    setInteracting(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!restored) {
        if (Math.hypot(dx, dy) < 6) return;
        // Dragging a maximized window restores it under the cursor, proportionally.
        const ratio = (start.x - container.left) / container.width;
        origin = { ...p.bounds, x: start.x - container.left - p.bounds.w * ratio, y: 0 };
        toggleMaximize(p.pid);
        restored = true;
      }
      const x = origin.x + dx;
      const y = Math.max(0, origin.y + dy);
      setBounds(p.pid, { x, y });
      if (mode === 'desktop' && !floating) {
        const px = ev.clientX - container.left;
        const py = ev.clientY - container.top;
        zone = py <= 4 ? 'max' : px <= 4 ? 'left' : px >= container.width - 5 ? 'right' : null;
        setSnapPreview(zone);
      }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      setInteracting(false);
      setSnapPreview(null);
      const workH = container.height - TASKBAR_HEIGHT;
      if (zone === 'max') {
        setBounds(p.pid, { x: origin.x, y: 24 });
        toggleMaximize(p.pid);
      } else if (zone === 'left') setBounds(p.pid, { x: 0, y: 0, w: Math.round(container.width / 2), h: workH });
      else if (zone === 'right') setBounds(p.pid, { x: Math.round(container.width / 2), y: 0, w: Math.round(container.width / 2), h: workH });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  if (floating) {
    return (
      <div className="group absolute inset-x-0 top-0 z-10 flex h-7 cursor-grab items-center justify-center active:cursor-grabbing" onPointerDown={onPointerDown}>
        <GripHorizontal size={16} className="text-white/30 transition group-hover:text-white/70" />
        <button className="absolute right-1.5 top-1 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => close(p.pid)} aria-label="Close">
          <X size={13} />
        </button>
      </div>
    );
  }

  const btn = 'grid h-full w-11 place-items-center text-white/70 transition hover:bg-white/10 hover:text-white';
  return (
    <div
      className={cx('os-titlebar flex h-9 shrink-0 select-none items-center border-b border-white/5 pl-3', focused ? 'bg-[#161926]' : 'bg-[#11131c] text-white/50')}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && toggleMaximize(p.pid)}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Minimize', action: () => minimize(p.pid) },
          { label: p.maximized ? 'Restore' : 'Maximize', action: () => toggleMaximize(p.pid) },
          { label: '', divider: true },
          { label: 'Close', danger: true, shortcut: 'Alt+F4', action: () => close(p.pid) },
        ]);
      }}
    >
      <AppIcon app={app} size={18} />
      <div className={cx('ml-2.5 flex-1 truncate text-[13px] font-medium', focused ? 'text-white/90' : 'text-white/45')}>{p.title}</div>
      <div className="flex h-full">
        <button className={btn} onClick={() => minimize(p.pid)} aria-label="Minimize">
          <Minus size={15} />
        </button>
        <button className={btn} onClick={() => toggleMaximize(p.pid)} aria-label="Maximize">
          {p.maximized ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
        </button>
        <button className={cx(btn, 'hover:!bg-red-600')} onClick={() => close(p.pid)} aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const HANDLES: { dir: string; cls: string; cursor: string }[] = [
  { dir: 'n', cls: 'top-0 left-2 right-2 h-1.5', cursor: 'ns-resize' },
  { dir: 's', cls: 'bottom-0 left-2 right-2 h-1.5', cursor: 'ns-resize' },
  { dir: 'e', cls: 'right-0 top-2 bottom-2 w-1.5', cursor: 'ew-resize' },
  { dir: 'w', cls: 'left-0 top-2 bottom-2 w-1.5', cursor: 'ew-resize' },
  { dir: 'ne', cls: 'right-0 top-0 h-3 w-3', cursor: 'nesw-resize' },
  { dir: 'nw', cls: 'left-0 top-0 h-3 w-3', cursor: 'nwse-resize' },
  { dir: 'se', cls: 'right-0 bottom-0 h-3 w-3', cursor: 'nwse-resize' },
  { dir: 'sw', cls: 'left-0 bottom-0 h-3 w-3', cursor: 'nesw-resize' },
];

function ResizeHandles({ process: p }: { process: Process }) {
  const app = getApp(p.appId)!;
  const min = app.minSize ?? { w: 320, h: 220 };
  const { setBounds, setInteracting } = useOS.getState();

  const start = (dir: string) => (e: RPE<HTMLDivElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const pointer = { x: e.clientX, y: e.clientY };
    const o: Bounds = { ...p.bounds };
    setInteracting(true);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - pointer.x;
      const dy = ev.clientY - pointer.y;
      let { x, y, w, h } = o;
      if (dir.includes('e')) w = Math.max(min.w, o.w + dx);
      if (dir.includes('s')) h = Math.max(min.h, o.h + dy);
      if (dir.includes('w')) {
        w = Math.max(min.w, o.w - dx);
        x = o.x + (o.w - w);
      }
      if (dir.includes('n')) {
        h = Math.max(min.h, o.h - dy);
        y = Math.max(0, o.y + (o.h - h));
      }
      setBounds(p.pid, { x, y, w, h });
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setInteracting(false);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  return (
    <>
      {HANDLES.map((h) => (
        <div key={h.dir} className={cx('absolute z-20', h.cls)} style={{ cursor: h.cursor }} onPointerDown={start(h.dir)} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- mobile */

function HomeGesture({ visible }: { visible: boolean }) {
  const goHome = useOS((s) => s.goHome);
  const [hint, setHint] = useState(false);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 2600);
    return () => clearTimeout(t);
  }, [visible]);

  const onPointerDown = (e: RPE<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const onMove = (ev: PointerEvent) => setDrag(Math.max(0, y0 - ev.clientY));
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setDrag(0);
      if (y0 - ev.clientY > 60) goHome();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex h-7 touch-none flex-col items-center justify-end pb-1.5"
      onPointerDown={onPointerDown}
      style={{ transform: `translateY(${-Math.min(drag, 120) * 0.5}px)` }}
      data-nav-skip
    >
      <div className={cx('pointer-events-none mb-1.5 rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur transition-all duration-500', hint || drag > 0 ? 'opacity-100' : 'translate-y-1 opacity-0')}>
        Swipe up to go home
      </div>
      <div className="h-[5px] w-32 rounded-full bg-white/70 shadow-[0_0_8px_rgba(0,0,0,.6)]" style={{ width: 128 + Math.min(drag, 80) }} />
    </div>
  );
}
