import { useEffect, useRef, useState } from 'react';
import { useOS } from '../store/useOS';

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), intervalMs);
  return now;
}

export function useTimeFormat() {
  const use24h = useOS((s) => s.settings.use24h);
  return (d: Date, withSeconds = false) =>
    d.toLocaleTimeString([], {
      hour: use24h ? '2-digit' : 'numeric',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: !use24h,
    });
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(t: string, cb: () => void): void;
  removeEventListener(t: string, cb: () => void): void;
}

export function useBattery() {
  const [state, setState] = useState({ level: 0.86, charging: true, supported: false });
  useEffect(() => {
    let battery: BatteryLike | null = null;
    const update = () => battery && setState({ level: battery.level, charging: battery.charging, supported: true });
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    nav.getBattery?.().then((b) => {
      battery = b;
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      battery?.removeEventListener('levelchange', update);
      battery?.removeEventListener('chargingchange', update);
    };
  }, []);
  return state;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const wifi = useOS((s) => s.settings.wifi && !s.settings.airplane);
  return online && wifi;
}

/** Persisted local state for apps (localStorage-backed useState). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`opos:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`opos:${key}`, JSON.stringify(value));
    } catch {
      /* quota */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
