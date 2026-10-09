/** Terminal — "opsh", a functional shell emulator over the OPOS VFS and process table. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppProps } from '../../types';
import { HOME, basename, dirname, fs, listDir, resolvePath, useFs } from '../../lib/vfs';
import { useOS } from '../../store/useOS';
import { APPS, getApp } from '../../apps/manifest';
import { bridge, isElectron } from '../../lib/bridge';
import { openFile } from '../../lib/openFile';

type Line = { id: number; content: ReactNode };
let lineId = 0;

const C = {
  green: 'text-emerald-400',
  blue: 'text-sky-400',
  cyan: 'text-cyan-300',
  yellow: 'text-amber-300',
  red: 'text-red-400',
  dim: 'text-white/45',
  magenta: 'text-fuchsia-400',
};

const COMMANDS = ['help', 'ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'tree', 'grep', 'wc', 'head', 'clear', 'date', 'whoami', 'uname', 'neofetch', 'history', 'open', 'apps', 'ps', 'kill', 'mode', 'sysinfo', 'expr', 'exit'];

const shortPath = (p: string) => (p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p);

export default function Terminal({ pid, params }: AppProps) {
  const [cwd, setCwd] = useState<string>((params?.cwd as string) ?? HOME);
  const [lines, setLines] = useState<Line[]>(() => banner());
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cwdRef = useRef(cwd);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView(), [lines]);

  const print = (...content: ReactNode[]) => setLines((l) => [...l, ...content.map((c) => ({ id: ++lineId, content: c }))]);
  const err = (msg: string) => print(<span className={C.red}>{msg}</span>);

  const prompt = (dir: string) => (
    <span>
      <span className={C.green}>guest@opos</span>
      <span className="text-white/60">:</span>
      <span className={C.blue}>{shortPath(dir)}</span>
      <span className="text-white/60">$ </span>
    </span>
  );

  /** Runs a full input line: echoes it, then executes `a && b ; c` sequentially. */
  const submit = async (raw: string) => {
    print(
      <span>
        {prompt(cwdRef.current)}
        {raw}
      </span>,
    );
    if (raw.trim()) setHistory((h) => [...h, raw.trim()].slice(-200));
    for (const part of raw.split(/\s*(?:&&|;)\s*/)) await run(part);
  };

  const run = async (raw: string) => {
    const cwd = cwdRef.current;
    const trimmed = raw.trim();
    if (!trimmed) return;

    // Output redirection: cmd > file / cmd >> file
    const redirect = trimmed.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
    const commandLine = redirect ? redirect[1] : trimmed;
    const args = tokenize(commandLine);
    const [cmd, ...rest] = args;
    const out: string[] = [];
    const emit = (s: string) => (redirect ? out.push(s) : print(s));
    const vfs = useFs.getState();
    const os = useOS.getState();

    switch (cmd) {
      case 'help':
        print(
          <div className="grid grid-cols-[8rem_1fr] gap-x-4">
            {[
              ['ls [-l] [dir]', 'list directory'],
              ['cd <dir>', 'change directory'],
              ['cat <file>', 'print file'],
              ['echo <text> [> f]', 'print / write text'],
              ['mkdir/touch/rm/mv/cp', 'manage files (rm -r for dirs)'],
              ['tree [dir]', 'directory tree'],
              ['grep <pat> <file>', 'search in file'],
              ['open <app|file>', 'launch an app or open a file'],
              ['apps / ps / kill', 'list apps, processes, close one'],
              ['mode <tv|mobile|desktop|auto>', 'switch environment'],
              ['sysinfo', 'live system telemetry'],
              ['neofetch', 'system summary'],
              ['expr <math>', 'evaluate arithmetic'],
            ].map(([a, b]) => (
              <div key={a} className="contents">
                <span className={C.cyan}>{a}</span>
                <span className={C.dim}>{b}</span>
              </div>
            ))}
          </div>,
        );
        break;
      case 'clear':
        setLines([]);
        break;
      case 'pwd':
        emit(cwd);
        break;
      case 'cd': {
        const target = resolvePath(cwd, rest[0] ?? '~');
        const node = fs.stat(target);
        if (!node) err(`cd: ${rest[0]}: No such file or directory`);
        else if (node.type !== 'dir') err(`cd: ${rest[0]}: Not a directory`);
        else {
          cwdRef.current = target;
          setCwd(target);
        }
        break;
      }
      case 'ls': {
        const long = rest.includes('-l') || rest.includes('-la');
        const target = resolvePath(cwd, rest.find((r) => !r.startsWith('-')) ?? '.');
        const node = fs.stat(target);
        if (!node) {
          err(`ls: cannot access '${rest[0]}': No such file or directory`);
          break;
        }
        const entries = node.type === 'dir' ? listDir(vfs.nodes, target) : [{ path: target, name: basename(target), node }];
        if (redirect) entries.forEach((e) => out.push(e.name));
        else if (long)
          print(
            ...entries.map((e) => (
              <span>
                <span className={C.dim}>{e.node.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'} guest guest </span>
                <span className={C.dim}>{String(e.node.content?.length ?? 4096).padStart(7)} {new Date(e.node.mtime).toLocaleDateString()} </span>
                <span className={e.node.type === 'dir' ? C.blue : ''}>{e.name}</span>
              </span>
            )),
          );
        else
          print(
            <div className="flex flex-wrap gap-x-6">
              {entries.map((e) => (
                <span key={e.path} className={e.node.type === 'dir' ? `${C.blue} font-semibold` : ''}>
                  {e.name}
                </span>
              ))}
            </div>,
          );
        break;
      }
      case 'cat':
      case 'head': {
        if (!rest.length) return err(`${cmd}: missing file operand`);
        for (const f of rest.filter((r) => !r.startsWith('-'))) {
          const node = fs.stat(resolvePath(cwd, f));
          if (!node) err(`${cmd}: ${f}: No such file or directory`);
          else if (node.type === 'dir') err(`${cmd}: ${f}: Is a directory`);
          else {
            const text = node.content ?? '';
            const content = text.startsWith('data:') ? `[binary image data, ${text.length} bytes]` : text;
            (cmd === 'head' ? content.split('\n').slice(0, 10) : content.split('\n')).forEach((l) => emit(l));
          }
        }
        break;
      }
      case 'echo':
        emit(rest.join(' '));
        break;
      case 'mkdir':
        rest.filter((r) => !r.startsWith('-')).forEach((d) => vfs.mkdir(resolvePath(cwd, d)));
        break;
      case 'touch':
        rest.forEach((f) => {
          const p = resolvePath(cwd, f);
          vfs.write(p, fs.read(p) ?? '');
        });
        break;
      case 'rm': {
        const recursive = rest.some((r) => /^-r|-rf|-fr$/.test(r));
        for (const f of rest.filter((r) => !r.startsWith('-'))) {
          const p = resolvePath(cwd, f);
          const node = fs.stat(p);
          if (!node) err(`rm: cannot remove '${f}': No such file or directory`);
          else if (node.type === 'dir' && !recursive) err(`rm: cannot remove '${f}': Is a directory`);
          else if (p === '/' || p === HOME) err(`rm: refusing to remove '${f}'`);
          else vfs.remove(p);
        }
        break;
      }
      case 'mv':
      case 'cp': {
        if (rest.length < 2) return err(`${cmd}: missing destination`);
        const src = resolvePath(cwd, rest[0]);
        let dst = resolvePath(cwd, rest[1]);
        const node = fs.stat(src);
        if (!node) return err(`${cmd}: cannot stat '${rest[0]}'`);
        if (fs.stat(dst)?.type === 'dir') dst = `${dst}/${basename(src)}`;
        if (cmd === 'mv') vfs.rename(src, dst);
        else if (node.type === 'file') vfs.write(dst, node.content ?? '');
        else err('cp: directories not supported (use mv)');
        break;
      }
      case 'tree': {
        const root = resolvePath(cwd, rest[0] ?? '.');
        const walk = (p: string, prefix: string): string[] =>
          listDir(vfs.nodes, p).flatMap((e, i, arr) => {
            const last = i === arr.length - 1;
            const line = `${prefix}${last ? '└── ' : '├── '}${e.name}`;
            return e.node.type === 'dir' ? [line, ...walk(e.path, prefix + (last ? '    ' : '│   '))] : [line];
          });
        emit(shortPath(root));
        walk(root, '').forEach((l) => emit(l));
        break;
      }
      case 'grep': {
        const [pat, file] = rest;
        const text = file ? fs.read(resolvePath(cwd, file)) : undefined;
        if (!pat || text === undefined) return err('usage: grep <pattern> <file>');
        const re = new RegExp(pat, 'i');
        text.split('\n').filter((l) => re.test(l)).forEach((l) => emit(l));
        break;
      }
      case 'wc': {
        const text = fs.read(resolvePath(cwd, rest[0] ?? ''));
        if (text === undefined) return err('wc: file not found');
        emit(`${text.split('\n').length} ${text.split(/\s+/).filter(Boolean).length} ${text.length} ${rest[0]}`);
        break;
      }
      case 'date':
        emit(new Date().toString());
        break;
      case 'whoami':
        emit(os.settings.userName.toLowerCase());
        break;
      case 'uname':
        emit(rest.includes('-a') ? `OPOS 1.0.0 opos-shell ${isElectron ? `electron-${bridge.versions.electron}` : 'web'} ${navigator.platform}` : 'OPOS');
        break;
      case 'history':
        history.forEach((h, i) => emit(`${String(i + 1).padStart(4)}  ${h}`));
        break;
      case 'apps':
        APPS.forEach((a) => emit(`${a.id.padEnd(14)} ${a.name.padEnd(18)} [${a.category}]`));
        break;
      case 'ps':
        emit('PID                              APP             STATE');
        os.processes.forEach((p) => emit(`${p.pid.padEnd(32)} ${p.appId.padEnd(15)} ${p.minimized ? 'minimized' : p.pid === os.focusedPid ? 'focused' : 'running'}`));
        break;
      case 'kill': {
        const target = os.processes.find((p) => p.pid === rest[0] || p.appId === rest[0]);
        if (!target) return err(`kill: (${rest[0]}) - No such process`);
        if (target.pid === pid) return err('kill: refusing to kill this terminal');
        os.close(target.pid);
        emit(`Killed ${target.pid}`);
        break;
      }
      case 'open': {
        const name = rest.join(' ');
        if (!name) return err('usage: open <app-id | file>');
        const app = getApp(name) ?? APPS.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (app) {
          os.launch(app.id);
          emit(`Launching ${app.name}…`);
          break;
        }
        const p = resolvePath(cwd, name);
        const node = fs.stat(p);
        if (!node) return err(`open: ${name}: no such app or file`);
        if (node.type === 'dir') os.launch('files', { path: p });
        else openFile(p);
        break;
      }
      case 'mode': {
        const m = rest[0];
        if (!m) {
          emit(`current: ${os.mode} (lock: ${os.modeLock})`);
          break;
        }
        if (!['tv', 'mobile', 'desktop', 'auto'].includes(m)) return err('usage: mode <tv|mobile|desktop|auto>');
        os.setModeLock(m as 'tv');
        emit(`Environment → ${m}`);
        break;
      }
      case 'sysinfo': {
        try {
          const s = await bridge.system.stats();
          emit(`CPU    ${s.cpuModel} — ${s.cpu.toFixed(1)}%`);
          emit(`Memory ${((s.memTotal - s.memFree) / 1073741824).toFixed(1)} / ${(s.memTotal / 1073741824).toFixed(1)} GiB`);
          emit(`Uptime ${(s.uptime / 3600).toFixed(1)} h · Load ${s.loadavg.map((l) => l.toFixed(2)).join(' ')}`);
          emit(`Host   ${s.hostname} · ${s.platform}`);
        } catch {
          emit(`CPU threads ${navigator.hardwareConcurrency} · (live telemetry requires Electron)`);
        }
        break;
      }
      case 'expr': {
        const expr = rest.join(' ');
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) return err('expr: only numbers and + - * / % ( ) are allowed');
        try {
          // Safe: the expression is validated to arithmetic characters only.
          emit(String(Function(`"use strict"; return (${expr})`)()));
        } catch {
          err('expr: syntax error');
        }
        break;
      }
      case 'neofetch':
        print(<Neofetch />);
        break;
      case 'exit':
        os.close(pid);
        break;
      default:
        err(`opsh: command not found: ${cmd}`);
    }

    if (redirect) {
      const target = resolvePath(cwd, redirect[3]);
      if (fs.stat(dirname(target))?.type !== 'dir') return err(`opsh: ${redirect[3]}: No such directory`);
      const prev = redirect[2] === '>>' ? fs.read(target) ?? '' : '';
      vfs.write(target, prev + out.join('\n') + '\n');
    }
  };

  const complete = () => {
    const parts = input.split(' ');
    const last = parts[parts.length - 1];
    let candidates: string[];
    if (parts.length === 1) candidates = COMMANDS.filter((c) => c.startsWith(last));
    else {
      const dir = last.includes('/') ? resolvePath(cwd, last.slice(0, last.lastIndexOf('/') + 1) || '/') : cwd;
      const prefix = last.includes('/') ? last.slice(last.lastIndexOf('/') + 1) : last;
      const base = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
      candidates = listDir(useFs.getState().nodes, dir)
        .filter((e) => e.name.startsWith(prefix))
        .map((e) => base + e.name + (e.node.type === 'dir' ? '/' : ''));
      if (parts[0] === 'open') candidates.push(...APPS.map((a) => a.id).filter((id) => id.startsWith(last)));
    }
    if (candidates.length === 1) setInput([...parts.slice(0, -1), candidates[0]].join(' '));
    else if (candidates.length > 1) print(<span className={C.dim}>{candidates.join('  ')}</span>);
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0c12] font-mono text-[13px] leading-relaxed text-white/90" onMouseUp={() => !window.getSelection()?.toString() && inputRef.current?.focus()}>
      <div className="selectable min-h-0 flex-1 overflow-y-auto p-3">
        {lines.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-words">
            {l.content}
          </div>
        ))}
        <form
          className="flex"
          onSubmit={(e) => {
            e.preventDefault();
            const v = input;
            setInput('');
            setHIdx(null);
            void submit(v);
          }}
        >
          {prompt(cwd)}
          <input
            ref={inputRef}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                complete();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!history.length) return;
                const i = hIdx === null ? history.length - 1 : Math.max(0, hIdx - 1);
                setHIdx(i);
                setInput(history[i]);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (hIdx === null) return;
                const i = hIdx + 1;
                if (i >= history.length) {
                  setHIdx(null);
                  setInput('');
                } else {
                  setHIdx(i);
                  setInput(history[i]);
                }
              } else if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                setLines([]);
              } else if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                print(<span>{prompt(cwd)}{input}^C</span>);
                setInput('');
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-white caret-cyan-300 outline-none"
          />
        </form>
        <div ref={endRef} />
      </div>
    </div>
  );
}

function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function banner(): Line[] {
  return [
    { id: ++lineId, content: <span className={C.cyan}>opsh 1.0 — OPOS shell. Type “help” to get started.</span> },
    { id: ++lineId, content: <span className={C.dim}>Tip: try “neofetch”, “tree ~/Projects”, “open music” or “mode tv”.</span> },
    { id: ++lineId, content: ' ' },
  ];
}

function Neofetch() {
  const s = useOS.getState();
  const logo = [
    '   ██████  ██████ ',
    '  ██    ██ ██   ██',
    '  ██    ██ ██████ ',
    '  ██    ██ ██     ',
    '   ██████  ██     ',
    '    O P O S  1.0  ',
  ];
  const info: [string, string][] = [
    ['OS', 'OPOS 1.0.0 “Convergence”'],
    ['Host', isElectron ? `Electron ${bridge.versions.electron}` : 'Web preview'],
    ['Kernel', `Chromium ${bridge.versions.chrome ?? navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '?'}`],
    ['Mode', `${s.mode} (${s.modeLock})`],
    ['Shell', 'opsh 1.0'],
    ['Resolution', `${window.screen.width}x${window.screen.height}`],
    ['Processes', String(s.processes.length)],
    ['CPU', `${navigator.hardwareConcurrency} threads`],
  ];
  return (
    <div className="flex gap-6 py-1">
      <pre className="text-os-accent">{logo.join('\n')}</pre>
      <div>
        <div>
          <span className={C.green}>guest</span>@<span className={C.green}>opos</span>
        </div>
        <div className={C.dim}>-----------</div>
        {info.map(([k, v]) => (
          <div key={k}>
            <span className={C.yellow}>{k}</span>: {v}
          </div>
        ))}
        <div className="mt-1 flex">
          {['bg-red-500', 'bg-amber-400', 'bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-fuchsia-500', 'bg-white'].map((c) => (
            <span key={c} className={`h-3 w-6 ${c}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
