/** Pseudo-terminals for the OPOS Terminal app (node-pty), one per terminal tab. */
const os = require('os');

let nodePty = null;
try {
  nodePty = require('node-pty');
} catch (e) {
  console.warn('[OPOS] node-pty unavailable — Terminal falls back to the built-in opsh:', e.message);
}

const ptys = new Map();
let seq = 0;

function available() {
  return !!nodePty;
}

function create(webContents, { cols = 80, rows = 24, cwd } = {}) {
  if (!nodePty) throw new Error('node-pty is not installed');
  const shell = process.env.SHELL || '/bin/bash';
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'OPOS' };
  for (const k of Object.keys(env)) if (/^(ELECTRON_|CHROME_)/.test(k)) delete env[k];
  const p = nodePty.spawn(shell, ['-l'], { name: 'xterm-256color', cols, rows, cwd: cwd || os.homedir(), env });
  const id = ++seq;
  ptys.set(id, { p, owner: webContents.id });
  p.onData((data) => !webContents.isDestroyed() && webContents.send('pty:data', id, data));
  p.onExit(({ exitCode }) => {
    ptys.delete(id);
    if (!webContents.isDestroyed()) webContents.send('pty:exit', id, exitCode);
  });
  webContents.once('destroyed', () => kill(id));
  return id;
}

function write(id, data) {
  ptys.get(id)?.p.write(data);
}

function resize(id, cols, rows) {
  try {
    ptys.get(id)?.p.resize(Math.max(2, cols), Math.max(2, rows));
  } catch {
    /* exited */
  }
}

function kill(id) {
  const entry = ptys.get(id);
  if (!entry) return;
  ptys.delete(id);
  try {
    entry.p.kill();
  } catch {
    /* already gone */
  }
}

module.exports = { available, create, write, resize, kill };
