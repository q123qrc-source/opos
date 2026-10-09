/** Phone — large keypad with DTMF tones, recents, contacts and an in-call screen. */
import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Delete, Clock, Users, Grid3x3, Star, Mic, MicOff, Volume2, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import type { AppProps } from '../../types';
import { usePersistentState, cx } from '../../lib/hooks';
import { useBackHandler } from '../../lib/backStack';

const KEYS: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

// DTMF frequency pairs (Hz).
const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};

const CONTACTS = [
  { name: 'Ada Lovelace', number: '+1 415 555 0101', color: '#f472b6' },
  { name: 'Alan Turing', number: '+44 20 7946 0958', color: '#60a5fa' },
  { name: 'Grace Hopper', number: '+1 212 555 0199', color: '#34d399' },
  { name: 'Linus Torvalds', number: '+358 9 555 0123', color: '#fbbf24' },
  { name: 'Margaret Hamilton', number: '+1 617 555 0147', color: '#a78bfa' },
  { name: 'Tim Berners-Lee', number: '+44 1865 555 010', color: '#fb7185' },
];

let ctx: AudioContext | null = null;
function tone(key: string, ms = 140) {
  const pair = DTMF[key];
  if (!pair) return;
  ctx ??= new AudioContext();
  const g = ctx.createGain();
  g.gain.value = 0.08;
  g.connect(ctx.destination);
  for (const f of pair) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  }
}

type Recent = { number: string; at: number; kind: 'in' | 'out' | 'missed'; seconds: number };

export default function Dialer({ pid }: AppProps) {
  const [tab, setTab] = useState<'keypad' | 'recents' | 'contacts' | 'favorites'>('keypad');
  const [number, setNumber] = useState('');
  const [call, setCall] = useState<{ number: string; start: number; connected: boolean } | null>(null);
  const [recents, setRecents] = usePersistentState<Recent[]>('dialer-recents', [
    { number: CONTACTS[0].number, at: Date.now() - 3600e3, kind: 'in', seconds: 312 },
    { number: CONTACTS[2].number, at: Date.now() - 86400e3, kind: 'missed', seconds: 0 },
    { number: '+1 650 555 0177', at: Date.now() - 2 * 86400e3, kind: 'out', seconds: 64 },
  ]);

  useBackHandler(pid, () => {
    if (call) return false;
    if (tab !== 'keypad') {
      setTab('keypad');
      return true;
    }
    return false;
  });

  const press = (k: string) => {
    tone(k);
    if (navigator.vibrate) navigator.vibrate(8);
    setNumber((n) => (n.length < 20 ? n + k : n));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (call || tab !== 'keypad') return;
      const frame = document.querySelector(`[data-pid="${pid}"]`);
      if (!frame || frame.getAttribute('aria-hidden') === 'true') return;
      if (/^[0-9*#]$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setNumber((n) => n.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startCall = (n: string) => {
    if (!n) return;
    setCall({ number: n, start: Date.now(), connected: false });
  };
  const endCall = () => {
    if (call) setRecents((r) => [{ number: call.number, at: Date.now(), kind: 'out' as const, seconds: call.connected ? Math.round((Date.now() - call.start) / 1000) : 0 }, ...r].slice(0, 30));
    setCall(null);
    setNumber('');
  };

  if (call) return <InCall call={call} setCall={setCall} onEnd={endCall} />;

  const nameFor = (n: string) => CONTACTS.find((c) => c.number === n)?.name;

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'keypad' && (
          <div className="flex h-full flex-col items-center justify-end gap-6 px-8 pb-6">
            <div className="flex h-24 flex-col items-center justify-end">
              <div className="text-[clamp(1.8rem,9vw,2.6rem)] font-light tracking-wide">{number || ' '}</div>
              {nameFor(number) && <div className="text-sm text-os-accent">{nameFor(number)}</div>}
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              {KEYS.map(([k, sub]) => (
                <button key={k} onClick={() => press(k)} className="grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full bg-white/[.13] transition active:bg-white/40">
                  <span className="text-[2rem] leading-none">{k}</span>
                  <span className="-mt-3 text-[10px] font-semibold tracking-[0.2em] text-white/70">{sub}</span>
                </button>
              ))}
            </div>
            <div className="grid w-full grid-cols-3 items-center">
              <span />
              <button onClick={() => startCall(number)} className="mx-auto grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full bg-[#30d158] transition active:scale-95" aria-label="Call">
                <Phone size={30} fill="white" />
              </button>
              {number && (
                <button onClick={() => setNumber((n) => n.slice(0, -1))} className="mx-auto p-3 text-white/70" aria-label="Delete">
                  <Delete size={26} />
                </button>
              )}
            </div>
          </div>
        )}
        {tab === 'recents' && (
          <div className="px-4 pt-6">
            <h1 className="mb-4 text-3xl font-bold">Recents</h1>
            {recents.map((r, i) => {
              const Icon = r.kind === 'in' ? PhoneIncoming : r.kind === 'out' ? PhoneOutgoing : PhoneMissed;
              return (
                <button key={i} onClick={() => startCall(r.number)} className="flex w-full items-center gap-3 border-b border-white/10 py-3 text-left">
                  <Icon size={16} className={r.kind === 'missed' ? 'text-red-400' : 'text-white/40'} />
                  <div className="flex-1">
                    <div className={cx('text-[16px]', r.kind === 'missed' && 'text-red-400')}>{nameFor(r.number) ?? r.number}</div>
                    <div className="text-xs text-white/40">{r.kind === 'missed' ? 'Missed' : `${Math.floor(r.seconds / 60)}m ${r.seconds % 60}s`}</div>
                  </div>
                  <span className="text-sm text-white/40">{new Date(r.at).toLocaleDateString([], { weekday: 'short' })}</span>
                </button>
              );
            })}
          </div>
        )}
        {(tab === 'contacts' || tab === 'favorites') && (
          <div className="px-4 pt-6">
            <h1 className="mb-4 text-3xl font-bold">{tab === 'contacts' ? 'Contacts' : 'Favorites'}</h1>
            {(tab === 'contacts' ? CONTACTS : CONTACTS.slice(0, 3)).map((c) => (
              <button key={c.number} onClick={() => startCall(c.number)} className="flex w-full items-center gap-3 border-b border-white/10 py-3 text-left">
                <div className="grid h-10 w-10 place-items-center rounded-full font-semibold text-black" style={{ background: c.color }}>
                  {c.name.split(' ').map((p) => p[0]).join('')}
                </div>
                <div className="flex-1">
                  <div className="text-[16px]">{c.name}</div>
                  <div className="text-xs text-white/40">{c.number}</div>
                </div>
                <Phone size={18} className="text-os-accent" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 border-t border-white/10 bg-[#111] py-2">
        {[
          { id: 'favorites', label: 'Favorites', icon: Star },
          { id: 'recents', label: 'Recents', icon: Clock },
          { id: 'contacts', label: 'Contacts', icon: Users },
          { id: 'keypad', label: 'Keypad', icon: Grid3x3 },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)} className={cx('flex flex-col items-center gap-0.5 text-[10px]', tab === t.id ? 'text-os-accent' : 'text-white/50')}>
            <t.icon size={22} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InCall({ call, setCall, onEnd }: { call: { number: string; start: number; connected: boolean }; setCall: (c: { number: string; start: number; connected: boolean }) => void; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const callRef = useRef(call);
  callRef.current = call;
  useEffect(() => {
    const ring = setTimeout(() => setCall({ ...callRef.current, connected: true, start: Date.now() }), 2200);
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearTimeout(ring);
      clearInterval(id);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const secs = Math.floor((now - call.start) / 1000);
  const name = CONTACTS.find((c) => c.number === call.number)?.name;
  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-[#1f2937] to-black px-8 pb-12 pt-20 text-white">
      <div className="grid h-24 w-24 place-items-center rounded-full bg-white/10 text-3xl">{(name ?? '#')[0]}</div>
      <div className="mt-4 text-3xl font-light">{name ?? call.number}</div>
      <div className="mt-1 text-white/60">{call.connected ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'Calling…'}</div>
      <div className="mt-auto grid grid-cols-3 gap-6">
        <button onClick={() => setMuted(!muted)} className={cx('grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full', muted ? 'bg-white text-black' : 'bg-white/15')} aria-label="Mute">
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button className="grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full bg-white/15" aria-label="Keypad">
          <Grid3x3 />
        </button>
        <button onClick={() => setSpeaker(!speaker)} className={cx('grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full', speaker ? 'bg-white text-black' : 'bg-white/15')} aria-label="Speaker">
          <Volume2 />
        </button>
      </div>
      <button onClick={onEnd} className="mt-10 grid h-[4.6rem] w-[4.6rem] place-items-center rounded-full bg-[#ff453a]" aria-label="End call">
        <PhoneOff size={30} />
      </button>
    </div>
  );
}
