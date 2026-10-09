import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, BellOff } from 'lucide-react';
import { useOS } from '../../store/useOS';
import { cx, useClock, useTimeFormat } from '../../lib/hooks';

export function NotificationCenter() {
  const history = useOS((s) => s.history);
  const clear = useOS((s) => s.clearHistory);
  const now = useClock(1000);
  const fmt = useTimeFormat();
  const [offset, setOffset] = useState(0);

  const month = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const firstDay = d.getDay();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { d, cells: [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] };
  }, [now.getMonth(), now.getFullYear(), offset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Notifications</span>
          {history.length > 0 && (
            <button className="rounded-md px-2 py-0.5 text-xs text-white/60 hover:bg-white/10" onClick={clear}>
              Clear all
            </button>
          )}
        </div>
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {history.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-xs text-white/40">
              <BellOff size={20} /> No new notifications
            </div>
          )}
          {history.map((t) => (
            <div key={t.id} className="rounded-xl bg-white/[.06] px-3 py-2">
              <div className="text-[13px] font-medium text-white">{t.title}</div>
              {t.body && <div className="text-xs text-white/55">{t.body}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-white/[.05] p-3">
        <div className="mb-1 text-2xl font-light text-white">{fmt(now, true)}</div>
        <div className="mb-3 text-xs text-white/50">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white/90">{month.d.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
          <div className="flex">
            <button className="rounded p-1 hover:bg-white/10" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">
              <ChevronLeft size={15} />
            </button>
            <button className="rounded p-1 hover:bg-white/10" onClick={() => setOffset((o) => o + 1)} aria-label="Next month">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="py-1 text-white/40">
              {d}
            </div>
          ))}
          {month.cells.map((day, i) => {
            const today = offset === 0 && day === now.getDate();
            return (
              <div key={i} className={cx('grid h-7 place-items-center rounded-full', today ? 'bg-os-accent font-semibold text-black' : day ? 'text-white/80' : '')}>
                {day ?? ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
