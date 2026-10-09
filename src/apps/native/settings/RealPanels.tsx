/**
 * Settings panels backed by real OS services (NetworkManager, BlueZ, logind). Rendered as
 * `custom` items inside the declarative settings model, in all three presentations.
 */
import { useState } from 'react';
import { Lock, Loader2, RefreshCw, Bluetooth, Power, RotateCcw, Moon, Snowflake, LockKeyhole, Check } from 'lucide-react';
import { bridge } from '../../../lib/bridge';
import { refresh, sysActions, useSystem, useWifiNetworks } from '../../../lib/system';
import { cx } from '../../../lib/hooks';

export type Variant = 'desktop' | 'mobile' | 'tv';

const errText = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  // Electron IPC wraps errors as "Error invoking remote method 'x': Error: msg"
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') || 'Failed';
};

const sz = (v: Variant, desktop: string, mobile: string, tv: string) => (v === 'tv' ? tv : v === 'mobile' ? mobile : desktop);

function SignalBars({ strength, v }: { strength: number; v: Variant }) {
  const bars = strength >= 75 ? 4 : strength >= 50 ? 3 : strength >= 25 ? 2 : 1;
  const h = v === 'tv' ? 28 : 14;
  return (
    <span className="flex items-end gap-[2px]" title={`${strength}%`} aria-label={`Signal ${strength}%`}>
      {[1, 2, 3, 4].map((b) => (
        <span key={b} className={cx('rounded-sm', b <= bars ? 'bg-white/85' : 'bg-white/20')} style={{ width: v === 'tv' ? 6 : 3, height: (h * b) / 4 }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ Wi-Fi */

export function WifiNetworksPanel({ variant: v }: { variant: Variant }) {
  const net = useSystem((s) => s.network);
  const enabled = !!net.wifiEnabled;
  const { networks, scanning, scan, connect, disconnect } = useWifiNetworks(enabled);
  const [open, setOpen] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ ssid: string; msg: string } | null>(null);

  if (!enabled) return <div className={cx('text-white/45', sz(v, 'text-[13px]', 'text-[14px]', 'text-2xl'))}>Turn on Wi-Fi to see available networks.</div>;

  const list = [...networks].sort((a, b) => Number(b.active) - Number(a.active) || b.strength - a.strength);

  const doConnect = async (ssid: string, pw?: string) => {
    setBusy(ssid);
    setError(null);
    try {
      await connect(ssid, pw || undefined);
      setOpen(null);
      setPassword('');
    } catch (e) {
      setError({ ssid, msg: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  const doDisconnect = async (ssid: string) => {
    setBusy(ssid);
    setError(null);
    try {
      await disconnect();
      void scan();
    } catch (e) {
      setError({ ssid, msg: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const btn = cx('shrink-0 rounded-lg font-medium disabled:opacity-40', sz(v, 'px-3 py-1 text-[12px]', 'px-3 py-1.5 text-[13px]', 'rounded-2xl px-6 py-2 text-2xl'));

  return (
    <div className="flex flex-col gap-1">
      <div className={cx('mb-1 flex items-center justify-between text-white/50', sz(v, 'text-[12px]', 'text-[13px]', 'text-2xl'))}>
        <span>{scanning ? 'Scanning…' : `${list.length} network${list.length === 1 ? '' : 's'} found`}</span>
        <button data-focusable={v === 'tv' ? '' : undefined} onClick={() => void scan()} disabled={scanning} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10 disabled:opacity-40" aria-label="Rescan">
          <RefreshCw size={v === 'tv' ? 24 : 13} className={cx(scanning && 'animate-spin')} /> Rescan
        </button>
      </div>
      {list.length === 0 && !scanning && <div className={cx('py-2 text-white/40', sz(v, 'text-[13px]', 'text-[14px]', 'text-2xl'))}>No networks in range</div>}
      {list.map((ap) => {
        const isOpen = open === ap.ssid && !ap.active;
        const isBusy = busy === ap.ssid;
        return (
          <div key={ap.ssid} className={cx('rounded-lg', ap.active ? 'bg-os-accent/10' : 'hover:bg-white/[.04]', v === 'tv' && 'rounded-2xl')}>
            <div className={cx('flex items-center gap-3', sz(v, 'px-2 py-2', 'px-1 py-2', 'px-4 py-3'))}>
              <SignalBars strength={ap.strength} v={v} />
              <div className="min-w-0 flex-1">
                <div className={cx('truncate', sz(v, 'text-[13px]', 'text-[15px]', 'text-3xl'), ap.active && 'font-semibold')}>{ap.ssid || '(hidden network)'}</div>
                <div className={cx('text-white/45', sz(v, 'text-[11px]', 'text-[12px]', 'text-xl'))}>
                  {ap.active ? 'Connected' : ap.secure ? (ap.enterprise ? 'Secured · Enterprise' : 'Secured') : 'Open'} · {ap.strength}%
                </div>
              </div>
              {ap.secure && <Lock size={v === 'tv' ? 26 : 13} className="shrink-0 text-white/45" aria-label="Secured" />}
              {ap.active && <Check size={v === 'tv' ? 30 : 15} className="shrink-0 text-os-accent" />}
              {isBusy ? (
                <Loader2 size={v === 'tv' ? 30 : 16} className="shrink-0 animate-spin text-white/60" />
              ) : ap.active ? (
                <button data-focusable={v === 'tv' ? '' : undefined} className={cx(btn, 'bg-white/10 hover:bg-white/15')} onClick={() => void doDisconnect(ap.ssid)}>
                  Disconnect
                </button>
              ) : (
                <button
                  data-focusable={v === 'tv' ? '' : undefined}
                  className={cx(btn, 'bg-os-accent text-black hover:brightness-110')}
                  onClick={() => {
                    if (ap.secure) {
                      setOpen(isOpen ? null : ap.ssid);
                      setPassword('');
                      setError(null);
                    } else void doConnect(ap.ssid);
                  }}
                >
                  {isOpen ? 'Cancel' : 'Connect'}
                </button>
              )}
            </div>
            {isOpen && (
              <form
                className={cx('flex items-center gap-2', sz(v, 'px-2 pb-2', 'px-1 pb-2', 'px-4 pb-4'))}
                onSubmit={(e) => {
                  e.preventDefault();
                  void doConnect(ap.ssid, password);
                }}
              >
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (blank to use saved)"
                  aria-label={`Password for ${ap.ssid}`}
                  className={cx('min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 outline-none focus:border-os-accent', sz(v, 'px-3 py-1.5 text-[13px]', 'px-3 py-2 text-[15px]', 'rounded-2xl px-5 py-3 text-2xl'))}
                />
                <button type="submit" data-focusable={v === 'tv' ? '' : undefined} disabled={isBusy} className={cx(btn, 'bg-os-accent text-black')}>
                  Join
                </button>
              </form>
            )}
            {error?.ssid === ap.ssid && <div className={cx('text-red-300', sz(v, 'px-2 pb-2 text-[12px]', 'px-1 pb-2 text-[13px]', 'px-4 pb-3 text-xl'))}>{error.msg}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- Bluetooth */

export function BluetoothDevicesPanel({ variant: v }: { variant: Variant }) {
  const bt = useSystem((s) => s.bluetooth);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ path: string; msg: string } | null>(null);

  if (!bt.powered) return <div className={cx('text-white/45', sz(v, 'text-[13px]', 'text-[14px]', 'text-2xl'))}>Turn on Bluetooth to manage devices.</div>;
  if (!bt.devices.length) return <div className={cx('text-white/45', sz(v, 'text-[13px]', 'text-[14px]', 'text-2xl'))}>No paired devices. Pair new devices with your system's Bluetooth pairing tool.</div>;

  const toggle = async (path: string, connect: boolean) => {
    if (!bridge.os) return;
    setBusy(path);
    setError(null);
    try {
      await bridge.os.bluetoothDevice(path, connect);
    } catch (e) {
      setError({ path, msg: errText(e) });
    } finally {
      setBusy(null);
      void refresh.bluetooth();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {bt.devices.map((d) => (
        <div key={d.path} className={cx('rounded-lg', d.connected ? 'bg-os-accent/10' : 'hover:bg-white/[.04]', v === 'tv' && 'rounded-2xl')}>
          <div className={cx('flex items-center gap-3', sz(v, 'px-2 py-2', 'px-1 py-2', 'px-4 py-3'))}>
            <Bluetooth size={v === 'tv' ? 30 : 16} className={d.connected ? 'text-os-accent' : 'text-white/45'} />
            <div className="min-w-0 flex-1">
              <div className={cx('truncate', sz(v, 'text-[13px]', 'text-[15px]', 'text-3xl'), d.connected && 'font-semibold')}>{d.name}</div>
              <div className={cx('text-white/45', sz(v, 'text-[11px]', 'text-[12px]', 'text-xl'))}>
                {d.connected ? 'Connected' : 'Paired'}
                {d.icon ? ` · ${d.icon.replace(/-/g, ' ')}` : ''}
                {d.battery != null ? ` · Battery ${d.battery}%` : ''}
              </div>
            </div>
            {busy === d.path ? (
              <Loader2 size={v === 'tv' ? 30 : 16} className="animate-spin text-white/60" />
            ) : (
              <button
                data-focusable={v === 'tv' ? '' : undefined}
                onClick={() => void toggle(d.path, !d.connected)}
                className={cx(
                  'shrink-0 rounded-lg font-medium',
                  sz(v, 'px-3 py-1 text-[12px]', 'px-3 py-1.5 text-[13px]', 'rounded-2xl px-6 py-2 text-2xl'),
                  d.connected ? 'bg-white/10 hover:bg-white/15' : 'bg-os-accent text-black hover:brightness-110',
                )}
              >
                {d.connected ? 'Disconnect' : 'Connect'}
              </button>
            )}
          </div>
          {error?.path === d.path && <div className={cx('text-red-300', sz(v, 'px-2 pb-2 text-[12px]', 'px-1 pb-2 text-[13px]', 'px-4 pb-3 text-xl'))}>{error.msg}</div>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Power */

type PowerAction = 'poweroff' | 'reboot' | 'suspend' | 'hibernate' | 'lock';

export function PowerActionsPanel({ variant: v }: { variant: Variant }) {
  const caps = useSystem((s) => s.power);
  const [confirm, setConfirm] = useState<PowerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions: { id: PowerAction; label: string; icon: typeof Power; show: boolean; danger?: boolean }[] = [
    { id: 'lock', label: 'Lock', icon: LockKeyhole, show: true },
    { id: 'suspend', label: 'Sleep', icon: Moon, show: caps.suspend },
    { id: 'hibernate', label: 'Hibernate', icon: Snowflake, show: caps.hibernate },
    { id: 'reboot', label: 'Restart', icon: RotateCcw, show: caps.reboot, danger: true },
    { id: 'poweroff', label: 'Shut down', icon: Power, show: caps.poweroff, danger: true },
  ];

  const run = async (a: PowerAction) => {
    setConfirm(null);
    setError(null);
    try {
      await sysActions.power(a);
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions
          .filter((a) => a.show)
          .map((a) => {
            const asking = confirm === a.id;
            return (
              <button
                key={a.id}
                data-focusable={v === 'tv' ? '' : undefined}
                onClick={() => (a.danger && !asking ? setConfirm(a.id) : void run(a.id))}
                className={cx(
                  'flex items-center gap-2 rounded-lg font-medium transition',
                  sz(v, 'px-3 py-1.5 text-[13px]', 'px-3 py-2 text-[14px]', 'rounded-2xl px-6 py-3 text-2xl'),
                  asking ? 'bg-red-500 text-white' : a.danger ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-white/10 hover:bg-white/15',
                )}
              >
                <a.icon size={v === 'tv' ? 26 : 15} />
                {asking ? `Confirm ${a.label.toLowerCase()}?` : a.label}
              </button>
            );
          })}
        {confirm && (
          <button data-focusable={v === 'tv' ? '' : undefined} onClick={() => setConfirm(null)} className={cx('rounded-lg text-white/60 hover:bg-white/10', sz(v, 'px-3 py-1.5 text-[13px]', 'px-3 py-2 text-[14px]', 'rounded-2xl px-6 py-3 text-2xl'))}>
            Cancel
          </button>
        )}
      </div>
      {!caps.available && <div className={cx('mt-2 text-white/40', sz(v, 'text-[12px]', 'text-[13px]', 'text-xl'))}>logind is not reachable; only locking may work.</div>}
      {error && <div className={cx('mt-2 text-red-300', sz(v, 'text-[12px]', 'text-[13px]', 'text-xl'))}>{error}</div>}
    </div>
  );
}

