/** Social Feed — infinite, snap-scrolling vertical reels with generative visuals. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2, Plus } from 'lucide-react';
import type { AppProps } from '../../types';
import { cx } from '../../lib/hooks';

interface Post {
  id: number;
  user: string;
  caption: string;
  tags: string[];
  likes: number;
  comments: number;
  hue: number;
  shape: 'orbs' | 'waves' | 'grid' | 'rings';
  song: string;
}

const USERS = ['neon.nomad', 'pixel.paula', 'tv.dad', 'synthwave.sam', 'cloud.gamer', 'chef.kai', 'drone.dreams', 'opos.official', 'retro.rita', 'urban.lens'];
const CAPTIONS = [
  'POV: your OS changes when you pick up the remote',
  'This sunset filter is unreal 🌅',
  'Day 42 of building a convergence shell',
  'Rate my desk setup 1-10',
  'When the build finally passes ✅',
  'Late night coding vibes',
  'Couch gaming in the cloud, zero downloads',
  'Can’t stop watching this loop',
  'Who else uses three screens?',
  'Tiny details matter ✨',
];
const TAGS = ['opos', 'tech', 'setup', 'vibes', 'coding', 'gaming', 'design', 'tv', 'mobile', 'desktop'];
const SONGS = ['Neon Cascade — Vela Drift', 'Paper Lanterns — Moku', 'Chrome Highway — Night Coupe', 'Low Orbit — Halcyon Array'];
const SHAPES: Post['shape'][] = ['orbs', 'waves', 'grid', 'rings'];

function makePost(id: number): Post {
  const r = (n: number) => (id * 9301 + n * 49297) % 233280;
  return {
    id,
    user: USERS[r(1) % USERS.length],
    caption: CAPTIONS[r(2) % CAPTIONS.length],
    tags: [TAGS[r(3) % TAGS.length], TAGS[r(4) % TAGS.length]],
    likes: 100 + (r(5) % 98000),
    comments: 3 + (r(6) % 2400),
    hue: r(7) % 360,
    shape: SHAPES[r(8) % SHAPES.length],
    song: SONGS[r(9) % SONGS.length],
  };
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export default function SocialFeed(_: AppProps) {
  const [posts, setPosts] = useState(() => Array.from({ length: 6 }, (_, i) => makePost(i + 1)));
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<'following' | 'foryou'>('foryou');
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Infinite loading: append a batch whenever the sentinel nears the viewport.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPosts((p) => [...p, ...Array.from({ length: 5 }, (_, i) => makePost(p.length + i + 1))]);
      },
      { root: scroller.current, rootMargin: '200% 0px' },
    );
    if (sentinel.current) io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);

  const toggle = useCallback((set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  return (
    <div className="relative h-full bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center gap-6 pt-4 text-[15px] font-semibold [text-shadow:0_1px_4px_rgba(0,0,0,.8)]">
        {(['following', 'foryou'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('pb-1', tab === t ? 'border-b-2 border-white text-white' : 'text-white/60')}>
            {t === 'foryou' ? 'For You' : 'Following'}
          </button>
        ))}
      </div>
      <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto">
        {posts.map((p) => (
          <Reel key={p.id} post={p} liked={liked.has(p.id)} saved={saved.has(p.id)} onLike={() => toggle(setLiked, p.id)} onSave={() => toggle(setSaved, p.id)} />
        ))}
        <div ref={sentinel} className="h-px" />
      </div>
    </div>
  );
}

function Reel({ post, liked, saved, onLike, onSave }: { post: Post; liked: boolean; saved: boolean; onLike: () => void; onSave: () => void }) {
  const [burst, setBurst] = useState<{ x: number; y: number; k: number } | null>(null);
  const lastTap = useRef(0);
  return (
    <section
      className="relative h-full w-full snap-start overflow-hidden"
      onPointerUp={(e) => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          const r = e.currentTarget.getBoundingClientRect();
          setBurst({ x: e.clientX - r.left, y: e.clientY - r.top, k: now });
          if (!liked) onLike();
        }
        lastTap.current = now;
      }}
    >
      <Art post={post} />
      {burst && (
        <Heart key={burst.k} size={110} className="pointer-events-none absolute animate-pop-in fill-[#ff2d55] text-[#ff2d55] drop-shadow-2xl" style={{ left: burst.x - 55, top: burst.y - 55 }} onAnimationEnd={() => setTimeout(() => setBurst(null), 400)} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        <div className="relative mb-2">
          <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-white text-lg font-bold" style={{ background: `hsl(${post.hue} 70% 45%)` }}>
            {post.user[0].toUpperCase()}
          </div>
          <span className="absolute -bottom-2 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-[#ff2d55]">
            <Plus size={12} />
          </span>
        </div>
        <Action icon={<Heart size={30} className={cx('transition', liked ? 'scale-110 fill-[#ff2d55] text-[#ff2d55]' : '')} />} label={compact(post.likes + (liked ? 1 : 0))} onClick={onLike} />
        <Action icon={<MessageCircle size={28} />} label={compact(post.comments)} />
        <Action icon={<Bookmark size={28} className={saved ? 'fill-yellow-300 text-yellow-300' : ''} />} label={saved ? 'Saved' : 'Save'} onClick={onSave} />
        <Action icon={<Share2 size={26} />} label="Share" onClick={() => navigator.clipboard?.writeText(`https://opos.social/p/${post.id}`)} />
        <div className="mt-1 grid h-11 w-11 animate-[spin_5s_linear_infinite] place-items-center rounded-full border-[6px] border-[#222] bg-gradient-to-br from-zinc-600 to-black">
          <Music2 size={14} />
        </div>
      </div>
      <div className="absolute bottom-6 left-4 right-20">
        <div className="text-[15px] font-bold">@{post.user}</div>
        <div className="mt-1 text-[14px] leading-snug">
          {post.caption} {post.tags.map((t) => <span key={t} className="font-semibold">#{t} </span>)}
        </div>
        <div className="mt-2 flex items-center gap-2 overflow-hidden text-[13px]">
          <Music2 size={13} className="shrink-0" />
          <span className="whitespace-nowrap">{post.song}</span>
        </div>
      </div>
    </section>
  );
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerUp={(e) => e.stopPropagation()}
      className="flex flex-col items-center gap-1 drop-shadow-lg active:scale-90"
    >
      {icon}
      <span className="text-[12px] font-semibold">{label}</span>
    </button>
  );
}

/** Generative "video" art, animated with CSS. */
function Art({ post }: { post: Post }) {
  const h = post.hue;
  const bg = `linear-gradient(160deg, hsl(${h} 70% 25%), hsl(${(h + 60) % 360} 80% 12%))`;
  return (
    <div className="absolute inset-0" style={{ background: bg }}>
      {post.shape === 'orbs' &&
        Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full mix-blend-screen blur-2xl"
            style={{
              width: `${30 + i * 8}%`,
              aspectRatio: '1',
              left: `${(i * 37) % 80}%`,
              top: `${(i * 23) % 80}%`,
              background: `hsl(${(h + i * 40) % 360} 90% 60% / .55)`,
              animation: `float ${3 + i}s ease-in-out infinite`,
            }}
          />
        ))}
      {post.shape === 'waves' && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M0 ${40 + i * 8} Q 25 ${30 + i * 8} 50 ${40 + i * 8} T 100 ${40 + i * 8} V100 H0Z`} fill={`hsl(${(h + i * 18) % 360} 80% ${45 + i * 4}% / .35)`}>
              <animateTransform attributeName="transform" type="translate" values={`0 0; -6 ${i % 2 ? 2 : -2}; 0 0`} dur={`${4 + i}s`} repeatCount="indefinite" />
            </path>
          ))}
        </svg>
      )}
      {post.shape === 'grid' && (
        <div className="absolute inset-0 grid grid-cols-6 gap-2 p-6 opacity-80">
          {Array.from({ length: 48 }, (_, i) => (
            <div key={i} className="rounded-lg" style={{ background: `hsl(${(h + i * 7) % 360} 80% 55%)`, animation: `pulse-soft ${1.5 + (i % 5) * 0.4}s ease-in-out ${(i % 7) * 0.2}s infinite` }} />
          ))}
        </div>
      )}
      {post.shape === 'rings' && (
        <div className="absolute inset-0 grid place-items-center">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="absolute rounded-full border-[6px]" style={{ width: `${20 + i * 14}%`, aspectRatio: '1', borderColor: `hsl(${(h + i * 30) % 360} 85% 60% / .7)`, animation: `pulse-soft ${2 + i * 0.5}s ease-in-out infinite` }} />
          ))}
        </div>
      )}
    </div>
  );
}
