/**
 * Lazy D-Bus connections (dbus-next). Everything degrades to `null` when a bus is unavailable
 * (non-Linux hosts, containers without a system bus), so callers must handle null.
 */
const dbus = require('dbus-next');
const fs = require('fs');

/** dbus-next calls can hang forever on a dead connection; bound every lookup. */
function withTimeout(promise, ms = 3000) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => (t = setTimeout(() => rej(new Error('D-Bus timeout')), ms)))]).finally(() => clearTimeout(t));
}

let session = null;
let system = null;

function sessionBus() {
  if (session !== null) return session || null;
  try {
    if (!process.env.DBUS_SESSION_BUS_ADDRESS && !process.env.XDG_RUNTIME_DIR) throw new Error('no session bus');
    session = dbus.sessionBus();
    session.on('error', (e) => console.warn('[OPOS] session bus error:', e.message));
  } catch (e) {
    console.warn('[OPOS] session bus unavailable:', e.message);
    session = false;
  }
  return session || null;
}

function systemBus() {
  if (system !== null) return system || null;
  try {
    const addr = process.env.DBUS_SYSTEM_BUS_ADDRESS;
    if (!addr && !fs.existsSync('/run/dbus/system_bus_socket') && !fs.existsSync('/var/run/dbus/system_bus_socket')) throw new Error('no system bus socket');
    system = dbus.systemBus();
    system.on('error', (e) => console.warn('[OPOS] system bus error:', e.message));
  } catch (e) {
    console.warn('[OPOS] system bus unavailable:', e.message);
    system = false;
  }
  return system || null;
}

/** Get an interface proxy, or null if the service/object is missing. */
async function iface(bus, service, path, name) {
  if (!bus) return null;
  try {
    const obj = await withTimeout(bus.getProxyObject(service, path));
    return obj.getInterface(name);
  } catch {
    return null;
  }
}

async function props(bus, service, path, name) {
  const p = await iface(bus, service, path, 'org.freedesktop.DBus.Properties');
  if (!p) return null;
  try {
    const all = await withTimeout(p.GetAll(name));
    return unwrap(all);
  } catch {
    return null;
  }
}

/** Recursively unwrap dbus-next Variants into plain JS values. */
function unwrap(v) {
  if (v instanceof dbus.Variant) return unwrap(v.value);
  if (Array.isArray(v)) return v.map(unwrap);
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = unwrap(val);
    return out;
  }
  return v;
}

module.exports = { dbus, sessionBus, systemBus, iface, props, unwrap, withTimeout, Variant: dbus.Variant };
