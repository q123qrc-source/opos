/**
 * React hooks over the real OS services (NetworkManager, UPower, BlueZ, PipeWire, logind, MPRIS).
 * Outside Electron — or when a service is missing — they report `available: false` and the UI
 * falls back to OPOS's own simulated settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  bridge,
  type AccessPoint,
  type Battery,
  type BluetoothState,
  type BrightnessState,
  type MediaPlayer,
  type NetworkState,
  type OsInfo,
  type PowerCaps,
  type VolumeState,
} from './bridge';

export const hasRealOs = !!bridge.os;

interface SysState {
  battery: Battery;
  network: NetworkState;
  volume: VolumeState;
  brightness: BrightnessState;
  bluetooth: BluetoothState;
  media: MediaPlayer[];
  power: PowerCaps;
  info: OsInfo | null;
}

const useSys = create<SysState>(() => ({
  battery: { available: false },
  network: { available: false },
  volume: { available: false, level: 0, muted: false },
  brightness: { available: false, level: 100 },
  bluetooth: { available: false, powered: false, devices: [] },
  media: [],
  power: { available: false, poweroff: false, reboot: false, suspend: false, hibernate: false },
  info: null,
}));

const os = bridge.os;

async function safe<T>(p: Promise<T> | undefined): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

export const refresh = {
  battery: async () => {
    const v = await safe(os?.battery());
    if (v) useSys.setState({ battery: v });
  },
  network: async () => {
    const v = await safe(os?.network());
    if (v) useSys.setState({ network: v });
  },
  volume: async () => {
    const v = await safe(os?.volume());
    if (v) useSys.setState({ volume: v });
  },
  brightness: async () => {
    const v = await safe(os?.brightness());
    if (v) useSys.setState({ brightness: v });
  },
  bluetooth: async () => {
    const v = await safe(os?.bluetooth());
    if (v) useSys.setState({ bluetooth: v });
  },
  media: async () => {
    const v = await safe(os?.media());
    if (v) useSys.setState({ media: v });
  },
  power: async () => {
    const v = await safe(os?.powerCaps());
    if (v) useSys.setState({ power: v });
  },
  info: async () => {
    const v = await safe(os?.info());
    if (v) useSys.setState({ info: v });
  },
};

// Push-based updates + a slow poll for everything that has no change signal.
let started = false;
let subscribers = 0;
let pollTimer = 0;
function startPolling() {
  subscribers++;
  if (!os || started) return;
  started = true;
  void Promise.all(Object.values(refresh).map((f) => f()));
  os.onBattery((b) => useSys.setState({ battery: b }));
  os.onNetwork((n) => useSys.setState({ network: n }));
  pollTimer = window.setInterval(() => {
    void refresh.volume();
    void refresh.brightness();
    void refresh.media();
    void refresh.bluetooth();
    void refresh.battery();
  }, 4000);
}
function stopPolling() {
  subscribers--;
  if (subscribers <= 0 && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
    started = false;
  }
}

export function useSystem<T>(selector: (s: SysState) => T): T {
  useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);
  return useSys(selector);
}

/* ---------------------------------------------------------------- actions */

export const sysActions = {
  async setVolume(v: number) {
    useSys.setState((s) => ({ volume: { ...s.volume, level: v } }));
    await safe(os?.setVolume(v));
  },
  async toggleMute() {
    const muted = !useSys.getState().volume.muted;
    useSys.setState((s) => ({ volume: { ...s.volume, muted } }));
    await safe(os?.setMuted(muted));
  },
  async setBrightness(v: number) {
    useSys.setState((s) => ({ brightness: { ...s.brightness, level: v } }));
    await safe(os?.setBrightness(v));
  },
  async setWifi(on: boolean) {
    useSys.setState((s) => ({ network: { ...s.network, wifiEnabled: on } }));
    await safe(os?.setWifiEnabled(on));
    setTimeout(() => void refresh.network(), 800);
  },
  async setBluetooth(on: boolean) {
    useSys.setState((s) => ({ bluetooth: { ...s.bluetooth, powered: on } }));
    await safe(os?.setBluetoothPowered(on));
    setTimeout(() => void refresh.bluetooth(), 800);
  },
  async media(action: string, id?: string) {
    await safe(os?.mediaControl(action, id));
    setTimeout(() => void refresh.media(), 300);
  },
  power: (action: 'poweroff' | 'reboot' | 'suspend' | 'hibernate' | 'lock') => os?.power(action),
};

/** Wi-Fi network list with scanning + connect. */
export function useWifiNetworks(enabled: boolean) {
  const [networks, setNetworks] = useState<AccessPoint[]>([]);
  const [scanning, setScanning] = useState(false);
  const alive = useRef(true);
  const scan = useCallback(async () => {
    if (!os) return;
    setScanning(true);
    const list = await safe(os.wifiScan());
    if (alive.current) {
      setNetworks(list ?? []);
      setScanning(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (enabled) void scan();
    const id = enabled ? window.setInterval(scan, 15000) : 0;
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [enabled, scan]);
  const connect = async (ssid: string, password?: string) => {
    if (!os) throw new Error('Not available');
    await os.wifiConnect(ssid, password);
    setTimeout(() => {
      void refresh.network();
      void scan();
    }, 1500);
  };
  return { networks, scanning, scan, connect, disconnect: () => os?.wifiDisconnect().then(() => refresh.network()) };
}

export function formatDuration(seconds: number) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
