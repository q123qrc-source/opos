/**
 * Routes hardware media keys (globalShortcut in Electron, MediaSession keys in browser) to the
 * foreground app if it registered a handler, otherwise to the shared audio engine.
 */
import { useEffect, useRef } from 'react';
import type { MediaAction } from './bridge';
import { useOS } from '../store/useOS';
import { audio } from './audioEngine';

type Handler = (action: MediaAction) => boolean;
const handlers = new Map<string, Handler>();

export function useMediaHandler(pid: string, fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h: Handler = (a) => ref.current(a);
    handlers.set(pid, h);
    return () => {
      if (handlers.get(pid) === h) handlers.delete(pid);
    };
  }, [pid]);
}

export function routeMedia(action: MediaAction) {
  const { focusedPid } = useOS.getState();
  if (focusedPid && handlers.get(focusedPid)?.(action)) return;
  switch (action) {
    case 'playpause':
      audio.toggle();
      break;
    case 'next':
      audio.next();
      break;
    case 'previous':
      audio.previous();
      break;
    case 'stop':
      audio.pause();
      audio.seek(0);
      break;
  }
}
