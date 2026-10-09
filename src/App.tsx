/**
 * OPOS root. The "device" element hosts one shell (by mode) plus the persistent ProcessLayer.
 * In Mobile mode on a landscape screen the device collapses to a portrait-locked frame.
 */
import { useEffect, useState } from 'react';
import { useOS, isNarrowPortrait } from './store/useOS';
import { useConvergence } from './engine/useConvergence';
import { DesktopShell } from './shells/desktop/DesktopShell';
import { MobileShell } from './shells/mobile/MobileShell';
import { TVShell } from './shells/tv/TVShell';
import { ProcessLayer } from './components/ProcessLayer';
import { ContextMenu, DisplayFilters, Toasts } from './components/SystemOverlays';
import { ACCENTS, WALLPAPERS } from './lib/theme';
import { cx } from './lib/hooks';

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const h = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vp;
}

export default function App() {
  useConvergence();
  const mode = useOS((s) => s.mode);
  const settings = useOS((s) => s.settings);
  const interacting = useOS((s) => s.interacting);
  const vp = useViewport();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--os-accent', (ACCENTS[settings.accent] ?? ACCENTS.indigo).rgb);
    root.style.fontSize = `${(settings.uiScale / 100) * 16}px`;
    root.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings.accent, settings.uiScale, settings.reduceMotion]);

  // Mobile is portrait-locked: on landscape screens render a centered portrait device.
  const portraitFrame = mode === 'mobile' && !isNarrowPortrait(vp.w, vp.h) && vp.w > vp.h * 0.75;
  const deviceStyle: React.CSSProperties = portraitFrame
    ? { width: Math.min(vp.w - 24, Math.round((vp.h - 32) * (9 / 19.5))), height: vp.h - 32 }
    : { width: '100%', height: '100%' };

  const wallpaper = (WALLPAPERS[settings.wallpaper] ?? WALLPAPERS.aurora).css;

  return (
    <div
      className={cx('relative grid h-full w-full place-items-center overflow-hidden', interacting && 'os-interacting')}
      style={{ background: portraitFrame ? `${wallpaper}` : '#000' }}
    >
      {portraitFrame && <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />}
      <div
        id="opos-device"
        className={cx(
          'relative overflow-hidden transition-[border-radius] duration-300',
          portraitFrame && 'rounded-[2.6rem] shadow-[0_0_0_10px_#0b0c10,0_0_0_12px_rgba(255,255,255,.08),0_40px_120px_rgba(0,0,0,.8)]',
        )}
        style={deviceStyle}
        // overflow:hidden containers can still be scrolled by focus()/scrollIntoView — pin them.
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
          e.currentTarget.scrollLeft = 0;
        }}
      >
        {mode === 'desktop' && <DesktopShell />}
        {mode === 'mobile' && <MobileShell />}
        {mode === 'tv' && <TVShell />}
        <ProcessLayer />
        <ContextMenu />
        <Toasts />
        <DisplayFilters />
      </div>
      {portraitFrame && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-white/30">
          Portrait locked
        </div>
      )}
    </div>
  );
}
