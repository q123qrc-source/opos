import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useOS } from './store/useOS';
import './index.css';

// Automation / devtools hook: window.__opos.getState().launch('terminal'), setModeLock('tv'), …
(window as unknown as { __opos: typeof useOS }).__opos = useOS;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
