import type { AppDefinition } from '../types';
import { cx } from '../lib/hooks';

/** The OPOS squircle app icon: gradient plate + glossy highlight + glyph. */
export function AppIcon({ app, size = 56, className }: { app: AppDefinition; size?: number; className?: string }) {
  const Icon = app.icon;
  return (
    <div
      className={cx('relative grid shrink-0 place-items-center overflow-hidden text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: app.gradient,
        boxShadow: `0 ${size * 0.08}px ${size * 0.3}px -${size * 0.08}px ${app.accent}88, inset 0 1px 0 rgba(255,255,255,.25)`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <Icon size={size * 0.5} strokeWidth={1.9} className="relative drop-shadow" />
    </div>
  );
}
