/**
 * Real system integration for OPOS. Every backend is optional and reports `available: false`
 * instead of throwing when its service is missing.
 *
 *   power      systemd-logind      PowerOff / Reboot / Suspend / Hibernate / lock session
 *   battery    UPower              DisplayDevice percentage, state, time remaining
 *   network    NetworkManager      state, Wi-Fi toggle, scan, connect (WPA-PSK / open), disconnect
 *   bluetooth  BlueZ               adapter power, paired devices, connect / disconnect
 *   audio      PipeWire (wpctl) or PulseAudio (pactl)  volume + mute
 *   backlight  sysfs + logind SetBrightness (no root needed)
 *   media      MPRIS               now playing + transport controls for any player
 *   notify     org.freedesktop.Notifications server → OPOS toasts
 *   info       os-release, kernel, CPU, memory, uptime, hostname
 *   processes  /proc                per-process CPU% / RSS, terminate
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { EventEmitter } = require('events');
const { sessionBus, systemBus, iface, props, unwrap, withTimeout, Variant, dbus } = require('./dbus.cjs');
const { inPath } = require('./apps.cjs');

const run = (cmd, args, timeout = 4000) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))),
  );

const LOGIN1 = 'org.freedesktop.login1';
const NM = 'org.freedesktop.NetworkManager';
const UPOWER = 'org.freedesktop.UPower';
const BLUEZ = 'org.bluez';

class SystemServices extends EventEmitter {
  constructor() {
    super();
    this.notifications = new Map();
    this.nextNotificationId = 1;
    this.cpuPrev = null;
    this.procPrev = new Map();
  }

  async start() {
    await Promise.allSettled([this.startNotificationServer(), this.watchBattery(), this.watchNetwork()]);
  }

  /* ---------------------------------------------------------------- power */

  async power(action) {
    const mgr = await iface(systemBus(), LOGIN1, '/org/freedesktop/login1', 'org.freedesktop.login1.Manager');
    if (action === 'lock') {
      if (inPath('loginctl')) return run('loginctl', ['lock-session']);
      throw new Error('loginctl not available');
    }
    if (!mgr) throw new Error('systemd-logind is not reachable');
    switch (action) {
      case 'poweroff':
        return mgr.PowerOff(true);
      case 'reboot':
        return mgr.Reboot(true);
      case 'suspend':
        return mgr.Suspend(true);
      case 'hibernate':
        return mgr.Hibernate(true);
      default:
        throw new Error(`unknown power action ${action}`);
    }
  }

  async powerCapabilities() {
    const mgr = await iface(systemBus(), LOGIN1, '/org/freedesktop/login1', 'org.freedesktop.login1.Manager');
    if (!mgr) return { available: false, poweroff: false, reboot: false, suspend: false, hibernate: false };
    const can = async (m) => {
      try {
        const r = await mgr[m]();
        return r === 'yes' || r === 'challenge';
      } catch {
        return false;
      }
    };
    return {
      available: true,
      poweroff: await can('CanPowerOff'),
      reboot: await can('CanReboot'),
      suspend: await can('CanSuspend'),
      hibernate: await can('CanHibernate'),
    };
  }

  /* -------------------------------------------------------------- battery */

  async battery() {
    const p = await props(systemBus(), UPOWER, '/org/freedesktop/UPower/devices/DisplayDevice', 'org.freedesktop.UPower.Device');
    if (!p || !p.IsPresent) return { available: false };
    // UPower states: 1 charging, 2 discharging, 3 empty, 4 fully charged, 5 pending charge, 6 pending discharge
    return {
      available: true,
      level: Math.round(p.Percentage),
      charging: p.State === 1 || p.State === 4 || p.State === 5,
      full: p.State === 4,
      timeToEmpty: p.TimeToEmpty || 0,
      timeToFull: p.TimeToFull || 0,
    };
  }

  async watchBattery() {
    const bus = systemBus();
    const p = await iface(bus, UPOWER, '/org/freedesktop/UPower/devices/DisplayDevice', 'org.freedesktop.DBus.Properties');
    if (!p) return;
    p.on('PropertiesChanged', async () => this.emit('battery', await this.battery()));
  }

  /* -------------------------------------------------------------- network */

  async nm() {
    return iface(systemBus(), NM, '/org/freedesktop/NetworkManager', NM);
  }

  async network() {
    const bus = systemBus();
    const p = await props(bus, NM, '/org/freedesktop/NetworkManager', NM);
    if (!p) return { available: false };
    // NM_STATE: 70 connected global, 60 site, 50 local, 40 connecting, 20 disconnected
    const out = {
      available: true,
      online: p.State >= 60,
      connecting: p.State === 40,
      wifiEnabled: !!p.WirelessEnabled,
      wifiHardware: !!p.WirelessHardwareEnabled,
      primaryType: '',
      primaryName: '',
      wifi: null,
    };
    if (p.PrimaryConnection && p.PrimaryConnection !== '/') {
      const ac = await props(bus, NM, p.PrimaryConnection, `${NM}.Connection.Active`);
      if (ac) {
        out.primaryType = ac.Type === '802-11-wireless' ? 'wifi' : ac.Type === '802-3-ethernet' ? 'wired' : ac.Type;
        out.primaryName = ac.Id;
      }
    }
    const dev = await this.wifiDevice();
    if (dev && dev.activeAp && dev.activeAp !== '/') {
      const ap = await props(bus, NM, dev.activeAp, `${NM}.AccessPoint`);
      if (ap) out.wifi = { ssid: Buffer.from(ap.Ssid).toString(), strength: ap.Strength };
    }
    return out;
  }

  async wifiDevice() {
    const bus = systemBus();
    const nm = await this.nm();
    if (!nm) return null;
    const devices = await nm.GetDevices();
    for (const d of devices) {
      const dp = await props(bus, NM, d, `${NM}.Device`);
      if (dp && dp.DeviceType === 2) {
        const wp = await props(bus, NM, d, `${NM}.Device.Wireless`);
        return { path: d, iface: dp.Interface, activeAp: wp ? wp.ActiveAccessPoint : '/' };
      }
    }
    return null;
  }

  async wifiScan() {
    const bus = systemBus();
    const dev = await this.wifiDevice();
    if (!dev) return [];
    const wireless = await iface(bus, NM, dev.path, `${NM}.Device.Wireless`);
    try {
      await wireless.RequestScan({});
    } catch {
      /* rate-limited: use cached results */
    }
    const aps = await wireless.GetAllAccessPoints();
    const bySsid = new Map();
    for (const ap of aps) {
      const p = await props(bus, NM, ap, `${NM}.AccessPoint`);
      if (!p) continue;
      const ssid = Buffer.from(p.Ssid).toString();
      if (!ssid) continue;
      const secure = p.Flags !== 0 || p.WpaFlags !== 0 || p.RsnFlags !== 0;
      const entry = { ssid, strength: p.Strength, secure, path: ap, active: ap === dev.activeAp, enterprise: (p.RsnFlags & 0x200) !== 0 || (p.WpaFlags & 0x200) !== 0 };
      const prev = bySsid.get(ssid);
      if (!prev || entry.strength > prev.strength || entry.active) bySsid.set(ssid, entry);
    }
    return [...bySsid.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.strength - a.strength);
  }

  async setWifiEnabled(on) {
    const p = await iface(systemBus(), NM, '/org/freedesktop/NetworkManager', 'org.freedesktop.DBus.Properties');
    if (!p) throw new Error('NetworkManager not available');
    await p.Set(NM, 'WirelessEnabled', new Variant('b', !!on));
  }

  async wifiConnect(ssid, password) {
    const bus = systemBus();
    const nm = await this.nm();
    const dev = await this.wifiDevice();
    if (!nm || !dev) throw new Error('No Wi-Fi device');
    // Reuse an existing profile for this SSID when there is one.
    const settings = await iface(bus, NM, '/org/freedesktop/NetworkManager/Settings', `${NM}.Settings`);
    for (const conn of await settings.ListConnections()) {
      const c = await iface(bus, NM, conn, `${NM}.Settings.Connection`);
      const s = unwrap(await c.GetSettings());
      if (s['802-11-wireless'] && Buffer.from(s['802-11-wireless'].ssid || []).toString() === ssid && !password) {
        await nm.ActivateConnection(conn, dev.path, '/');
        return;
      }
    }
    const aps = await this.wifiScan();
    const ap = aps.find((a) => a.ssid === ssid);
    const connection = {
      connection: { id: new Variant('s', ssid), type: new Variant('s', '802-11-wireless') },
      '802-11-wireless': { ssid: new Variant('ay', Buffer.from(ssid)), mode: new Variant('s', 'infrastructure') },
    };
    if (ap && ap.secure) {
      if (!password) throw new Error('Password required');
      connection['802-11-wireless-security'] = { 'key-mgmt': new Variant('s', 'wpa-psk'), psk: new Variant('s', password) };
    }
    await nm.AddAndActivateConnection(connection, dev.path, ap ? ap.path : '/');
  }

  async wifiDisconnect() {
    const dev = await this.wifiDevice();
    if (!dev) return;
    const d = await iface(systemBus(), NM, dev.path, `${NM}.Device`);
    await d.Disconnect();
  }

  async watchNetwork() {
    const p = await iface(systemBus(), NM, '/org/freedesktop/NetworkManager', 'org.freedesktop.DBus.Properties');
    if (!p) return;
    p.on('PropertiesChanged', async () => this.emit('network', await this.network()));
  }

  /* ------------------------------------------------------------ bluetooth */

  async bluetooth() {
    const om = await iface(systemBus(), BLUEZ, '/', 'org.freedesktop.DBus.ObjectManager');
    if (!om) return { available: false, powered: false, devices: [] };
    const objects = unwrap(await om.GetManagedObjects());
    let adapter = null;
    const devices = [];
    for (const [p, ifaces] of Object.entries(objects)) {
      if (ifaces['org.bluez.Adapter1'] && !adapter) adapter = { path: p, ...ifaces['org.bluez.Adapter1'] };
      const d = ifaces['org.bluez.Device1'];
      if (d && (d.Paired || d.Connected)) devices.push({ path: p, name: d.Alias || d.Name || d.Address, connected: !!d.Connected, icon: d.Icon || '', battery: ifaces['org.bluez.Battery1']?.Percentage ?? null });
    }
    if (!adapter) return { available: false, powered: false, devices: [] };
    return { available: true, powered: !!adapter.Powered, adapter: adapter.path, name: adapter.Alias || adapter.Name, devices };
  }

  async setBluetoothPowered(on) {
    const bt = await this.bluetooth();
    if (!bt.available) throw new Error('No Bluetooth adapter');
    const p = await iface(systemBus(), BLUEZ, bt.adapter, 'org.freedesktop.DBus.Properties');
    await p.Set('org.bluez.Adapter1', 'Powered', new Variant('b', !!on));
  }

  async bluetoothDevice(devicePath, connect) {
    const d = await iface(systemBus(), BLUEZ, devicePath, 'org.bluez.Device1');
    if (!d) throw new Error('Device not found');
    return connect ? d.Connect() : d.Disconnect();
  }

  /* ---------------------------------------------------------------- audio */

  async volume() {
    if (inPath('wpctl')) {
      try {
        const out = await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
        const m = out.match(/Volume:\s*([\d.]+)/);
        if (m) return { available: true, level: Math.round(parseFloat(m[1]) * 100), muted: /MUTED/.test(out), backend: 'pipewire' };
      } catch {
        /* fall through */
      }
    }
    if (inPath('pactl')) {
      try {
        const vol = await run('pactl', ['get-sink-volume', '@DEFAULT_SINK@']);
        const mute = await run('pactl', ['get-sink-mute', '@DEFAULT_SINK@']);
        const m = vol.match(/(\d+)%/);
        if (m) return { available: true, level: Number(m[1]), muted: /yes/.test(mute), backend: 'pulseaudio' };
      } catch {
        /* none */
      }
    }
    return { available: false, level: 0, muted: false };
  }

  async setVolume(level) {
    const v = Math.max(0, Math.min(150, Math.round(level)));
    if (inPath('wpctl')) return run('wpctl', ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', `${v}%`]);
    if (inPath('pactl')) return run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${v}%`]);
    throw new Error('No audio control (wpctl/pactl) available');
  }

  async setMuted(muted) {
    if (inPath('wpctl')) return run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', muted ? '1' : '0']);
    if (inPath('pactl')) return run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0']);
    throw new Error('No audio control available');
  }

  /* ------------------------------------------------------------ backlight */

  backlightDevice() {
    const base = '/sys/class/backlight';
    let names = [];
    try {
      names = fs.readdirSync(base);
    } catch {
      return null;
    }
    // Prefer firmware/platform interfaces over raw ones.
    const ranked = names.sort((a, b) => rank(a) - rank(b));
    function rank(n) {
      const t = readSys(path.join(base, n, 'type'));
      return t === 'firmware' ? 0 : t === 'platform' ? 1 : 2;
    }
    return ranked[0] ? { name: ranked[0], dir: path.join(base, ranked[0]) } : null;
  }

  brightness() {
    const dev = this.backlightDevice();
    if (!dev) return { available: false, level: 100 };
    const max = Number(readSys(path.join(dev.dir, 'max_brightness'))) || 1;
    const cur = Number(readSys(path.join(dev.dir, 'brightness'))) || 0;
    return { available: true, level: Math.round((cur / max) * 100), device: dev.name };
  }

  async setBrightness(level) {
    const dev = this.backlightDevice();
    if (!dev) throw new Error('No backlight device');
    const max = Number(readSys(path.join(dev.dir, 'max_brightness'))) || 1;
    const value = Math.max(1, Math.round((Math.max(1, Math.min(100, level)) / 100) * max));
    const session = await iface(systemBus(), LOGIN1, '/org/freedesktop/login1/session/auto', 'org.freedesktop.login1.Session');
    if (session) return session.SetBrightness('backlight', dev.name, value);
    fs.writeFileSync(path.join(dev.dir, 'brightness'), String(value)); // works if udev grants write access
  }

  /* ---------------------------------------------------------------- media */

  async mediaPlayers() {
    const bus = sessionBus();
    const dbusIface = await iface(bus, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus');
    if (!dbusIface) return [];
    const names = (await dbusIface.ListNames()).filter((n) => n.startsWith('org.mpris.MediaPlayer2.'));
    const players = [];
    for (const name of names) {
      const p = await props(bus, name, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player');
      const root = await props(bus, name, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2');
      if (!p) continue;
      const md = p.Metadata || {};
      players.push({
        id: name,
        identity: root?.Identity || name.replace('org.mpris.MediaPlayer2.', ''),
        status: p.PlaybackStatus,
        title: md['xesam:title'] || '',
        artist: Array.isArray(md['xesam:artist']) ? md['xesam:artist'].join(', ') : md['xesam:artist'] || '',
        album: md['xesam:album'] || '',
        artUrl: md['mpris:artUrl'] || '',
        length: md['mpris:length'] ? Number(md['mpris:length']) / 1e6 : 0,
        canGoNext: !!p.CanGoNext,
        canGoPrevious: !!p.CanGoPrevious,
      });
    }
    // Most relevant first: playing, then paused.
    return players.sort((a, b) => (b.status === 'Playing') - (a.status === 'Playing'));
  }

  async mediaControl(action, playerId) {
    const players = await this.mediaPlayers();
    const target = playerId ? players.find((p) => p.id === playerId) : players[0];
    if (!target) return false;
    const player = await iface(sessionBus(), target.id, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player');
    const map = { playpause: 'PlayPause', next: 'Next', previous: 'Previous', stop: 'Stop', play: 'Play', pause: 'Pause' };
    if (!map[action]) return false;
    await player[map[action]]();
    return true;
  }

  /* -------------------------------------------------- notification server */

  async startNotificationServer() {
    const bus = sessionBus();
    if (!bus) return;
    const self = this;
    const { Interface } = dbus.interface;
    class Notifications extends Interface {
      GetCapabilities() {
        return ['body', 'actions', 'persistence', 'icon-static'];
      }
      Notify(appName, replacesId, appIcon, summary, body, actions, hints, expireTimeout) {
        const id = replacesId || self.nextNotificationId++;
        const n = { id, appName, appIcon, summary, body: stripMarkup(body), actions: pairs(actions), urgency: unwrap(hints)?.urgency ?? 1, time: Date.now(), expireTimeout };
        self.notifications.set(id, n);
        self.emit('notification', n);
        return id;
      }
      CloseNotification(id) {
        self.closeNotification(id, 3);
      }
      GetServerInformation() {
        return ['OPOS Shell', 'OPOS', '1.0.0', '1.2'];
      }
      NotificationClosed(id, reason) {
        return [id, reason];
      }
      ActionInvoked(id, key) {
        return [id, key];
      }
    }
    Notifications.configureMembers({
      methods: {
        GetCapabilities: { inSignature: '', outSignature: 'as' },
        Notify: { inSignature: 'susssasa{sv}i', outSignature: 'u' },
        CloseNotification: { inSignature: 'u', outSignature: '' },
        GetServerInformation: { inSignature: '', outSignature: 'ssss' },
      },
      signals: {
        NotificationClosed: { signature: 'uu' },
        ActionInvoked: { signature: 'us' },
      },
    });
    const reply = await withTimeout(bus.requestName('org.freedesktop.Notifications', 4));
    if (reply !== 1) {
      console.warn('[OPOS] another notification daemon is running; OPOS will not own org.freedesktop.Notifications');
      return;
    }
    this.notifyIface = new Notifications('org.freedesktop.Notifications');
    bus.export('/org/freedesktop/Notifications', this.notifyIface);
  }

  closeNotification(id, reason = 2) {
    if (!this.notifications.delete(id)) return;
    this.notifyIface?.NotificationClosed(id, reason);
    this.emit('notification-closed', id);
  }

  invokeNotificationAction(id, key) {
    this.notifyIface?.ActionInvoked(id, key);
    this.closeNotification(id, 2);
  }

  /* ----------------------------------------------------------------- info */

  info() {
    const rel = parseOsRelease();
    const cpus = os.cpus();
    return {
      os: rel.PRETTY_NAME || `${os.type()} ${os.release()}`,
      kernel: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      user: os.userInfo().username,
      cpu: cpus[0] ? cpus[0].model : 'Unknown',
      cores: cpus.length,
      memTotal: os.totalmem(),
      uptime: os.uptime(),
      session: process.env.XDG_SESSION_TYPE || '',
      desktop: process.env.XDG_CURRENT_DESKTOP || '',
    };
  }

  /* ------------------------------------------------------------ processes */

  processes() {
    const uid = process.getuid ? process.getuid() : -1;
    const ticks = 100; // USER_HZ on Linux
    const now = Date.now();
    const out = [];
    let entries = [];
    try {
      entries = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
    } catch {
      return [];
    }
    const seen = new Map();
    for (const pidStr of entries) {
      const pid = Number(pidStr);
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const close = stat.lastIndexOf(')');
        const comm = stat.slice(stat.indexOf('(') + 1, close);
        const f = stat.slice(close + 2).split(' ');
        const cpuTime = (Number(f[11]) + Number(f[12])) / ticks; // utime + stime (seconds)
        const rss = Number(f[21]) * 4096;
        const status = fs.statSync(`/proc/${pid}`);
        const prev = this.procPrev.get(pid);
        const cpu = prev ? Math.max(0, ((cpuTime - prev.cpuTime) / ((now - prev.t) / 1000)) * 100) : 0;
        seen.set(pid, { cpuTime, t: now });
        let cmd = '';
        try {
          cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
        } catch {
          /* gone */
        }
        out.push({ pid, name: comm, cmd: cmd || comm, cpu, rss, state: f[0], own: status.uid === uid });
      } catch {
        /* process exited */
      }
    }
    this.procPrev = seen;
    return out.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss);
  }

  kill(pid, signal = 'SIGTERM') {
    const st = fs.statSync(`/proc/${pid}`);
    if (process.getuid && st.uid !== process.getuid()) throw new Error('Not your process');
    if (pid === process.pid) throw new Error('Refusing to kill the shell');
    process.kill(pid, signal);
  }

  cpuUsage() {
    const cpus = os.cpus();
    const prev = this.cpuPrev || cpus;
    this.cpuPrev = cpus;
    const per = cpus.map((c, i) => {
      const p = prev[i] ? prev[i].times : c.times;
      const tot = (t) => t.user + t.nice + t.sys + t.idle + t.irq;
      const dt = tot(c.times) - tot(p);
      return dt > 0 ? (1 - (c.times.idle - p.idle) / dt) * 100 : 0;
    });
    return { total: per.reduce((a, b) => a + b, 0) / (per.length || 1), perCore: per };
  }
}

function readSys(p) {
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return '';
  }
}

function parseOsRelease() {
  const out = {};
  for (const f of ['/etc/os-release', '/usr/lib/os-release']) {
    try {
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
      }
      break;
    } catch {
      /* next */
    }
  }
  return out;
}

function stripMarkup(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function pairs(actions) {
  const out = [];
  for (let i = 0; i + 1 < actions.length; i += 2) out.push({ key: actions[i], label: actions[i + 1] });
  return out;
}

module.exports = { SystemServices };
