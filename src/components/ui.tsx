/** Small shared UI primitives used by shells and apps. */
import type { ReactNode } from 'react';
import { cx } from '../lib/hooks';

export function Toggle({ on, onChange, size = 'md', label }: { on: boolean; onChange: (v: boolean) => void; size?: 'md' | 'xl'; label?: string }) {
  const big = size === 'xl';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={cx(
        'relative shrink-0 rounded-full transition-colors duration-200',
        big ? 'h-12 w-24' : 'h-6 w-11',
        on ? 'bg-os-accent' : 'bg-white/15',
      )}
    >
      <span
        className={cx(
          'absolute top-1 rounded-full bg-white shadow-md transition-all duration-200',
          big ? 'h-10 w-10' : 'h-4 w-4',
          on ? (big ? 'left-[3.25rem]' : 'left-6') : 'left-1',
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('os-range w-full', className)}
      style={{ ['--pct' as string]: `${pct}%` }}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cx('h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white', className)} />;
}

export function EmptyState({ icon, title, body, children }: { icon?: ReactNode; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white/60">
      {icon && <div className="text-white/40">{icon}</div>}
      <div className="text-lg font-semibold text-white/85">{title}</div>
      {body && <div className="max-w-sm text-sm">{body}</div>}
      {children}
    </div>
  );
}
