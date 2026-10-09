/** Shell-wide overlays: toasts, the context menu, and display filters (brightness / night light). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, Tv, Gamepad2, Zap, Bell } from 'lucide-react';
import { useOS } from '../store/useOS';
import { cx } from '../lib/hooks';

const TOAST_ICONS: Record<string, typeof Monitor> = { desktop: Monitor, mobile: Smartphone, tv: Tv, gamepad: Gamepad2, auto: Zap };

export function Toasts() {
  const toasts = useOS((s) => s.toasts);
  const mode = useOS((s) => s.mode);
  const dismiss = useOS((s) => s.dismissToast);
  const pos =
    mode === 'desktop'
      ? 'bottom-16 right-4 items-end'
      : mode === 'mobile'
        ? 'top-10 inset-x-3 items-center'
        : 'top-8 right-10 items-end';
  return (
    <div className={cx('pointer-events-none absolute z-[9900] flex flex-col gap-2', pos)}>
      {toasts.map((t) => {
        const Icon = (t.icon && TOAST_ICONS[t.icon]) || Bell;
        return (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex animate-slide-up items-center gap-3 rounded-2xl border border-white/10 bg-[#141724]/90 shadow-window backdrop-blur-xl',
              mode === 'tv' ? 'min-w-[380px] px-6 py-4' : 'min-w-[260px] max-w-[360px] px-4 py-3',
            )}
            onClick={() => dismiss(t.id)}
          >
            <div className={cx('grid shrink-0 place-items-center rounded-xl bg-os-accent/20 text-os-accent', mode === 'tv' ? 'h-12 w-12' : 'h-9 w-9')}>
              <Icon size={mode === 'tv' ? 26 : 18} />
            </div>
            <div className="min-w-0">
              <div className={cx('font-semibold text-white', mode === 'tv' ? 'text-xl' : 'text-sm')}>{t.title}</div>
              {t.body && <div className={cx('truncate text-white/60', mode === 'tv' ? 'text-base' : 'text-xs')}>{t.body}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu() {
  const menu = useOS((s) => s.contextMenu);
  const close = useOS((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.parentElement!.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x - parent.left, parent.width - r.width - 6),
      y: Math.min(menu.y - parent.top, parent.height - r.height - 6),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="absolute z-[9800] min-w-[220px] animate-pop-in rounded-xl border border-white/10 bg-[#171a27]/95 p-1.5 text-[13px] shadow-window backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
      data-nav-scope
      data-nav-priority="40"
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-white/10" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            className={cx(
              'flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left transition disabled:opacity-40',
              item.danger ? 'text-red-300 hover:bg-red-500/20' : 'text-white/85 hover:bg-white/10',
            )}
            onClick={() => {
              close();
              item.action?.();
            }}
          >
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-[11px] text-white/35">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function DisplayFilters() {
  const brightness = useOS((s) => s.settings.brightness);
  const nightLight = useOS((s) => s.settings.nightLight);
  return (
    <>
      {nightLight && <div className="pointer-events-none absolute inset-0 z-[10000] bg-orange-400/15 mix-blend-multiply" />}
      {brightness < 100 && (
        <div className="pointer-events-none absolute inset-0 z-[10001] bg-black" style={{ opacity: ((100 - brightness) / 100) * 0.8 }} />
      )}
    </>
  );
}
