/** Office Writer — rich-text word processor with a ribbon toolbar, saving .doc files to the VFS. */
import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Heading1, Heading2, Quote, Undo2, Redo2, Save, FileDown, Printer, Link2, Highlighter, Eraser, FilePlus } from 'lucide-react';
import type { AppProps } from '../../types';
import { HOME, basename, useFs } from '../../lib/vfs';
import { useOS } from '../../store/useOS';
import { cx } from '../../lib/hooks';

const DEFAULT_DOC = `<h1>Quarterly Report</h1><p><i>OPOS Platform — Q4</i></p><p>OPOS unifies the <b>TV</b>, <b>mobile</b> and <b>desktop</b> experience into a single convergence shell. This quarter we shipped the window manager, spatial navigation and the Widevine-enabled app container.</p><h2>Highlights</h2><ul><li>28 apps in the registry</li><li>Remote-control emulation for WebOS &amp; Tizen apps</li><li>Instant environment switching</li></ul><blockquote>“One codebase, every screen.”</blockquote><p>Next quarter we will focus on multi-display support and OTA updates.</p>`;

const FONTS = ['Inter', 'Georgia', 'Times New Roman', 'Arial', 'Courier New', 'Verdana'];
const SIZES = [{ label: '10', v: '2' }, { label: '12', v: '3' }, { label: '14', v: '4' }, { label: '18', v: '5' }, { label: '24', v: '6' }, { label: '32', v: '7' }];

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

export default function Writer({ params, pid }: AppProps) {
  const editor = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string>((params?.path as string) ?? `${HOME}/Documents/Quarterly Report.doc`);
  const [words, setWords] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState(100);
  const write = useFs((s) => s.write);
  const notify = useOS((s) => s.notify);
  const setTitle = useOS((s) => s.setTitle);

  useEffect(() => {
    const existing = useFs.getState().nodes[path]?.content;
    if (editor.current) editor.current.innerHTML = existing ?? DEFAULT_DOC;
    count();
    setDirty(false);
    setTitle(pid, `${basename(path)} — Office Writer`);
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (params?.path) setPath(params.path as string);
  }, [params?.path]);

  const count = () => {
    const text = editor.current?.innerText ?? '';
    setWords(text.trim() ? text.trim().split(/\s+/).length : 0);
  };

  const refreshState = () => {
    setState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      justifyFull: document.queryCommandState('justifyFull'),
    });
  };

  const save = () => {
    write(path, editor.current?.innerHTML ?? '');
    setDirty(false);
    notify('Document saved', basename(path), 'writer');
  };

  const exportHtml = () => {
    const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${basename(path)}</title><body style="font-family:Georgia;max-width:720px;margin:40px auto">${editor.current?.innerHTML ?? ''}</body>`], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = basename(path).replace(/\.doc$/, '') + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cmd = (c: string, v?: string) => () => {
    editor.current?.focus();
    exec(c, v);
    refreshState();
    setDirty(true);
  };

  const Btn = ({ icon: Icon, c, v, label, onClick }: { icon: typeof Bold; c?: string; v?: string; label: string; onClick?: () => void }) => (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick ?? (c ? cmd(c, v) : undefined)} title={label} aria-label={label} className={cx('grid h-8 w-8 place-items-center rounded-md transition', c && state[c] ? 'bg-sky-500/25 text-sky-200' : 'text-white/75 hover:bg-white/10')}>
      <Icon size={16} />
    </button>
  );
  const Sep = () => <span className="mx-1 h-6 w-px bg-white/10" />;

  return (
    <div className="flex h-full flex-col bg-[#e9ebef]">
      {/* Title / file bar */}
      <div className="flex items-center gap-3 bg-[#1d4ed8] px-4 py-1.5 text-white">
        <span className="text-[13px] font-semibold">Writer</span>
        <input
          value={basename(path).replace(/\.doc$/, '')}
          onChange={(e) => {
            const name = e.target.value.replace(/[\\/]/g, '') || 'Untitled';
            const next = `${HOME}/Documents/${name}.doc`;
            useFs.getState().rename(path, next);
            setPath(next);
          }}
          className="w-64 rounded bg-white/10 px-2 py-0.5 text-[13px] outline-none focus:bg-white/20"
        />
        <span className="text-[11px] text-white/70">{dirty ? 'Unsaved changes' : 'Saved to ~/Documents'}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => { const p = `${HOME}/Documents/Untitled ${new Date().toLocaleDateString().replace(/\//g, '-')} ${Date.now() % 1000}.doc`; write(p, '<p></p>'); setPath(p); }} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <FilePlus size={14} /> New
          </button>
          <button onClick={save} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <Save size={14} /> Save
          </button>
          <button onClick={exportHtml} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <FileDown size={14} /> Export
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Ribbon */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-black/20 bg-[#1b1e2a] px-3 py-1.5">
        <Btn icon={Undo2} c="undo" label="Undo" />
        <Btn icon={Redo2} c="redo" label="Redo" />
        <Sep />
        <select onMouseDown={(e) => e.stopPropagation()} onChange={(e) => cmd('fontName', e.target.value)()} className="h-8 rounded-md bg-white/10 px-2 text-[12px] text-white outline-none" defaultValue="Georgia" aria-label="Font">
          {FONTS.map((f) => (
            <option key={f} value={f} className="bg-[#1b1e2a]">
              {f}
            </option>
          ))}
        </select>
        <select onChange={(e) => cmd('fontSize', e.target.value)()} className="ml-1 h-8 rounded-md bg-white/10 px-2 text-[12px] text-white outline-none" defaultValue="3" aria-label="Font size">
          {SIZES.map((s) => (
            <option key={s.v} value={s.v} className="bg-[#1b1e2a]">
              {s.label}
            </option>
          ))}
        </select>
        <Sep />
        <Btn icon={Bold} c="bold" label="Bold (Ctrl+B)" />
        <Btn icon={Italic} c="italic" label="Italic (Ctrl+I)" />
        <Btn icon={Underline} c="underline" label="Underline (Ctrl+U)" />
        <Btn icon={Strikethrough} c="strikeThrough" label="Strikethrough" />
        <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-md text-white/75 hover:bg-white/10" title="Text color">
          <span className="text-[15px] font-bold underline decoration-red-400 decoration-[3px]">A</span>
          <input type="color" className="absolute inset-0 opacity-0" onChange={(e) => cmd('foreColor', e.target.value)()} aria-label="Text color" />
        </label>
        <Btn icon={Highlighter} label="Highlight" onClick={cmd('hiliteColor', '#fde047')} />
        <Btn icon={Eraser} c="removeFormat" label="Clear formatting" />
        <Sep />
        <Btn icon={Heading1} label="Heading 1" onClick={cmd('formatBlock', 'H1')} />
        <Btn icon={Heading2} label="Heading 2" onClick={cmd('formatBlock', 'H2')} />
        <Btn icon={Quote} label="Quote" onClick={cmd('formatBlock', 'BLOCKQUOTE')} />
        <Btn icon={List} c="insertUnorderedList" label="Bulleted list" />
        <Btn icon={ListOrdered} c="insertOrderedList" label="Numbered list" />
        <Sep />
        <Btn icon={AlignLeft} c="justifyLeft" label="Align left" />
        <Btn icon={AlignCenter} c="justifyCenter" label="Center" />
        <Btn icon={AlignRight} c="justifyRight" label="Align right" />
        <Btn icon={AlignJustify} c="justifyFull" label="Justify" />
        <Sep />
        <Btn
          icon={Link2}
          label="Insert link"
          onClick={() => {
            const url = window.prompt('Link URL', 'https://');
            if (url) cmd('createLink', url)();
          }}
        />
      </div>

      {/* Page */}
      <div className="min-h-0 flex-1 overflow-auto py-8">
        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={() => {
            setDirty(true);
            count();
          }}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              save();
            }
          }}
          className="doc-content selectable mx-auto min-h-[1056px] w-[816px] max-w-[calc(100%-2rem)] origin-top bg-white px-[72px] py-[72px] text-[15px] leading-relaxed text-slate-800 shadow-[0_2px_20px_rgba(0,0,0,.15)] outline-none"
          style={{ fontFamily: 'Georgia, serif', transform: `scale(${zoom / 100})` }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 bg-[#1b1e2a] px-4 py-1 text-[11px] text-white/60">
        <span>Page 1 of 1</span>
        <span>{words} words</span>
        <span>English (US)</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label="Zoom out">
            −
          </button>
          <span className="w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom((z) => Math.min(200, z + 10))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
