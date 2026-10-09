/**
 * Installed applications: XDG .desktop discovery, icon-theme resolution and launching.
 * Implements the parts of the Desktop Entry / Icon Theme specs a launcher needs.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const HOME = os.homedir();
const DESKTOP_NAME = 'OPOS';

function dataDirs() {
  const home = process.env.XDG_DATA_HOME || path.join(HOME, '.local/share');
  const dirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  const extra = [path.join(HOME, '.local/share/flatpak/exports/share'), '/var/lib/flatpak/exports/share'];
  return [...new Set([home, ...dirs, ...extra])];
}

/* ------------------------------------------------------------------ parsing */

function parseDesktopFile(text) {
  const groups = {};
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      current = groups[line.slice(1, -1)] = {};
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return groups;
}

function localeKeys() {
  const lang = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || 'C').split('.')[0];
  const [ll, cc] = lang.split('_');
  return [lang, ll && cc ? `${ll}_${cc}` : null, ll].filter(Boolean);
}

function localized(entry, key) {
  for (const l of localeKeys()) if (entry[`${key}[${l}]`]) return unescapeValue(entry[`${key}[${l}]`]);
  return entry[key] ? unescapeValue(entry[key]) : '';
}

function unescapeValue(v) {
  return v.replace(/\\s/g, ' ').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
}

const list = (v) => (v ? v.split(';').map((s) => s.trim()).filter(Boolean) : []);

function inPath(bin) {
  if (!bin) return false;
  if (bin.includes('/')) return fs.existsSync(bin);
  return (process.env.PATH || '/usr/bin:/bin').split(':').some((d) => {
    try {
      fs.accessSync(path.join(d, bin), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/** Tokenise an Exec value per the Desktop Entry spec (quoting + escapes). */
function splitExec(exec) {
  const args = [];
  let cur = '';
  let quoted = false;
  let had = false;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (quoted) {
      if (c === '\\' && i + 1 < exec.length && '"`$\\'.includes(exec[i + 1])) cur += exec[++i];
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
      had = true;
    } else if (c === ' ' || c === '\t') {
      if (cur || had) args.push(cur);
      cur = '';
      had = false;
    } else cur += c;
  }
  if (cur || had) args.push(cur);
  return args;
}

/** Expand field codes. `files`/`urls` are optional targets. */
function expandExec(app, targets = []) {
  const out = [];
  for (const arg of splitExec(app.exec)) {
    if (arg === '%f' || arg === '%u') {
      if (targets[0]) out.push(targets[0]);
    } else if (arg === '%F' || arg === '%U') out.push(...targets);
    else if (arg === '%i') {
      if (app.iconName) out.push('--icon', app.iconName);
    } else if (/%[dDnNvm]/.test(arg)) {
      /* deprecated codes: drop */
    } else {
      out.push(arg.replace(/%c/g, app.name).replace(/%k/g, app.file).replace(/%%/g, '%'));
    }
  }
  return out;
}

/* -------------------------------------------------------------------- icons */

const ICON_EXT = ['.svg', '.png'];
let iconIndex = null;

function iconThemes() {
  const preferred = process.env.OPOS_ICON_THEME;
  return [...new Set([preferred, 'breeze-dark', 'breeze', 'Papirus-Dark', 'Papirus', 'Adwaita', 'hicolor'].filter(Boolean))];
}

/** Score an icon directory: scalable best, then larger raster sizes (up to 256). */
function dirScore(dir) {
  if (/scalable/.test(dir)) return 1000;
  const m = dir.match(/(\d+)x\d+(?:@(\d)x)?/) || dir.match(/\/(\d+)\//);
  if (!m) return 1;
  const size = Number(m[1]) * (m[2] ? Number(m[2]) : 1);
  return size > 256 ? 300 - size / 100 : size;
}

function buildIconIndex() {
  const index = new Map(); // name -> {path, score, rank}
  const themes = iconThemes();
  const walk = (dir, rank, depth = 0) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() || e.isSymbolicLink()) {
        if (depth < 4 && !/actions|emblems|status|emotes|animations|mimetypes|places|devices|categories|stock|intl/.test(e.name)) {
          if (e.isDirectory() || safeIsDir(full)) walk(full, rank, depth + 1);
        }
        continue;
      }
      const ext = path.extname(e.name);
      if (!ICON_EXT.includes(ext)) continue;
      const name = e.name.slice(0, -ext.length);
      const score = dirScore(full);
      const prev = index.get(name);
      if (!prev || rank < prev.rank || (rank === prev.rank && score > prev.score)) index.set(name, { path: full, score, rank });
    }
  };
  themes.forEach((theme, rank) => {
    for (const d of dataDirs()) walk(path.join(d, 'icons', theme), rank);
    walk(path.join(HOME, '.icons', theme), rank);
  });
  for (const d of dataDirs()) walk(path.join(d, 'pixmaps'), themes.length);
  walk('/usr/share/pixmaps', themes.length);
  return index;
}

function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveIcon(name) {
  if (!name) return null;
  if (path.isAbsolute(name)) return fs.existsSync(name) && ICON_EXT.includes(path.extname(name)) ? name : null;
  if (!iconIndex) iconIndex = buildIconIndex();
  const hit = iconIndex.get(name) || iconIndex.get(name.toLowerCase());
  return hit ? hit.path : null;
}

/** Allowed roots for the opos-icon:// protocol. */
function iconRoots() {
  return [...dataDirs().flatMap((d) => [path.join(d, 'icons'), path.join(d, 'pixmaps')]), path.join(HOME, '.icons'), '/usr/share/pixmaps'];
}

/* ------------------------------------------------------------------ catalog */

class AppCatalog extends EventEmitter {
  constructor() {
    super();
    this.apps = [];
    this.watchers = [];
    this.rescanTimer = null;
  }

  scan() {
    const seen = new Map();
    for (const base of dataDirs()) {
      const dir = path.join(base, 'applications');
      this.collect(dir, dir, seen);
    }
    this.apps = [...seen.values()].filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    this.emit('changed', this.apps);
    return this.apps;
  }

  collect(root, dir, seen) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        this.collect(root, full, seen);
        continue;
      }
      if (!e.name.endsWith('.desktop')) continue;
      const id = path.relative(root, full).split(path.sep).join('-');
      if (seen.has(id)) continue; // earlier data dir wins (XDG precedence)
      seen.set(id, this.load(id, full));
    }
  }

  load(id, file) {
    let groups;
    try {
      groups = parseDesktopFile(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
    const e = groups['Desktop Entry'];
    if (!e || e.Type !== 'Application' || !e.Exec) return null;
    if (e.NoDisplay === 'true' || e.Hidden === 'true') return null;
    const only = list(e.OnlyShowIn);
    const not = list(e.NotShowIn);
    const current = (process.env.XDG_CURRENT_DESKTOP || DESKTOP_NAME).split(':');
    if (only.length && !only.some((d) => current.includes(d) || d === DESKTOP_NAME)) return null;
    if (not.some((d) => current.includes(d))) return null;
    if (e.TryExec && !inPath(e.TryExec)) return null;
    const iconPath = resolveIcon(e.Icon);
    return {
      id,
      file,
      name: localized(e, 'Name'),
      genericName: localized(e, 'GenericName'),
      comment: localized(e, 'Comment'),
      keywords: list(localized(e, 'Keywords')),
      categories: list(e.Categories),
      iconName: e.Icon || '',
      icon: iconPath ? `opos-icon://icon${encodeURI(iconPath)}` : null,
      exec: e.Exec,
      terminal: e.Terminal === 'true',
      wmClass: e.StartupWMClass || '',
      actions: list(e.Actions)
        .map((a) => groups[`Desktop Action ${a}`] && { id: a, name: localized(groups[`Desktop Action ${a}`], 'Name'), exec: groups[`Desktop Action ${a}`].Exec })
        .filter(Boolean),
    };
  }

  watch() {
    for (const base of dataDirs()) {
      const dir = path.join(base, 'applications');
      try {
        this.watchers.push(fs.watch(dir, () => this.scheduleRescan()));
      } catch {
        /* missing dir */
      }
    }
  }

  scheduleRescan() {
    clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      iconIndex = null;
      this.scan();
    }, 1500);
  }

  find(id) {
    return this.apps.find((a) => a.id === id);
  }

  /** Map a KWin window (desktopFile / resourceClass) to an installed app. */
  matchWindow(win) {
    const key = (s) => (s || '').toLowerCase().replace(/\.desktop$/, '');
    const df = key(win.desktopFile);
    const rc = key(win.resourceClass);
    const rn = key(win.resourceName);
    return (
      this.apps.find((a) => df && key(a.id) === df) ||
      this.apps.find((a) => df && key(a.id).endsWith(`.${df}`)) ||
      this.apps.find((a) => rc && key(a.wmClass) === rc) ||
      this.apps.find((a) => rc && key(a.id) === rc) ||
      this.apps.find((a) => rn && key(a.id) === rn) ||
      this.apps.find((a) => rc && key(a.id).split('.').pop() === rc) ||
      null
    );
  }

  launch(id, { action, targets = [] } = {}) {
    const app = this.find(id);
    if (!app) throw new Error(`Unknown app ${id}`);
    const exec = action ? app.actions.find((a) => a.id === action)?.exec : app.exec;
    if (!exec) throw new Error(`Unknown action ${action}`);
    let argv = expandExec({ ...app, exec }, targets);
    if (app.terminal) argv = [...terminalCommand(), ...argv];
    return spawnDetached(argv, app.id);
  }
}

/* ------------------------------------------------------------------ spawning */

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(ELECTRON_|CHROME_|GOOGLE_|ORIGINAL_XDG_CURRENT_DESKTOP|NODE_OPTIONS)/.test(k)) delete env[k];
  }
  return env;
}

let systemdRun = null;
function spawnDetached(argv, unitHint = 'app') {
  if (!argv.length) throw new Error('empty command');
  if (systemdRun === null) systemdRun = inPath('systemd-run') && hasUserManager();
  // Each app gets its own transient scope so it outlives (and is accounted separately from) the shell.
  const unit = `app-opos-${unitHint.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}-${Date.now().toString(36)}.scope`;
  const full = systemdRun ? ['systemd-run', '--user', '--scope', '--quiet', `--unit=${unit}`, '--', ...argv] : argv;
  const child = spawn(full[0], full.slice(1), { detached: true, stdio: 'ignore', env: cleanEnv(), cwd: HOME });
  child.on('error', (e) => console.warn('[OPOS] launch failed:', argv[0], e.message));
  child.on('exit', (code) => code && console.warn(`[OPOS] ${argv[0]} exited with code ${code}`));
  child.unref();
  console.log(`[OPOS] launched ${argv.join(' ')}${systemdRun ? ` (scope ${unit})` : ''}`);
  return child.pid;
}

/** A systemd user manager exposes its private socket under $XDG_RUNTIME_DIR. */
function hasUserManager() {
  const runtime = process.env.XDG_RUNTIME_DIR;
  return !!runtime && fs.existsSync(path.join(runtime, 'systemd', 'private'));
}

function terminalCommand() {
  const candidates = [
    ['foot'],
    ['konsole', '-e'],
    ['kgx', '--'],
    ['gnome-terminal', '--'],
    ['alacritty', '-e'],
    ['kitty'],
    ['xterm', '-e'],
  ];
  for (const c of candidates) if (inPath(c[0])) return c;
  return ['xterm', '-e'];
}

/** Open a file or URL with the user's default handler. */
function openExternal(target) {
  if (inPath('xdg-open')) return spawnDetached(['xdg-open', target], 'xdg-open');
  if (inPath('gio')) return spawnDetached(['gio', 'open', target], 'gio-open');
  throw new Error('No opener (xdg-open/gio) available');
}

module.exports = { AppCatalog, resolveIcon, iconRoots, spawnDetached, openExternal, splitExec, expandExec, parseDesktopFile, inPath };
