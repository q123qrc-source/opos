/**
 * Shared shell state. In a session the shell is several windows (desktop, panels, overlays,
 * app windows); this main-process store is their single source of truth. Renderers send
 * patches and receive broadcasts. User preferences persist to ~/.config/opos/state.json.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const PERSISTED = ['settings', 'pinned', 'modeLock', 'mobileDock'];

class SharedState extends EventEmitter {
  constructor(initial) {
    super();
    const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opos');
    this.file = path.join(dir, 'state.json');
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      /* first run */
    }
    this.state = { ...initial, ...pick(saved, PERSISTED) };
    if (saved.settings) this.state.settings = { ...initial.settings, ...saved.settings };
    this.saveTimer = null;
  }

  get() {
    return this.state;
  }

  /** Merge a patch and broadcast it. `origin` is the webContents id that sent it (or 0 for main). */
  patch(p, origin = 0) {
    const changed = {};
    for (const [k, v] of Object.entries(p)) {
      if (JSON.stringify(this.state[k]) !== JSON.stringify(v)) {
        this.state[k] = v;
        changed[k] = v;
      }
    }
    if (!Object.keys(changed).length) return;
    this.emit('patch', changed, origin);
    if (Object.keys(changed).some((k) => PERSISTED.includes(k))) this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(pick(this.state, PERSISTED), null, 2));
      } catch (e) {
        console.warn('[OPOS] could not save state:', e.message);
      }
    }, 400);
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

module.exports = { SharedState };
