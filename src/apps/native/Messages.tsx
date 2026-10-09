/** Messages — iOS-style conversation list and chat bubbles with a typing auto-responder. */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Send, Search, SquarePen, Video, Phone } from 'lucide-react';
import type { AppProps } from '../../types';
import { usePersistentState, cx } from '../../lib/hooks';
import { useBackHandler } from '../../lib/backStack';
import { useOS } from '../../store/useOS';

interface Msg {
  from: 'me' | 'them';
  text: string;
  at: number;
}
interface Thread {
  id: string;
  name: string;
  color: string;
  messages: Msg[];
  unread?: boolean;
}

const h = (n: number) => Date.now() - n * 3600e3;
const SEED: Thread[] = [
  { id: 'ada', name: 'Ada Lovelace', color: '#f472b6', unread: true, messages: [
    { from: 'them', text: 'Did you try OPOS on the TV yet?', at: h(2) },
    { from: 'me', text: 'Yes! Pressed the arrows three times and it switched instantly 📺', at: h(1.9) },
    { from: 'them', text: 'Spatial navigation feels so smooth. Lunch tomorrow?', at: h(0.3) },
  ] },
  { id: 'grace', name: 'Grace Hopper', color: '#34d399', messages: [
    { from: 'them', text: 'Found a bug — a literal moth this time 🦋', at: h(26) },
    { from: 'me', text: 'Classic. Logging it now.', at: h(25) },
  ] },
  { id: 'team', name: 'OPOS Team', color: '#60a5fa', messages: [
    { from: 'them', text: 'Build 1.0.0 is green ✅', at: h(48) },
    { from: 'them', text: 'Widevine test passing on castLabs ECS.', at: h(47) },
  ] },
  { id: 'linus', name: 'Linus', color: '#fbbf24', messages: [{ from: 'them', text: 'Talk is cheap. Show me the code.', at: h(72) }] },
];

const REPLIES = ['Sounds great! 🙌', 'Haha, totally.', 'On my way.', 'Let me check and get back to you.', 'Love that idea 💡', 'Can you send the file?', '👍', 'That’s wild 😄'];

export default function Messages({ pid, mode }: AppProps) {
  const [threads, setThreads] = usePersistentState<Thread[]>('messages', SEED);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const notify = useOS((s) => s.notify);
  const open = threads.find((t) => t.id === openId);

  useBackHandler(pid, () => {
    if (openId) {
      setOpenId(null);
      return true;
    }
    return false;
  });

  const send = (id: string, text: string) => {
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { from: 'me', text, at: Date.now() }] } : t)));
    setTimeout(() => setTyping(id), 700);
    setTimeout(() => {
      setTyping(null);
      const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { from: 'them', text: reply, at: Date.now() }] } : t)));
      const thread = threads.find((t) => t.id === id);
      if (thread && openId !== id) notify(thread.name, reply, 'message');
    }, 2200 + Math.random() * 1500);
  };

  const wide = mode === 'desktop';

  const list = (
    <div className={cx('flex h-full flex-col bg-black', wide && 'w-80 shrink-0 border-r border-white/10')}>
      <div className="flex items-center justify-between px-4 pt-5">
        <span className="text-sm text-os-accent">Edit</span>
        <SquarePen size={20} className="text-os-accent" />
      </div>
      <h1 className="px-4 pb-2 pt-2 text-3xl font-bold text-white">Messages</h1>
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
        <Search size={15} className="text-white/40" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads
          .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at)
          .map((t) => {
            const last = t.messages[t.messages.length - 1];
            return (
              <button
                key={t.id}
                onClick={() => {
                  setOpenId(t.id);
                  setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, unread: false } : x)));
                }}
                className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left', openId === t.id ? 'bg-os-accent/20' : 'active:bg-white/10')}
              >
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', t.unread ? 'bg-[#0a84ff]' : 'bg-transparent')} />
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-black" style={{ background: t.color }}>
                  {t.name[0]}
                </div>
                <div className="min-w-0 flex-1 border-b border-white/10 pb-2.5">
                  <div className="flex justify-between">
                    <span className="font-semibold text-white">{t.name}</span>
                    <span className="text-xs text-white/40">{new Date(last.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div className="line-clamp-2 text-sm text-white/50">{typing === t.id ? 'typing…' : last.text}</div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );

  if (!wide && !open) return list;

  return (
    <div className="flex h-full bg-black">
      {wide && list}
      {open ? <Conversation thread={open} typing={typing === open.id} onSend={(t) => send(open.id, t)} onBack={wide ? undefined : () => setOpenId(null)} /> : <div className="grid flex-1 place-items-center text-white/40">Select a conversation</div>}
    </div>
  );
}

function Conversation({ thread, typing, onSend, onBack }: { thread: Thread; typing: boolean; onSend: (t: string) => void; onBack?: () => void }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [thread.messages.length, typing]);
  const submit = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };
  return (
    <div className="flex min-w-0 flex-1 animate-fade-in flex-col bg-black text-white">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#111]/90 px-2 py-2 backdrop-blur">
        {onBack && (
          <button onClick={onBack} className="text-os-accent" aria-label="Back">
            <ChevronLeft size={28} />
          </button>
        )}
        <div className="flex flex-1 flex-col items-center">
          <div className="grid h-9 w-9 place-items-center rounded-full font-semibold text-black" style={{ background: thread.color }}>
            {thread.name[0]}
          </div>
          <div className="text-[12px]">{thread.name}</div>
        </div>
        <Video size={22} className="text-os-accent" />
        <Phone size={20} className="mx-2 text-os-accent" />
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {thread.messages.map((m, i) => {
          const prev = thread.messages[i - 1];
          const showTime = !prev || m.at - prev.at > 3600e3;
          return (
            <div key={i}>
              {showTime && <div className="py-2 text-center text-[11px] text-white/40">{new Date(m.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
              <div className={cx('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                <div className={cx('selectable max-w-[75%] rounded-[1.2rem] px-3.5 py-2 text-[15px] leading-snug', m.from === 'me' ? 'rounded-br-md bg-[#0a84ff] text-white' : 'rounded-bl-md bg-[#26252a] text-white')}>{m.text}</div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex">
            <div className="flex gap-1 rounded-[1.2rem] rounded-bl-md bg-[#26252a] px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-white/50" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="iMessage" className="flex-1 rounded-full border border-white/15 bg-transparent px-4 py-2 text-[15px] outline-none" />
        <button type="submit" disabled={!draft.trim()} className="grid h-8 w-8 place-items-center rounded-full bg-[#0a84ff] disabled:opacity-30" aria-label="Send">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
