/** Office Writer — rich-text word processor with a ribbon toolbar, saving .doc (HTML) files through fsapi (real FS in Electron, VFS in the browser). */
import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Heading1, Heading2, Quote, Undo2, Redo2, Save, FileDown, Printer, Link2, Highlighter, Eraser, FilePlus, FolderOpen } from 'lucide-react';
import type { AppProps } from '../../types';
import { fsapi, basename, dirname, pathJoin, uniquePath } from '../../lib/fsapi';
import { extname } from '../../lib/vfs';
import { ErrorBanner, FileDialog, errorText, useHome } from './shared/FileDialog';
import { useOS } from '../../store/useOS';
import { cx } from '../../lib/hooks';

const DEFAULT_DOC = `<h1>Quarterly Report</h1><p><i>OPOS Platform — Q4</i></p><p>OPOS unifies the <b>TV</b>, <b>mobile</b> and <b>desktop</b> experience into a single convergence shell. This quarter we shipped the window manager, spatial navigation and the Widevine-enabled app container.</p><h2>Highlights</h2><ul><li>28 apps in the registry</li><li>Remote-control emulation for WebOS &amp; Tizen apps</li><li>Instant environment switching</li></ul><blockquote>“One codebase, every screen.”</blockquote><p>Next quarter we will focus on multi-display support and OTA updates.</p>`;

const FONTS = ['Inter', 'Georgia', 'Times New Roman', 'Arial', 'Courier New', 'Verdana'];
const SIZES = [{ label: '10', v: '2' }, { label: '12', v: '3' }, { label: '14', v: '4' }, { label: '18', v: '5' }, { label: '24', v: '6' }, { label: '32', v: '7' }];

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
const DOC_EXT = ['doc', 'html', 'htm', 'txt'];
const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** .txt files are shown as paragraphs and saved back as plain text; everything else keeps the HTML document format. */
const isPlain = (p: string) => extname(p) === 'txt';
const fromText = (t: string) => t.split('\n').map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join('');
const stem = (p: string) => basename(p).replace(/\.(doc|html?|txt)$/i, '');

export default function Writer({ params, pid }: AppProps) {
  const editor = useRef<HTMLDivElement>(null);
  const home = useHome();
  const [path, setPath] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'open' | 'save' | 'export' | null>(null);
  const [words, setWords] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState(100);
  const notify = useOS((s) => s.notify);
  const setTitle = useOS((s) => s.setTitle);

  const docsDir = home ? `${home}/Documents` : '/';

  /** Load a document from disk into the editor. With a fallback, a missing file shows that content instead. */
  const load = async (p: string, fallback?: string) => {
    setLoading(true);
    try {
      let html: string;
      if (fallback !== undefined && !(await fsapi.exists(p))) html = fallback;
      else {
        const raw = await fsapi.readText(p);
        html = isPlain(p) ? fromText(raw) : raw;
      }
      if (editor.current) editor.current.innerHTML = html;
      setPath(p);
      setDirty(false);
      count();
    } catch (e) {
      setError(`Could not open ${basename(p)}: ${errorText(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!home) return;
    const p = params?.path as string | undefined;
    if (p) load(p);
    else load(`${home}/Documents/Quarterly Report.doc`, DEFAULT_DOC);
  }, [home, params?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (path) setNameDraft(stem(path));
    setTitle(pid, `${dirty ? '● ' : ''}${path ? basename(path) : 'Untitled'} — Office Writer`);
  }, [path, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const serialize = (p: string) => (isPlain(p) ? editor.current?.innerText ?? '' : editor.current?.innerHTML ?? '');

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

  const saveTo = async (target: string) => {
    try {
      await fsapi.writeText(target, serialize(target));
      setPath(target);
      setDirty(false);
      notify('Document saved', basename(target), 'writer');
    } catch (e) {
      setError(`Could not save ${basename(target)}: ${errorText(e)}`);
    }
  };
  const save = () => (path ? saveTo(path) : setDialog('save'));

  const exportHtml = async (target: string) => {
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(stem(target))}</title><body style="font-family:Georgia;max-width:720px;margin:40px auto">${editor.current?.innerHTML ?? ''}</body>`;
    try {
      await fsapi.writeText(target, html);
      notify('Exported', basename(target), 'writer');
    } catch (e) {
      setError(`Could not export ${basename(target)}: ${errorText(e)}`);
    }
  };

  const newDoc = async () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    try {
      const p = await uniquePath(docsDir, 'Untitled', '.doc');
      await fsapi.writeText(p, '<p></p>');
      await load(p);
    } catch (e) {
      setError(`Could not create document: ${errorText(e)}`);
    }
  };

  /** Rename the current file (or just retarget an unsaved one) when the title field is committed. */
  const commitName = async () => {
    if (!path) return;
    const name = nameDraft.replace(/[\\/]/g, '').trim() || 'Untitled';
    const next = pathJoin(dirname(path), `${name}.${extname(path) || 'doc'}`);
    if (next === path) return setNameDraft(stem(path));
    try {
      if (await fsapi.exists(next)) throw new Error(`${basename(next)} already exists`);
      if (await fsapi.exists(path)) await fsapi.rename(path, next);
      setPath(next);
    } catch (e) {
      setError(`Could not rename: ${errorText(e)}`);
      setNameDraft(stem(path));
    }
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
    <div className="relative flex h-full flex-col bg-[#e9ebef]">
      {/* Title / file bar */}
      <div className="flex items-center gap-3 bg-[#1d4ed8] px-4 py-1.5 text-white">
        <span className="text-[13px] font-semibold">Writer</span>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          title={path ?? ''}
          aria-label="Document name"
          className="w-64 rounded bg-white/10 px-2 py-0.5 text-[13px] outline-none focus:bg-white/20"
        />
        <span className="truncate text-[11px] text-white/70">
          {loading ? 'Loading…' : dirty ? 'Unsaved changes' : path ? `Saved to ${home && path.startsWith(home + '/') ? '~' + dirname(path).slice(home.length) : dirname(path)}` : ''}
        </span>
        <div className="ml-auto flex gap-1">
          <button onClick={newDoc} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <FilePlus size={14} /> New
          </button>
          <button onClick={() => setDialog('open')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <FolderOpen size={14} /> Open
          </button>
          <button onClick={save} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <Save size={14} /> Save
          </button>
          <button onClick={() => setDialog('save')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            Save as…
          </button>
          <button onClick={() => setDialog('export')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <FileDown size={14} /> Export
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/15">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />

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
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              if (e.shiftKey) setDialog('save');
              else save();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
              e.preventDefault();
              setDialog('open');
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
      {dialog && (
        <FileDialog
          mode={dialog === 'open' ? 'open' : 'save'}
          title={dialog === 'open' ? 'Open document' : dialog === 'export' ? 'Export as HTML' : 'Save document as'}
          initialDir={path ? dirname(path) : docsDir}
          accept={dialog === 'open' ? DOC_EXT : undefined}
          defaultName={dialog === 'open' ? '' : `${path ? stem(path) : 'Untitled'}.${dialog === 'export' ? 'html' : path ? extname(path) || 'doc' : 'doc'}`}
          onCancel={() => setDialog(null)}
          onConfirm={(p) => {
            const which = dialog;
            setDialog(null);
            if (which === 'open') {
              if (dirty && !window.confirm('Discard unsaved changes?')) return;
              load(p);
            } else if (which === 'export') exportHtml(p);
            else saveTo(p);
          }}
        />
      )}
    </div>
  );
}
