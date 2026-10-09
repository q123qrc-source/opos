/** Photo Editor — canvas painting (brush, eraser, shapes, fill, text), filters, undo/redo; opens/saves images through fsapi. */
import { useEffect, useRef, useState } from 'react';
import { Brush, Eraser, Square, Circle, Minus, PaintBucket, Type, Undo2, Redo2, Trash2, Download, Upload, Save, Pipette, FolderOpen } from 'lucide-react';
import type { AppProps } from '../../types';
import { fsapi, basename, dirname, pathJoin, uniquePath } from '../../lib/fsapi';
import { ErrorBanner, FileDialog, errorText, useHome } from './shared/FileDialog';
import { useOS } from '../../store/useOS';
import { cx } from '../../lib/hooks';

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill' | 'text' | 'picker';
const PALETTE = ['#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#64748b'];
const FILTERS = [
  { label: 'Grayscale', f: 'grayscale(1)' },
  { label: 'Sepia', f: 'sepia(1)' },
  { label: 'Invert', f: 'invert(1)' },
  { label: 'Blur', f: 'blur(2px)' },
  { label: 'Brighten', f: 'brightness(1.2)' },
  { label: 'Contrast', f: 'contrast(1.4)' },
  { label: 'Saturate', f: 'saturate(1.8)' },
];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const pngName = (n: string) => (n.trim() || 'Untitled').replace(/[\\/]/g, '').replace(/\.(png|jpe?g|gif|webp|bmp|svg)$/i, '') + '.png';
const W = 1200;
const H = 800;

export default function PhotoEditor({ params, pid }: AppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#8b5cf6');
  const [size, setSize] = useState(8);
  const [filled, setFilled] = useState(false);
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const [, force] = useState(0);
  const [name, setName] = useState('Untitled.png');
  /** Where the image lives on disk: the PNG last saved, or the file it was opened from. */
  const [path, setPath] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'open' | 'save' | null>(null);
  const home = useHome();
  const notify = useOS((s) => s.notify);
  const setTitle = useOS((s) => s.setTitle);
  const pictures = home ? `${home}/Pictures` : '/';

  useEffect(() => {
    setTitle(pid, `${dirty ? '● ' : ''}${name} — Photo Editor`);
  }, [name, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!;

  const snapshot = () => {
    undo.current.push(ctx().getImageData(0, 0, W, H));
    if (undo.current.length > 40) undo.current.shift();
    redo.current = [];
    setDirty(true);
    force((n) => n + 1);
  };

  const loadImage = (src: string, onDone?: () => void) => {
    const img = new Image();
    img.onerror = () => setError('Could not decode the image');
    img.onload = () => {
      snapshot();
      const c = ctx();
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
      const s = Math.min(W / img.width, H / img.height);
      c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      onDone?.();
    };
    img.src = src;
  };

  useEffect(() => {
    const c = ctx();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    // A friendly starter composition.
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ede9fe');
    g.addColorStop(1, '#fce7f3');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#c4b5fd';
    c.beginPath();
    c.arc(900, 220, 120, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7c3aed';
    c.beginPath();
    c.moveTo(0, 800);
    c.lineTo(350, 420);
    c.lineTo(620, 640);
    c.lineTo(860, 380);
    c.lineTo(1200, 800);
    c.fill();
    c.font = 'bold 56px Inter, sans-serif';
    c.fillStyle = '#4c1d95';
    c.fillText('Paint something ✨', 70, 130);
  }, []);

  const openPath = async (p: string) => {
    setLoading(true);
    try {
      const data = await fsapi.readDataUrl(p);
      loadImage(data, () => {
        setName(pngName(basename(p)));
        setPath(p);
        setSavedPath(/\.png$/i.test(p) ? p : null);
        setDirty(false);
      });
    } catch (e) {
      setError(`Could not open ${basename(p)}: ${errorText(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const p = params?.path as string | undefined;
    if (p) openPath(p);
  }, [params?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const drawShape = (c: CanvasRenderingContext2D, t: Tool, a: { x: number; y: number }, b: { x: number; y: number }) => {
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = size;
    c.lineCap = 'round';
    c.beginPath();
    if (t === 'line') {
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    } else if (t === 'rect') {
      if (filled) c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      else c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (t === 'ellipse') {
      c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      if (filled) c.fill();
      else c.stroke();
    }
  };

  const floodFill = (x: number, y: number) => {
    const c = ctx();
    const img = c.getImageData(0, 0, W, H);
    const d = img.data;
    const idx = (Math.floor(y) * W + Math.floor(x)) * 4;
    const target = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
    const rgb = parseInt(color.slice(1), 16);
    const fill = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
    if (target.every((v, i) => Math.abs(v - fill[i]) < 2)) return;
    const match = (i: number) => Math.abs(d[i] - target[0]) < 32 && Math.abs(d[i + 1] - target[1]) < 32 && Math.abs(d[i + 2] - target[2]) < 32 && Math.abs(d[i + 3] - target[3]) < 32;
    const stack = [[Math.floor(x), Math.floor(y)]];
    while (stack.length) {
      const [px, py] = stack.pop()!;
      let cx0 = px;
      while (cx0 >= 0 && match((py * W + cx0) * 4)) cx0--;
      cx0++;
      let up = false;
      let down = false;
      while (cx0 < W && match((py * W + cx0) * 4)) {
        const i = (py * W + cx0) * 4;
        d[i] = fill[0];
        d[i + 1] = fill[1];
        d[i + 2] = fill[2];
        d[i + 3] = 255;
        if (py > 0 && match(((py - 1) * W + cx0) * 4)) {
          if (!up) stack.push([cx0, py - 1]);
          up = true;
        } else up = false;
        if (py < H - 1 && match(((py + 1) * W + cx0) * 4)) {
          if (!down) stack.push([cx0, py + 1]);
          down = true;
        } else down = false;
        cx0++;
      }
    }
    c.putImageData(img, 0, 0);
  };

  const onDown = (e: React.PointerEvent) => {
    const start = toCanvas(e);
    const c = ctx();
    if (tool === 'picker') {
      const [r, g, b] = c.getImageData(start.x, start.y, 1, 1).data;
      setColor(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
      setTool('brush');
      return;
    }
    snapshot();
    if (tool === 'fill') return floodFill(start.x, start.y);
    if (tool === 'text') {
      const text = window.prompt('Text', 'Hello OPOS');
      if (text) {
        c.fillStyle = color;
        c.font = `bold ${size * 4}px Inter, sans-serif`;
        c.fillText(text, start.x, start.y);
      }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    let last = start;
    const o = overlay.current!.getContext('2d')!;
    const move = (ev: PointerEvent) => {
      const r = canvas.current!.getBoundingClientRect();
      const p = { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
      if (tool === 'brush' || tool === 'eraser') {
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
        c.lineWidth = tool === 'eraser' ? size * 3 : size;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(last.x, last.y);
        c.lineTo(p.x, p.y);
        c.stroke();
        last = p;
      } else {
        o.clearRect(0, 0, W, H);
        drawShape(o, tool, start, p);
        last = p;
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (tool !== 'brush' && tool !== 'eraser') {
        o.clearRect(0, 0, W, H);
        drawShape(c, tool, start, last);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const applyFilter = (f: string) => {
    snapshot();
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const t = tmp.getContext('2d')!;
    t.filter = f;
    t.drawImage(canvas.current!, 0, 0);
    ctx().drawImage(tmp, 0, 0);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(ctx().getImageData(0, 0, W, H));
    ctx().putImageData(prev, 0, 0);
    force((n) => n + 1);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(ctx().getImageData(0, 0, W, H));
    ctx().putImageData(next, 0, 0);
    force((n) => n + 1);
  };

  const writePng = async (target: string) => {
    try {
      await fsapi.writeDataUrl(target, canvas.current!.toDataURL('image/png'));
      setPath(target);
      setSavedPath(target);
      setName(basename(target));
      setDirty(false);
      notify('Image saved', home && target.startsWith(home + '/') ? '~' + target.slice(home.length) : target, 'photo');
    } catch (e) {
      setError(`Could not save ${basename(target)}: ${errorText(e)}`);
    }
  };

  /** Save: overwrite the PNG we already own; otherwise write <name>.png next to the source (or a fresh name in ~/Pictures). */
  const save = async () => {
    const file = pngName(name);
    if (savedPath && basename(savedPath) === file) return writePng(savedPath);
    const dir = path ? dirname(path) : pictures;
    const target = savedPath || path ? pathJoin(dir, file) : await uniquePath(dir, file.replace(/\.png$/, ''), '.png');
    if (target !== savedPath && (await fsapi.exists(target)) && !window.confirm(`${basename(target)} already exists. Replace it?`)) return;
    writePng(target);
  };

  const tools: { id: Tool; icon: typeof Brush; label: string }[] = [
    { id: 'brush', icon: Brush, label: 'Brush (B)' },
    { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
    { id: 'line', icon: Minus, label: 'Line (L)' },
    { id: 'rect', icon: Square, label: 'Rectangle (R)' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse (O)' },
    { id: 'fill', icon: PaintBucket, label: 'Fill (G)' },
    { id: 'text', icon: Type, label: 'Text (T)' },
    { id: 'picker', icon: Pipette, label: 'Color picker (I)' },
  ];

  return (
    <div
      className="relative flex h-full flex-col bg-[#1a1b22] text-white"
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          return e.shiftKey ? setDialog('save') : void save();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
          e.preventDefault();
          return setDialog('open');
        }
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') return e.shiftKey ? doRedo() : doUndo();
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') return doRedo();
        const map: Record<string, Tool> = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', g: 'fill', t: 'text', i: 'picker' };
        if (map[e.key]) setTool(map[e.key]);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-[#22232d] px-3 py-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-40 rounded bg-white/10 px-2 py-1 text-[12px] outline-none" aria-label="File name" />
        <button onClick={doUndo} disabled={!undo.current.length} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Undo">
          <Undo2 size={16} />
        </button>
        <button onClick={doRedo} disabled={!redo.current.length} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Redo">
          <Redo2 size={16} />
        </button>
        <span className="h-5 w-px bg-white/10" />
        <span className="text-[11px] text-white/45">Size</span>
        <input type="range" min={1} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} className="os-range w-28" style={{ ['--pct' as string]: `${(size / 60) * 100}%` }} aria-label="Brush size" />
        <span className="w-6 text-[11px] tabular-nums text-white/60">{size}</span>
        <label className="flex items-center gap-1.5 text-[12px] text-white/70">
          <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} /> Fill shapes
        </label>
        <span className="h-5 w-px bg-white/10" />
        <select onChange={(e) => e.target.value && (applyFilter(e.target.value), (e.target.value = ''))} defaultValue="" className="rounded bg-white/10 px-2 py-1 text-[12px] outline-none" aria-label="Filters">
          <option value="" className="bg-[#22232d]">Filters…</option>
          {FILTERS.map((f) => (
            <option key={f.label} value={f.f} className="bg-[#22232d]">
              {f.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setDialog('open')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/10">
            <FolderOpen size={14} /> {loading ? 'Opening…' : 'Open'}
          </button>
          <label className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/10" title="Import an image from this device">
            <Upload size={14} /> Import
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () =>
                  loadImage(String(reader.result), () => {
                    setName(pngName(f.name));
                    setPath(null);
                    setSavedPath(null);
                  });
                e.target.value = '';
                reader.readAsDataURL(f);
              }}
            />
          </label>
          <button onClick={save} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/10" title={`Save (Ctrl+S)${savedPath ? ` — ${savedPath}` : ''}`}>
            <Save size={14} /> Save{dirty ? ' •' : ''}
          </button>
          <button onClick={() => setDialog('save')} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-white/10" title="Export as PNG (Ctrl+Shift+S)">
            <Download size={14} /> Export PNG
          </button>
          <button
            onClick={() => {
              snapshot();
              const c = ctx();
              c.fillStyle = '#fff';
              c.fillRect(0, 0, W, H);
            }}
            className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-red-300 hover:bg-red-500/15"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-[#22232d] py-2">
          {tools.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label} aria-label={t.label} className={cx('grid h-10 w-10 place-items-center rounded-lg', tool === t.id ? 'bg-os-accent text-black' : 'text-white/70 hover:bg-white/10')}>
              <t.icon size={18} />
            </button>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-1 px-1">
            {PALETTE.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={cx('h-5 w-5 rounded border border-white/20', color === c && 'ring-2 ring-os-accent')} style={{ background: c }} aria-label={`Color ${c}`} />
            ))}
          </div>
          <label className="mt-2 h-9 w-9 cursor-pointer overflow-hidden rounded-full border-2 border-white/40" style={{ background: color }} title="Custom color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="opacity-0" aria-label="Custom color" />
          </label>
        </div>
        <div className="grid min-w-0 flex-1 place-items-center overflow-auto bg-[repeating-conic-gradient(#2a2b35_0%_25%,#24252e_0%_50%)] bg-[length:20px_20px] p-6">
          <div className="relative w-full max-w-[1200px] shadow-2xl" style={{ aspectRatio: `${W}/${H}` }}>
            <canvas ref={canvas} width={W} height={H} className="absolute inset-0 h-full w-full touch-none bg-white" style={{ cursor: tool === 'picker' ? 'copy' : 'crosshair' }} onPointerDown={onDown} />
            <canvas ref={overlay} width={W} height={H} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
        </div>
      </div>
      {dialog && (
        <FileDialog
          mode={dialog}
          title={dialog === 'open' ? 'Open image' : 'Export as PNG'}
          initialDir={path ? dirname(path) : pictures}
          accept={dialog === 'open' ? IMAGE_EXT : ['png']}
          defaultName={dialog === 'save' ? pngName(name) : ''}
          onCancel={() => setDialog(null)}
          onConfirm={(p) => {
            const which = dialog;
            setDialog(null);
            if (which === 'open') openPath(p);
            else writePng(/\.png$/i.test(p) ? p : `${p}.png`);
          }}
        />
      )}
    </div>
  );
}
