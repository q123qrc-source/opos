/**
 * Renderer side of the real OPOS session: one React root per compositor surface.
 *   ?surface=desktop  wallpaper + desktop / mobile home / TV home (below all windows)
 *   ?surface=panel    taskbar (desktop) · navigation bar (mobile)
 *   ?surface=topbar   mobile status bar
 *   ?surface=overlay  start menu, quick settings, notifications, recents
 *   ?surface=toast    notification banners
 *   ?surface=app&app=<id>  a built-in OPOS app in its own window
 */
import { Suspense, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useOS } from '../store/useOS';
import { useConvergence } from '../engine/useConvergence';
import { bridge, surface } from '../lib/bridge';
import { performBack } from '../lib/backStack';
import { ACCENTS } from '../lib/theme';
import { cx } from '../lib/hooks';
import { getApp } from '../apps/manifest';
import { DesktopShell, Flyout } from '../shells/desktop/DesktopShell';
import { Taskbar } from '../shells/desktop/Taskbar';
import { StartMenu } from '../shells/desktop/StartMenu';
import { NotificationCenter } from '../shells/desktop/NotificationCenter';
import { QuickSettings } from '../shells/QuickSettings';
import { MobileHome, NavBar, StatusBar, Recents, ControlCenter, SearchSheet } from '../shells/mobile/MobileShell';
import { TVShell } from '../shells/tv/TVShell';
import { AppContent, AppErrorBoundary, AppSplash } from '../components/ProcessLayer';
import { ContextMenu } from '../components/SystemOverlays';
import type { Process } from '../types';

function useThemeVars() {
  const accent = useOS((s) => s.settings.accent);
  const uiScale = useOS((s) => s.settings.uiScale);
  const reduceMotion = useOS((s) => s.settings.reduceMotion);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--os-accent', (ACCENTS[accent] ?? ACCENTS.indigo).rgb);
    root.style.fontSize = `${(uiScale / 100) * 16}px`;
    root.classList.toggle('reduce-motion', reduceMotion);
  }, [accent, uiScale, reduceMotion]);
}

export function SessionRoot() {
  const role = surface ?? 'desktop';
  const appId = new URLSearchParams(location.search).get('app');
  const mediaApp = role === 'app' && (appId === 'music' || appId === 'miniplayer');
  useConvergence({ session: true, mediaKeys: mediaApp || (role === 'app' && getApp(appId ?? '')?.kind === 'webview') });
  useThemeVars();

  // Transparent surfaces must not paint the default body background.
  useEffect(() => {
    const transparent = role !== 'desktop' && role !== 'app';
    document.documentElement.style.background = transparent ? 'transparent' : '';
    document.body.style.background = transparent ? 'transparent' : '';
    document.getElementById('root')!.style.background = transparent ? 'transparent' : '';
  }, [role]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {role === 'desktop' && <DesktopSurface />}
      {role === 'panel' && <PanelSurface />}
      {role === 'topbar' && <StatusBar dark={false} />}
      {role === 'overlay' && <OverlaySurface />}
      {role === 'toast' && <ToastSurface />}
      {role === 'app' && appId && <AppSurface appId={appId} />}
      <ContextMenu />
    </div>
  );
}

/* ------------------------------------------------------------------ surfaces */

function DesktopSurface() {
  const mode = useOS((s) => s.mode);
  if (mode === 'tv') return <TVShell />;
  if (mode === 'mobile') return <MobileHome />;
  return <DesktopShell session />;
}

function PanelSurface() {
  const mode = useOS((s) => s.mode);
  if (mode === 'mobile') return <NavBar />;
  return <Taskbar />;
}

function OverlaySurface() {
  const overlay = useOS((s) => s.overlay);
  const mode = useOS((s) => s.mode);
  const close = () => useOS.getState().setOverlay('none');
  if (overlay === 'none') return null;

  if (mode === 'mobile') {
    // Leave the navigation bar (its own surface, 52px) uncovered.
    return (
      <div className="absolute inset-x-0 top-0" style={{ bottom: 52 }}>
        {overlay === 'recents' ? <Recents /> : overlay === 'start' ? <SearchSheet /> : <ControlCenter />}
      </div>
    );
  }

  return (
    <div className="absolute inset-0" onPointerDown={close}>
      {overlay === 'start' && (
        <div className={cx('absolute inset-x-0 flex justify-center', mode === 'tv' ? 'inset-y-0 items-center' : 'bottom-[60px]')}>
          <div onPointerDown={(e) => e.stopPropagation()}>
            <StartMenu embedded />
          </div>
        </div>
      )}
      {overlay === 'quick' && (
        <Flyout className="right-3 w-[360px]">
          <QuickSettings />
        </Flyout>
      )}
      {overlay === 'notifications' && (
        <Flyout className="right-3 w-[380px]">
          <NotificationCenter />
        </Flyout>
      )}
      {overlay === 'recents' && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Recents />
        </div>
      )}
    </div>
  );
}

function ToastSurface() {
  const toasts = useOS((s) => s.toasts);
  const mode = useOS((s) => s.mode);
  const dismiss = useOS((s) => s.dismissToast);
  const tv = mode === 'tv';
  return (
    <div className="flex h-full flex-col gap-2 p-1.5">
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          className={cx('flex animate-slide-up items-center gap-3 rounded-2xl border border-white/10 bg-[#141724]/95 shadow-xl', tv ? 'h-[92px] px-6' : 'h-[72px] px-4')}
          onClick={() => {
            dismiss(t.id);
            void bridge.os?.dismissNotification(Number(t.id));
          }}
        >
          <div className={cx('grid shrink-0 place-items-center rounded-xl bg-os-accent/20 text-os-accent', tv ? 'h-12 w-12' : 'h-9 w-9')}>
            <Bell size={tv ? 24 : 18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cx('truncate font-semibold text-white', tv ? 'text-xl' : 'text-sm')}>{t.title}</div>
            {t.body && <div className={cx('line-clamp-2 text-white/60', tv ? 'text-base' : 'text-xs')}>{t.body}</div>}
          </div>
          <X size={14} className="shrink-0 text-white/40" />
        </div>
      ))}
    </div>
  );
}

function AppSurface({ appId }: { appId: string }) {
  const mode = useOS((s) => s.mode);
  const app = getApp(appId);
  const [params, setParams] = useState<Record<string, unknown> | undefined>(() => {
    const raw = new URLSearchParams(location.search).get('params');
    try {
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  });
  const pid = `app:${appId}`;

  useEffect(() => {
    // Back-stack handlers and media handlers are keyed by the focused "pid".
    useOS.setState({ focusedPid: pid });
    const offParams = bridge.session?.onAppParams((p) => setParams(p));
    // The session's Back gesture/button targets the active window: try in-app back first.
    const onBack = () => {
      if (!performBack()) void bridge.session?.home();
    };
    window.addEventListener('opos-session-back', onBack);
    return () => {
      offParams?.();
      window.removeEventListener('opos-session-back', onBack);
    };
  }, [pid]);

  if (!app) return <div className="grid h-full place-items-center text-white/60">Unknown app {appId}</div>;
  const process: Process = { pid, appId, title: app.name, params, bounds: { x: 0, y: 0, w: 0, h: 0 }, z: 1, minimized: false, maximized: true, launchedAt: Date.now() };
  return (
    <div className="h-full w-full bg-[#0b0c12]" data-nav-scope data-nav-priority="10">
      <AppErrorBoundary appName={app.name}>
        <Suspense fallback={<AppSplash appId={appId} />}>
          <AppContent process={process} mode={mode} active />
        </Suspense>
      </AppErrorBoundary>
    </div>
  );
}
