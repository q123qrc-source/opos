import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useOS } from './store/useOS';
import { isSession, surface } from './lib/bridge';
import { startSessionSync } from './session/sync';
import { SessionRoot } from './session/Surfaces';
import './index.css';

// Automation / devtools hook: window.__opos.getState().launch('terminal'), setModeLock('tv'), …
(window as unknown as { __opos: typeof useOS }).__opos = useOS;

// In a real session every surface mirrors the shared state held by the main process.
if (isSession) startSessionSync();

createRoot(document.getElementById('root')!).render(<StrictMode>{surface ? <SessionRoot /> : <App />}</StrictMode>);
