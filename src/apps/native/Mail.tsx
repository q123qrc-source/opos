/** Email — three-pane client: folders, message list, reading pane, plus compose. */
import { useMemo, useState } from 'react';
import { Inbox, Send, FileEdit, Archive, Trash2, Star, Search, PenSquare, Reply, Forward, X, Paperclip, ChevronLeft, AlertOctagon } from 'lucide-react';
import type { AppProps } from '../../types';
import { usePersistentState, cx } from '../../lib/hooks';
import { useBackHandler } from '../../lib/backStack';
import { useOS } from '../../store/useOS';

type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';
interface Mail {
  id: string;
  folder: Folder;
  from: string;
  email: string;
  to: string;
  subject: string;
  body: string;
  at: number;
  read: boolean;
  starred: boolean;
  attachment?: string;
}

const hrs = (n: number) => Date.now() - n * 3600e3;
const SEED: Mail[] = [
  { id: 'm1', folder: 'inbox', from: 'OPOS Team', email: 'team@opos.dev', to: 'guest@opos.dev', subject: 'Welcome to OPOS 1.0 🎉', body: 'Hi there,\n\nThanks for trying OPOS — one shell for your TV, phone and desktop.\n\nA few things to try:\n• Press an arrow key three times to enter TV mode.\n• Touch the screen (or narrow the window) to switch to Mobile.\n• Right-click the desktop for options.\n\nEnjoy,\nThe OPOS Team', at: hrs(1), read: false, starred: true },
  { id: 'm2', folder: 'inbox', from: 'Ada Lovelace', email: 'ada@analytical.engine', to: 'guest@opos.dev', subject: 'Notes on the convergence engine', body: 'I reviewed the heuristics — mouse, touch and D-pad detection feel natural. One suggestion: lock the mode while a game controller is connected.\n\nAttached are my notes.\n\n— Ada', at: hrs(3), read: false, starred: false, attachment: 'engine-notes.pdf' },
  { id: 'm3', folder: 'inbox', from: 'GitHub', email: 'noreply@github.com', to: 'guest@opos.dev', subject: '[opos] CI passed for main', body: 'All checks have passed.\n\n✓ typecheck\n✓ build\n✓ electron-builder (linux, win, mac)', at: hrs(7), read: true, starred: false },
  { id: 'm4', folder: 'inbox', from: 'Bitmovin', email: 'demo@bitmovin.com', to: 'guest@opos.dev', subject: 'Your DRM test results', body: 'Widevine L3 playback succeeded on your device. Encrypted Media Extensions are available.\n\nHappy streaming!', at: hrs(26), read: true, starred: false },
  { id: 'm5', folder: 'inbox', from: 'Grace Hopper', email: 'grace@navy.mil', to: 'guest@opos.dev', subject: 'Lunch on Friday?', body: 'It’s easier to ask forgiveness than it is to get permission — so I already booked a table. 12:30?', at: hrs(50), read: true, starred: true },
  { id: 'm6', folder: 'sent', from: 'Me', email: 'guest@opos.dev', to: 'ada@analytical.engine', subject: 'Re: Notes on the convergence engine', body: 'Great idea — adding a controller lock in the next build.', at: hrs(2), read: true, starred: false },
  { id: 'm7', folder: 'spam', from: 'Prince of Nowhere', email: 'win@lottery.biz', to: 'guest@opos.dev', subject: 'YOU HAVE WON 1,000,000 CREDITS', body: 'Click here to claim…', at: hrs(80), read: true, starred: false },
];

const FOLDERS: { id: Folder; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertOctagon },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

const when = (t: number) => (Date.now() - t < 86400e3 ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }));

export default function MailApp({ pid, mode }: AppProps) {
  const [mails, setMails] = usePersistentState<Mail[]>('mail', SEED);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [compose, setCompose] = useState<Partial<Mail> | null>(null);
  const notify = useOS((s) => s.notify);
  const narrow = mode !== 'desktop';

  useBackHandler(pid, () => {
    if (compose) return setCompose(null), true;
    if (openId) return setOpenId(null), true;
    return false;
  });

  const list = useMemo(
    () =>
      mails
        .filter((m) => (folder === 'starred' ? m.starred && m.folder !== 'trash' : m.folder === folder))
        .filter((m) => !query || `${m.from} ${m.subject} ${m.body}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.at - a.at),
    [mails, folder, query],
  );
  const open = mails.find((m) => m.id === openId);
  const update = (id: string, p: Partial<Mail>) => setMails((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const unread = (f: Folder) => mails.filter((m) => m.folder === f && !m.read).length;

  const send = () => {
    if (!compose?.to || !compose.subject) return;
    setMails((ms) => [{ id: `m${Date.now()}`, folder: 'sent', from: 'Me', email: 'guest@opos.dev', to: compose.to!, subject: compose.subject!, body: compose.body ?? '', at: Date.now(), read: true, starred: false }, ...ms]);
    setCompose(null);
    notify('Message sent', compose.subject, 'mail');
  };

  const folders = (
    <aside className={cx('flex shrink-0 flex-col gap-0.5 bg-[#0b0d14] p-3', narrow ? 'w-full' : 'w-52')}>
      <button onClick={() => setCompose({})} className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-os-accent py-2.5 text-sm font-semibold text-black hover:brightness-110">
        <PenSquare size={16} /> New mail
      </button>
      {FOLDERS.map((f) => (
        <button key={f.id} onClick={() => { setFolder(f.id); setOpenId(null); }} className={cx('flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px]', folder === f.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5')}>
          <f.icon size={15} /> <span className="flex-1 text-left">{f.label}</span>
          {unread(f.id) > 0 && <span className="rounded-full bg-os-accent/25 px-1.5 text-[11px] text-os-accent">{unread(f.id)}</span>}
        </button>
      ))}
    </aside>
  );

  const messageList = (
    <section className={cx('flex min-h-0 flex-col border-r border-white/5 bg-[#10121b]', narrow ? 'flex-1' : 'w-80 shrink-0')}>
      <div className="flex items-center gap-2 border-b border-white/5 p-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-white/[.06] px-3 py-1.5">
          <Search size={14} className="text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mail" className="w-full bg-transparent text-[13px] outline-none" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && <div className="py-16 text-center text-sm text-white/35">Nothing in {folder}</div>}
        {list.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setOpenId(m.id);
              update(m.id, { read: true });
            }}
            className={cx('flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left', openId === m.id ? 'bg-os-accent/15' : 'hover:bg-white/[.04]')}
          >
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', m.read ? 'bg-transparent' : 'bg-os-accent')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cx('truncate text-[13px]', m.read ? 'text-white/70' : 'font-semibold text-white')}>{folder === 'sent' ? `To: ${m.to}` : m.from}</span>
                <span className="shrink-0 text-[11px] text-white/40">{when(m.at)}</span>
              </div>
              <div className={cx('truncate text-[13px]', m.read ? 'text-white/60' : 'text-white')}>{m.subject}</div>
              <div className="truncate text-[12px] text-white/35">{m.body.split('\n')[0]}</div>
            </div>
            {m.starred && <Star size={13} className="mt-1 shrink-0 fill-amber-300 text-amber-300" />}
          </button>
        ))}
      </div>
    </section>
  );

  const reader = open ? (
    <article className="flex min-w-0 flex-1 animate-fade-in flex-col bg-[#0f111a]">
      <div className="flex items-center gap-1 border-b border-white/5 px-4 py-2">
        {narrow && (
          <button onClick={() => setOpenId(null)} className="mr-2 rounded p-1 hover:bg-white/10" aria-label="Back">
            <ChevronLeft size={18} />
          </button>
        )}
        <button onClick={() => setCompose({ to: open.email, subject: `Re: ${open.subject}`, body: `\n\n— On ${new Date(open.at).toLocaleString()}, ${open.from} wrote:\n> ${open.body.split('\n').join('\n> ')}` })} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] hover:bg-white/10">
          <Reply size={14} /> Reply
        </button>
        <button onClick={() => setCompose({ subject: `Fwd: ${open.subject}`, body: `\n\n---------- Forwarded message ----------\n${open.body}` })} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] hover:bg-white/10">
          <Forward size={14} /> Forward
        </button>
        <button onClick={() => { update(open.id, { folder: 'archive' }); setOpenId(null); }} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] hover:bg-white/10">
          <Archive size={14} /> Archive
        </button>
        <button onClick={() => { if (open.folder === 'trash') setMails((ms) => ms.filter((x) => x.id !== open.id)); else update(open.id, { folder: 'trash' }); setOpenId(null); }} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-red-300 hover:bg-red-500/15">
          <Trash2 size={14} /> Delete
        </button>
        <button onClick={() => update(open.id, { starred: !open.starred })} className="ml-auto rounded p-1 hover:bg-white/10" aria-label="Star">
          <Star size={16} className={open.starred ? 'fill-amber-300 text-amber-300' : 'text-white/50'} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <h1 className="text-xl font-semibold">{open.subject}</h1>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 font-semibold">{open.from[0]}</div>
          <div>
            <div className="text-[13px] font-medium">
              {open.from} <span className="text-white/40">&lt;{open.email}&gt;</span>
            </div>
            <div className="text-[12px] text-white/40">
              to {open.to} · {new Date(open.at).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="selectable mt-6 whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">{open.body}</div>
        {open.attachment && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-[13px]">
            <Paperclip size={14} /> {open.attachment}
          </div>
        )}
      </div>
    </article>
  ) : (
    <div className="grid flex-1 place-items-center bg-[#0f111a] text-sm text-white/30">Select a message to read</div>
  );

  return (
    <div className="relative flex h-full text-white">
      {narrow ? (open ? reader : <div className="flex min-w-0 flex-1 flex-col"><div className="no-scrollbar flex gap-1 overflow-x-auto bg-[#0b0d14] p-2">{FOLDERS.map((f) => <button key={f.id} onClick={() => setFolder(f.id)} className={cx('shrink-0 rounded-full px-3 py-1 text-xs', folder === f.id ? 'bg-os-accent text-black' : 'bg-white/10')}>{f.label}</button>)}</div>{messageList}<button onClick={() => setCompose({})} className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-2xl bg-os-accent text-black shadow-xl" aria-label="Compose"><PenSquare /></button></div>) : (
        <>
          {folders}
          {messageList}
          {reader}
        </>
      )}

      {compose && (
        <div className={cx('absolute z-10 flex flex-col overflow-hidden border border-white/10 bg-[#171a27] shadow-window', narrow ? 'inset-0' : 'bottom-4 right-4 h-[440px] w-[480px] animate-slide-up rounded-xl')}>
          <div className="flex items-center justify-between bg-[#1f2333] px-4 py-2 text-[13px] font-medium">
            New message
            <button onClick={() => setCompose(null)} aria-label="Discard">
              <X size={15} />
            </button>
          </div>
          <input autoFocus placeholder="To" value={compose.to ?? ''} onChange={(e) => setCompose({ ...compose, to: e.target.value })} className="border-b border-white/5 bg-transparent px-4 py-2 text-[13px] outline-none" />
          <input placeholder="Subject" value={compose.subject ?? ''} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} className="border-b border-white/5 bg-transparent px-4 py-2 text-[13px] outline-none" />
          <textarea value={compose.body ?? ''} onChange={(e) => setCompose({ ...compose, body: e.target.value })} className="flex-1 resize-none bg-transparent px-4 py-3 text-[13px] outline-none" />
          <div className="flex items-center gap-2 border-t border-white/5 px-4 py-2">
            <button onClick={send} disabled={!compose.to || !compose.subject} className="flex items-center gap-2 rounded-lg bg-os-accent px-4 py-1.5 text-[13px] font-semibold text-black disabled:opacity-40">
              <Send size={14} /> Send
            </button>
            <button
              onClick={() => {
                setMails((ms) => [{ id: `d${Date.now()}`, folder: 'drafts', from: 'Me', email: 'guest@opos.dev', to: compose.to ?? '', subject: compose.subject || '(no subject)', body: compose.body ?? '', at: Date.now(), read: true, starred: false }, ...ms]);
                setCompose(null);
              }}
              className="rounded-lg px-3 py-1.5 text-[13px] text-white/60 hover:bg-white/10"
            >
              Save draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
