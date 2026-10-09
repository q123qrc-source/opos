/**
 * The Universal App Container.
 *
 * In Electron every third-party app runs in a <webview> (plugins enabled for Widevine, persistent
 * partition, the compatibility shim forced in as preload by the main process). In a plain browser it
 * degrades to an <iframe> so the shell can still be previewed.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { bridge, isElectron } from '../lib/bridge';
import { useOS } from '../store/useOS';
import { useBackHandler } from '../lib/backStack';
import { useMediaHandler } from '../lib/mediaRouter';
import type { InputKind, RemoteProfile } from '../types';

export interface WebHandle {
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  loadURL(url: string): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
}

interface WebviewElement extends HTMLElement {
  src: string;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  loadURL(url: string): Promise<void>;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  send(channel: string, ...args: unknown[]): void;
  isLoading(): boolean;
}

interface IpcMessageEvent extends Event {
  channel: string;
  args: unknown[];
}

interface Props {
  pid: string;
  src: string;
  userAgent?: string;
  remoteProfile?: RemoteProfile;
  /** Whether this view is the one that should receive Back / media keys. */
  active?: boolean;
  className?: string;
  onTitle?: (title: string) => void;
  onUrl?: (url: string) => void;
  onLoading?: (loading: boolean) => void;
  onProgress?: (p: number) => void;
  onError?: (err: { code: number; description: string; url: string } | null) => void;
}

export const APP_PARTITION = 'persist:opos-apps';

export const WebviewContainer = forwardRef<WebHandle, Props>(function WebviewContainer(
  { pid, src, userAgent, remoteProfile = 'none', active = true, className, onTitle, onUrl, onLoading, onProgress, onError },
  ref,
) {
  const mode = useOS((s) => s.mode);
  const webviewRef = useRef<WebviewElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [initialSrc] = useState(src);
  const [iframeSrc, setIframeSrc] = useState(src);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onTitle, onUrl, onLoading, onProgress, onError });
  callbacks.current = { onTitle, onUrl, onLoading, onProgress, onError };

  const handle: WebHandle = {
    goBack: () => webviewRef.current?.canGoBack() && webviewRef.current.goBack(),
    goForward: () => webviewRef.current?.canGoForward() && webviewRef.current.goForward(),
    reload: () => {
      if (webviewRef.current) webviewRef.current.reload();
      else if (iframeRef.current) iframeRef.current.src = iframeSrc;
    },
    stop: () => webviewRef.current?.stop(),
    loadURL: (url: string) => {
      if (webviewRef.current) {
        if (ready) webviewRef.current.loadURL(url).catch(() => {});
        else webviewRef.current.src = url;
      } else {
        setIframeSrc(url);
        callbacks.current.onUrl?.(url);
        callbacks.current.onLoading?.(true);
      }
    },
    canGoBack: () => (ready ? !!webviewRef.current?.canGoBack() : false),
    canGoForward: () => (ready ? !!webviewRef.current?.canGoForward() : false),
    getURL: () => (ready && webviewRef.current ? webviewRef.current.getURL() : iframeSrc),
  };
  useImperativeHandle(ref, () => handle);

  const sendConfig = useCallback(() => {
    if (!webviewRef.current || !ready) return;
    webviewRef.current.send('opos:config', { profile: remoteProfile, mode, spatialFallback: mode === 'tv' });
  }, [ready, remoteProfile, mode]);
  useEffect(sendConfig, [sendConfig]);

  // Electron <webview> wiring.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const cb = callbacks.current;
    const onDomReady = () => setReady(true);
    const onStart = () => {
      cb.onLoading?.(true);
      cb.onProgress?.(0.15);
      cb.onError?.(null);
    };
    const onStop = () => {
      cb.onLoading?.(false);
      cb.onProgress?.(1);
    };
    const onCommit = () => cb.onProgress?.(0.6);
    const onTitleEv = (e: Event) => cb.onTitle?.((e as Event & { title: string }).title);
    const onNav = (e: Event) => cb.onUrl?.((e as Event & { url: string }).url);
    const onFail = (e: Event) => {
      const ev = e as Event & { errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean };
      if (!ev.isMainFrame || ev.errorCode === -3) return; // -3 = aborted (redirects)
      cb.onError?.({ code: ev.errorCode, description: ev.errorDescription, url: ev.validatedURL });
    };
    const onIpc = (e: Event) => {
      const { channel, args } = e as IpcMessageEvent;
      const s = useOS.getState();
      switch (channel) {
        case 'opos:input': {
          const payload = args[0] as { type: InputKind; detail?: string };
          s.reportInput(payload.type, payload.detail);
          break;
        }
        case 'opos:back':
          if (wv.canGoBack()) wv.goBack();
          else if (s.mode !== 'desktop') s.goHome();
          break;
        case 'opos:gesture':
          if (args[0] === 'home') s.goHome();
          break;
      }
    };
    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('load-commit', onCommit);
    wv.addEventListener('page-title-updated', onTitleEv);
    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);
    wv.addEventListener('did-fail-load', onFail);
    wv.addEventListener('ipc-message', onIpc);
    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('load-commit', onCommit);
      wv.removeEventListener('page-title-updated', onTitleEv);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
      wv.removeEventListener('did-fail-load', onFail);
      wv.removeEventListener('ipc-message', onIpc);
    };
  }, []);

  useBackHandler(
    pid,
    () => {
      if (ready && webviewRef.current?.canGoBack()) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    },
    active,
  );

  useMediaHandler(pid, (action) => {
    if (!active || !ready || !webviewRef.current) return false;
    webviewRef.current.send('opos:media', action);
    return true;
  });

  if (isElectron) {
    return (
      <webview
        ref={(el) => {
          webviewRef.current = el as WebviewElement | null;
        }}
        className={className}
        src={initialSrc}
        partition={APP_PARTITION}
        useragent={userAgent}
        preload={bridge.shimPath}
        allowpopups="true"
        plugins="true"
        webpreferences="contextIsolation=yes, plugins=yes, javascript=yes"
        style={{ display: 'flex', width: '100%', height: '100%', background: '#000' }}
      />
    );
  }

  return (
    <div className={`relative ${className ?? ''}`} style={{ width: '100%', height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={pid}
        className="h-full w-full border-0 bg-black"
        allow="autoplay; encrypted-media; fullscreen; camera; microphone; geolocation; picture-in-picture; gamepad"
        onLoad={() => {
          callbacks.current.onLoading?.(false);
          callbacks.current.onProgress?.(1);
        }}
      />
      <BrowserPreviewNotice url={iframeSrc} />
    </div>
  );
});

function BrowserPreviewNotice({ url }: { url: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-4 py-2.5 text-xs text-white/75 backdrop-blur" data-nav-skip>
      <span className="flex-1">
        Browser preview — this app runs in an <code>&lt;iframe&gt;</code> here and some sites refuse to be embedded. Launch
        with Electron (<code>npm run dev</code>) for the full DRM-capable <code>&lt;webview&gt;</code> container.
      </span>
      <button className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => window.open(url, '_blank', 'noopener')}>
        <ExternalLink size={12} /> Open
      </button>
      <button className="rounded-md p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
