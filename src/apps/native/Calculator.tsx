/** Calculator — touch-first iOS-style calculator with keyboard support (no eval). */
import { useEffect, useState } from 'react';
import type { AppProps } from '../../types';
import { cx } from '../../lib/hooks';

type Op = '+' | '−' | '×' | '÷';

function apply(a: number, b: number, op: Op) {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

function format(v: string) {
  if (v === 'Error') return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Error';
  if (v.endsWith('.') || /\.\d*0$/.test(v)) {
    const [i, d] = v.split('.');
    return `${Number(i).toLocaleString('en-US')}.${d}`;
  }
  if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-7 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return n.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export default function Calculator({ pid }: AppProps) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const input = (d: string) => {
    if (display === 'Error') return setDisplay(d === '.' ? '0.' : d), setOverwrite(false);
    if (overwrite) {
      setDisplay(d === '.' ? '0.' : d);
      setOverwrite(false);
      return;
    }
    if (d === '.' && display.includes('.')) return;
    if (display.replace(/[-.]/g, '').length >= 12) return;
    setDisplay(display === '0' && d !== '.' ? d : display + d);
  };

  const operator = (next: Op) => {
    const cur = Number(display);
    if (op && acc !== null && !overwrite) {
      const r = apply(acc, cur, op);
      setAcc(r);
      setDisplay(Number.isFinite(r) ? String(parseFloat(r.toPrecision(12))) : 'Error');
    } else setAcc(cur);
    setOp(next);
    setOverwrite(true);
  };

  const equals = () => {
    if (!op || acc === null) return;
    const cur = Number(display);
    const r = apply(acc, cur, op);
    const out = Number.isFinite(r) ? String(parseFloat(r.toPrecision(12))) : 'Error';
    setHistory((h) => [`${format(String(acc))} ${op} ${format(display)} = ${format(out)}`, ...h].slice(0, 5));
    setDisplay(out);
    setAcc(null);
    setOp(null);
    setOverwrite(true);
  };

  const clear = () => {
    if (display !== '0' && !overwrite) {
      setDisplay('0');
      setOverwrite(true);
    } else {
      setAcc(null);
      setOp(null);
      setDisplay('0');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const frame = document.querySelector(`[data-pid="${pid}"]`);
      if (!frame || frame.getAttribute('aria-hidden') === 'true' || !frame.contains(document.activeElement) && document.activeElement !== document.body) return;
      const k = e.key;
      if (/^[0-9.]$/.test(k)) input(k);
      else if (k === '+') operator('+');
      else if (k === '-') operator('−');
      else if (k === '*') operator('×');
      else if (k === '/') operator('÷');
      else if (k === '=' || (k === 'Enter' && !(e.target as HTMLElement).closest('button'))) equals();
      else if (k === 'Escape' || k === 'c') clear();
      else if (k === 'Backspace') setDisplay((d) => (overwrite || d.length <= 1 ? '0' : d.slice(0, -1)));
      else if (k === '%') setDisplay(String(Number(display) / 100));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys: { label: string; kind: 'fn' | 'op' | 'num'; action: () => void; wide?: boolean }[] = [
    { label: display !== '0' && !overwrite ? 'C' : 'AC', kind: 'fn', action: clear },
    { label: '±', kind: 'fn', action: () => setDisplay((d) => (d.startsWith('-') ? d.slice(1) : d === '0' ? d : '-' + d)) },
    { label: '%', kind: 'fn', action: () => setDisplay(String(Number(display) / 100)) },
    { label: '÷', kind: 'op', action: () => operator('÷') },
    ...['7', '8', '9'].map((n) => ({ label: n, kind: 'num' as const, action: () => input(n) })),
    { label: '×', kind: 'op', action: () => operator('×') },
    ...['4', '5', '6'].map((n) => ({ label: n, kind: 'num' as const, action: () => input(n) })),
    { label: '−', kind: 'op', action: () => operator('−') },
    ...['1', '2', '3'].map((n) => ({ label: n, kind: 'num' as const, action: () => input(n) })),
    { label: '+', kind: 'op', action: () => operator('+') },
    { label: '0', kind: 'num', action: () => input('0'), wide: true },
    { label: '.', kind: 'num', action: () => input('.') },
    { label: '=', kind: 'op', action: equals },
  ];

  const shown = format(display);
  return (
    <div className="flex h-full flex-col bg-black p-4 text-white" tabIndex={-1}>
      <div className="flex min-h-0 flex-1 flex-col items-end justify-end overflow-hidden pb-3">
        {history.map((h, i) => (
          <div key={i} className="truncate text-sm text-white/30">
            {h}
          </div>
        ))}
        <div className="selectable mt-1 w-full truncate text-right font-light leading-none" style={{ fontSize: `clamp(2.5rem, ${Math.max(9, 18 - shown.length * 0.6)}vmin, 5.5rem)` }}>
          {shown}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {keys.map((k) => {
          const active = k.kind === 'op' && k.label === op && overwrite;
          return (
            <button
              key={k.label}
              onClick={k.action}
              className={cx(
                'flex aspect-square items-center rounded-full text-[clamp(1.4rem,4.5vmin,2.1rem)] transition active:brightness-150',
                k.wide ? 'col-span-2 aspect-auto justify-start pl-[1.4em]' : 'justify-center',
                k.kind === 'fn' && 'bg-[#a5a5a5] font-medium text-black',
                k.kind === 'num' && 'bg-[#333]',
                k.kind === 'op' && (active ? 'bg-white text-[#ff9f0a]' : 'bg-[#ff9f0a]'),
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
