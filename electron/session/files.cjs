/**
 * Real filesystem access for OPOS apps (Files, Code Editor, Notes, Writer, Photo Editor).
 * Runs in the main process; the renderer reaches it only through the preload bridge.
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { inPath } = require('./apps.cjs');

const HOME = os.homedir();
const TEXT_LIMIT = 8 * 1024 * 1024;

function resolve(p) {
  if (!p || p === '~') return HOME;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return path.resolve(p);
}

async function list(dir, { hidden = false } = {}) {
  const abs = resolve(dir);
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!hidden && e.name.startsWith('.')) continue;
    const full = path.join(abs, e.name);
    try {
      const st = await fsp.stat(full); // follows symlinks
      out.push({ name: e.name, path: full, type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtimeMs, link: e.isSymbolicLink() });
    } catch {
      out.push({ name: e.name, path: full, type: 'file', size: 0, mtime: 0, link: true, broken: true });
    }
  }
  return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
}

async function stat(p) {
  const st = await fsp.stat(resolve(p));
  return { type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtimeMs };
}

async function readText(p) {
  const abs = resolve(p);
  const st = await fsp.stat(abs);
  if (st.size > TEXT_LIMIT) throw new Error(`File is too large to edit (${Math.round(st.size / 1048576)} MB)`);
  return fsp.readFile(abs, 'utf8');
}

async function readDataUrl(p) {
  const abs = resolve(p);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[ext];
  if (!mime) throw new Error('Not an image');
  return `data:${mime};base64,${(await fsp.readFile(abs)).toString('base64')}`;
}

async function writeText(p, content) {
  const abs = resolve(p);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  // Atomic replace: write a sibling temp file then rename over the target.
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.opos-tmp-${process.pid}`);
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, abs);
}

async function writeDataUrl(p, dataUrl) {
  const m = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  const abs = resolve(p);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, Buffer.from(m[1], 'base64'));
}

async function mkdir(p) {
  await fsp.mkdir(resolve(p), { recursive: true });
}

async function rename(from, to) {
  const dst = resolve(to);
  if (fs.existsSync(dst)) throw new Error(`${path.basename(dst)} already exists`);
  await fsp.rename(resolve(from), dst);
}

async function copy(from, to) {
  await fsp.cp(resolve(from), resolve(to), { recursive: true, errorOnExist: true, force: false });
}

/** Move to the freedesktop.org Trash (gio if present, otherwise the spec's home trash). */
async function trash(p) {
  const abs = resolve(p);
  if (inPath('gio')) {
    await new Promise((res, rej) => {
      const c = spawn('gio', ['trash', abs]);
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error('gio trash failed'))));
      c.on('error', rej);
    });
    return;
  }
  const trashDir = path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local/share'), 'Trash');
  await fsp.mkdir(path.join(trashDir, 'files'), { recursive: true });
  await fsp.mkdir(path.join(trashDir, 'info'), { recursive: true });
  let name = path.basename(abs);
  let i = 1;
  while (fs.existsSync(path.join(trashDir, 'files', name))) name = `${path.basename(abs)}.${i++}`;
  await fsp.writeFile(path.join(trashDir, 'info', `${name}.trashinfo`), `[Trash Info]\nPath=${encodeURI(abs)}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
  await fsp.rename(abs, path.join(trashDir, 'files', name));
}

function places() {
  const xdg = readUserDirs();
  const mk = (label, p, icon) => ({ label, path: p, icon, exists: fs.existsSync(p) });
  return [
    mk('Home', HOME, 'home'),
    mk('Desktop', xdg.DESKTOP || path.join(HOME, 'Desktop'), 'desktop'),
    mk('Documents', xdg.DOCUMENTS || path.join(HOME, 'Documents'), 'documents'),
    mk('Downloads', xdg.DOWNLOAD || path.join(HOME, 'Downloads'), 'downloads'),
    mk('Pictures', xdg.PICTURES || path.join(HOME, 'Pictures'), 'pictures'),
    mk('Music', xdg.MUSIC || path.join(HOME, 'Music'), 'music'),
    mk('Videos', xdg.VIDEOS || path.join(HOME, 'Videos'), 'videos'),
    mk('Trash', path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local/share'), 'Trash/files'), 'trash'),
    mk('Computer', '/', 'drive'),
  ].filter((p) => p.exists);
}

function readUserDirs() {
  const out = {};
  try {
    const txt = fs.readFileSync(path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'user-dirs.dirs'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^XDG_([A-Z]+)_DIR="(.*)"$/);
      if (m) out[m[1]] = m[2].replace('$HOME', HOME);
    }
  } catch {
    /* defaults */
  }
  return out;
}

module.exports = { list, stat, readText, readDataUrl, writeText, writeDataUrl, mkdir, rename, copy, trash, places, resolve, HOME };
