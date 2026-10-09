/** Calendar — month strip + agenda view with event creation. */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, Trash2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { usePersistentState, cx } from '../../lib/hooks';
import { useBackHandler } from '../../lib/backStack';

interface Event {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  where?: string;
  color: string;
}

const COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6'];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function seed(): Event[] {
  const t = new Date();
  return [
    { id: '1', title: 'Design review', date: key(t), start: '10:00', end: '11:00', where: 'Studio B', color: COLORS[1] },
    { id: '2', title: 'Lunch with Ada', date: key(t), start: '12:30', end: '13:30', where: 'Café Lumen', color: COLORS[2] },
    { id: '3', title: 'Ship OPOS 1.0 🚀', date: key(addDays(t, 1)), start: '16:00', end: '17:00', color: COLORS[0] },
    { id: '4', title: 'Gym', date: key(addDays(t, 2)), start: '07:00', end: '08:00', color: COLORS[3] },
    { id: '5', title: 'Movie night — Local Plex', date: key(addDays(t, 3)), start: '20:00', end: '22:00', where: 'Living room TV', color: COLORS[4] },
  ];
}

export default function Calendar({ pid, mode }: AppProps) {
  const [events, setEvents] = usePersistentState<Event[]>('calendar', seed());
  const [selected, setSelected] = useState(() => new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [editing, setEditing] = useState<Partial<Event> | null>(null);

  useBackHandler(pid, () => {
    if (editing) {
      setEditing(null);
      return true;
    }
    return false;
  });

  const base = new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const cells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e].sort((a, b) => a.start.localeCompare(b.start)));
    return m;
  }, [events]);

  const agendaDays = Array.from({ length: 14 }, (_, i) => addDays(selected, i)).filter((d, i) => i === 0 || byDay.has(key(d)));

  const save = () => {
    if (!editing?.title) return;
    const ev: Event = { id: editing.id ?? String(Date.now()), title: editing.title, date: editing.date ?? key(selected), start: editing.start ?? '09:00', end: editing.end ?? '10:00', where: editing.where, color: editing.color ?? COLORS[events.length % COLORS.length] };
    setEvents((list) => [...list.filter((e) => e.id !== ev.id), ev]);
    setEditing(null);
  };

  return (
    <div className={cx('relative flex h-full bg-black text-white', mode === 'desktop' ? 'flex-row' : 'flex-col')}>
      <div className={cx('shrink-0 px-4 pt-4', mode === 'desktop' && 'w-80 border-r border-white/10')}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{month.toLocaleDateString([], { month: 'long' })}</div>
            <div className="text-sm text-red-400">{month.getFullYear()}</div>
          </div>
          <div className="flex gap-1">
            <button className="rounded-full p-2 hover:bg-white/10" onClick={() => setMonthOffset((o) => o - 1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button className="rounded-full px-3 text-sm text-red-400 hover:bg-white/10" onClick={() => { setMonthOffset(0); setSelected(new Date()); }}>
              Today
            </button>
            <button className="rounded-full p-2 hover:bg-white/10" onClick={() => setMonthOffset((o) => o + 1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-white/40">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 pb-3 text-center">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const isSel = key(d) === key(selected);
            const isToday = key(d) === key(new Date());
            return (
              <button key={i} onClick={() => setSelected(d)} className="flex flex-col items-center">
                <span className={cx('grid h-8 w-8 place-items-center rounded-full text-[15px]', isSel ? (isToday ? 'bg-red-500 font-semibold' : 'bg-white font-semibold text-black') : isToday ? 'text-red-400 font-semibold' : '')}>{d.getDate()}</span>
                <span className={cx('h-1 w-1 rounded-full', byDay.has(key(d)) ? 'bg-white/50' : 'bg-transparent')} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-4 pb-20 md:border-t-0">
        {agendaDays.map((d) => {
          const list = byDay.get(key(d)) ?? [];
          return (
            <div key={key(d)} className="pt-4">
              <div className="sticky top-0 bg-black/90 py-1 text-sm font-semibold text-white/60 backdrop-blur">
                {key(d) === key(new Date()) ? 'Today' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              {list.length === 0 && <div className="py-3 text-sm text-white/30">No events</div>}
              {list.map((e) => (
                <button key={e.id} onClick={() => setEditing(e)} className="mt-2 flex w-full gap-3 rounded-xl bg-white/[.06] p-3 text-left hover:bg-white/10">
                  <span className="w-1 shrink-0 rounded-full" style={{ background: e.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{e.title}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-white/50">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {e.start} – {e.end}
                      </span>
                      {e.where && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin size={11} /> {e.where}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <button onClick={() => setEditing({ date: key(selected) })} className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full bg-red-500 shadow-xl transition active:scale-90" aria-label="New event">
        <Plus size={26} />
      </button>

      {editing && (
        <div className="absolute inset-0 z-10 flex animate-fade-in items-end bg-black/60 sm:items-center sm:justify-center" onClick={() => setEditing(null)}>
          <div className="w-full animate-slide-up rounded-t-3xl bg-[#1c1c1e] p-5 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => setEditing(null)} aria-label="Cancel">
                <X size={20} />
              </button>
              <span className="font-semibold">{editing.id ? 'Edit Event' : 'New Event'}</span>
              <button onClick={save} className="font-semibold text-red-400">
                {editing.id ? 'Done' : 'Add'}
              </button>
            </div>
            <div className="space-y-2">
              <input autoFocus placeholder="Title" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full rounded-xl bg-white/[.07] px-4 py-3 outline-none" />
              <input placeholder="Location" value={editing.where ?? ''} onChange={(e) => setEditing({ ...editing, where: e.target.value })} className="w-full rounded-xl bg-white/[.07] px-4 py-3 outline-none" />
              <div className="grid grid-cols-3 gap-2">
                <input type="date" value={editing.date ?? key(selected)} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="rounded-xl bg-white/[.07] px-3 py-3 text-sm outline-none" />
                <input type="time" value={editing.start ?? '09:00'} onChange={(e) => setEditing({ ...editing, start: e.target.value })} className="rounded-xl bg-white/[.07] px-3 py-3 text-sm outline-none" />
                <input type="time" value={editing.end ?? '10:00'} onChange={(e) => setEditing({ ...editing, end: e.target.value })} className="rounded-xl bg-white/[.07] px-3 py-3 text-sm outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing, color: c })} className={cx('h-7 w-7 rounded-full', editing.color === c && 'ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1e]')} style={{ background: c }} aria-label={`Color ${c}`} />
                ))}
              </div>
              {editing.id && (
                <button onClick={() => { setEvents((l) => l.filter((e) => e.id !== editing.id)); setEditing(null); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 py-3 text-red-400">
                  <Trash2 size={16} /> Delete event
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
