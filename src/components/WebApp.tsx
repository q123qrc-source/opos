/** Generic host for registry entries of kind "webview" (Cinema, OPTube, OPStream). */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, ShieldCheck, ShieldAlert, Home } from 'lucide-react';
import type { AppDefinition, Mode } from '../types';
import { WebviewContainer, type WebHandle } from './WebviewContainer';
import { AppIcon } from './AppIcon';
import { useOS } from '../store/useOS';
import { bridge, type DrmStatus } from '../lib/bridge';

export function WebApp({ app, pid, mode, active }: { app: AppDefinition; pid: string; mode: Mode; active: boolean }) {
  const ref = useRef<WebHandle>(null);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [progress, setProgress] = useState(0.1);
  const [url, setUrl] = useState(app.url ?? '');
  const [error, setError] = useState<{ code: number; description: string; url: string } | null>(null);
  const [hud, setHud] = useState(true);
  const [drm, setDrm] = useState<DrmStatus | null>(null);
  const setTitle = useOS((s) => s.setTitle);

  useEffect(() => {
    bridge.drm.status().then(setDrm).catch(() => {});
  }, []);

  // Immersive HUD fades after a few seconds.
  useEffect(() => {
    if (!active) return;
    setHud(true);
    const t = setTimeout(() => setHud(false), 3500);
    return () => clearTimeout(t);
  }, [active, mode]);

  const immersive = mode !== 'desktop';
  const drmOk = drm && ['ready', 'registered'].includes(drm.status);

  return (
    <div className="relative flex h-full w-full flex-col bg-black">
      {!immersive && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/5 bg-[#0d0f17] px-2 text-white/70">
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => ref.current?.goBack()} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => ref.current?.goForward()} aria-label="Forward">
            <ArrowRight size={16} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => ref.current?.reload()} aria-label="Reload">
            <RotateCw size={15} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => app.url && ref.current?.loadURL(app.url)} aria-label="Home">
            <Home size={15} />
          </button>
          <div className="mx-2 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-xs text-white/50">{url}</div>
          <div
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${drmOk ? 'text-emerald-300' : 'text-amber-300'}`}
            title={drm?.detail}
          >
            {drmOk ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />} Widevine {drm ? drm.status : '…'}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <WebviewContainer
          ref={ref}
          pid={pid}
          src={app.url ?? 'about:blank'}
          userAgent={app.userAgent}
          remoteProfile={app.remoteProfile}
          active={active}
          onLoading={(l) => {
            setLoading(l);
            if (!l) setFirstLoad(false);
          }}
          onProgress={setProgress}
          onTitle={(t) => setTitle(pid, `${app.name} — ${t}`)}
          onUrl={setUrl}
          onError={setError}
        />

        {/* Loading progress bar */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left transition-all duration-500"
          style={{ transform: `scaleX(${loading ? progress : 1})`, opacity: loading ? 1 : 0, background: app.accent }}
        />

        {/* Splash while the first page loads */}
        {firstLoad && !error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black" style={{ background: `radial-gradient(circle at 50% 40%, ${app.accent}33, #000 60%)` }}>
            <div className="flex flex-col items-center gap-6 animate-fade-in">
              <AppIcon app={app} size={immersive ? 120 : 84} className="animate-float" />
              <div className={`${immersive ? 'text-4xl' : 'text-xl'} font-bold tracking-tight text-white`}>{app.name}</div>
              <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress * 100}%`, background: app.accent }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-[#07080d]" data-nav-scope data-nav-priority="5">
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <AppIcon app={app} size={72} />
              <div className="text-2xl font-semibold text-white">Can’t reach {app.name}</div>
              <div className="text-sm text-white/60">
                {error.description} ({error.code})<br />
                <span className="text-white/40">{error.url}</span>
              </div>
              <button data-autofocus className="rounded-full px-6 py-2.5 font-semibold text-black" style={{ background: app.accent }} onClick={() => ref.current?.reload()}>
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Immersive HUD */}
        {immersive && (
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/85 to-transparent px-8 pb-16 pt-6 transition-opacity duration-700 ${hud ? 'opacity-100' : 'opacity-0'}`}
          >
            <AppIcon app={app} size={mode === 'tv' ? 56 : 36} />
            <div className="flex-1">
              <div className={`${mode === 'tv' ? 'text-3xl' : 'text-lg'} font-bold text-white`}>{app.name}</div>
              <div className="text-sm text-white/60">
                {mode === 'tv' ? 'Press BACK to return · Media keys control playback' : 'Swipe up from the bottom edge to go home'}
              </div>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs ${drmOk ? 'text-emerald-300' : 'text-amber-300'}`}>
              {drmOk ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />} Widevine {drm?.status ?? '…'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
