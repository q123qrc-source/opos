/**
 * Strict 2D spatial navigation for TV mode.
 *
 * - Geometry based: candidates are scored by edge distance along the pressed direction plus a heavy
 *   penalty for orthogonal displacement. Tab order is never used (Tab is swallowed in TV mode).
 * - Scopes: the visible `[data-nav-scope]` with the highest `data-nav-priority` (ties: last in DOM)
 *   owns focus — so an open app, menu or dialog traps navigation automatically.
 * - Groups: `[data-nav-group]` rows remember their last focused child, so moving up/down between
 *   carousels returns to where you were.
 * - Capture: `data-nav-capture="horizontal|vertical|all"` lets a control (slider, text field) keep
 *   the arrows on that axis for itself.
 */
import { performBack } from '../lib/backStack';

export type Direction = 'up' | 'down' | 'left' | 'right';

const SELECTOR = [
  '[data-focusable]',
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="tab"]',
  '[role="option"]',
].join(',');

const BACK_KEYS = new Set(['Escape', 'BrowserBack', 'GoBack', 'XF86Back']);
const BACK_CODES = new Set([461, 10009]);

let current: HTMLElement | null = null;
const groupMemory = new Map<string, HTMLElement>();
const scopeMemory = new WeakMap<Element, HTMLElement>();

function isVisible(el: Element): boolean {
  const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (anyEl.checkVisibility && !anyEl.checkVisibility({ visibilityProperty: true, opacityProperty: false })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function activeScope(): Element {
  const scopes = Array.from(document.querySelectorAll('[data-nav-scope]')).filter(isVisible);
  if (!scopes.length) return document.body;
  let best = scopes[0];
  let bestP = Number(best.getAttribute('data-nav-priority') ?? 0);
  for (const s of scopes) {
    const p = Number(s.getAttribute('data-nav-priority') ?? 0);
    if (p >= bestP) {
      best = s;
      bestP = p;
    }
  }
  return best;
}

function focusables(scope: Element): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
    if (el.closest('[data-nav-skip]')) return false;
    // Ignore elements that belong to a nested scope other than this one.
    const owner = el.closest('[data-nav-scope]');
    if (owner && owner !== scope && scope.contains(owner)) return false;
    return isVisible(el);
  });
}

const groupOf = (el: Element) => el.closest('[data-nav-group]')?.getAttribute('data-nav-group') ?? null;

function setCurrent(el: HTMLElement | null, scroll = true) {
  if (current === el) return;
  current?.removeAttribute('data-tv-focus');
  current = el;
  if (!el) return;
  el.setAttribute('data-tv-focus', '');
  if (!el.matches('a[href],button,input,select,textarea,[tabindex]')) el.tabIndex = -1;
  el.focus({ preventScroll: true });
  const group = groupOf(el);
  if (group) groupMemory.set(group, el);
  const scope = el.closest('[data-nav-scope]');
  if (scope) scopeMemory.set(scope, el);
  if (scroll) {
    const smooth = !document.documentElement.classList.contains('reduce-motion');
    const tile = el.getAttribute('data-focusable') === 'tile';
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: tile ? 'center' : 'nearest', inline: tile ? 'center' : 'nearest' });
  }
}

/** Make sure something inside the active scope is focused. */
export function ensureFocus() {
  const scope = activeScope();
  if (current && current.isConnected && scope.contains(current) && isVisible(current)) return;
  const remembered = scopeMemory.get(scope);
  if (remembered && remembered.isConnected && isVisible(remembered)) return setCurrent(remembered);
  const list = focusables(scope);
  const auto = list.find((el) => el.hasAttribute('data-autofocus'));
  setCurrent(auto ?? list[0] ?? null);
}

export function focusElement(el: HTMLElement) {
  setCurrent(el);
}

export function move(dir: Direction): boolean {
  const scope = activeScope();
  if (!current || !current.isConnected || !scope.contains(current)) {
    ensureFocus();
    return true;
  }
  const cr = current.getBoundingClientRect();
  const cc = { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 };
  const horizontal = dir === 'left' || dir === 'right';

  type Cand = { el: HTMLElement; score: number };
  const cands: Cand[] = [];
  for (const el of focusables(scope)) {
    if (el === current || current.contains(el) || el.contains(current)) continue;
    const r = el.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    let primary: number;
    let eligible: boolean;
    switch (dir) {
      case 'right':
        eligible = c.x > cc.x + 1 && r.right > cr.right - 1;
        primary = r.left - cr.right;
        break;
      case 'left':
        eligible = c.x < cc.x - 1 && r.left < cr.left + 1;
        primary = cr.left - r.right;
        break;
      case 'down':
        eligible = c.y > cc.y + 1 && r.bottom > cr.bottom - 1;
        primary = r.top - cr.bottom;
        break;
      case 'up':
        eligible = c.y < cc.y - 1 && r.top < cr.top + 1;
        primary = cr.top - r.bottom;
        break;
    }
    if (!eligible) continue;
    primary = Math.max(0, primary);
    const [a1, a2, b1, b2] = horizontal ? [cr.top, cr.bottom, r.top, r.bottom] : [cr.left, cr.right, r.left, r.right];
    const gap = Math.max(0, Math.max(a1, b1) - Math.min(a2, b2)); // 0 when ranges overlap
    const centerOff = horizontal ? Math.abs(c.y - cc.y) : Math.abs(c.x - cc.x);
    cands.push({ el, score: primary + gap * 4 + centerOff * 0.35 });
  }
  if (!cands.length) return false;
  cands.sort((a, b) => a.score - b.score);
  let target = cands[0].el;

  // Group memory: when jumping into another row, resume at its last focused element.
  const fromGroup = groupOf(current);
  const toGroup = groupOf(target);
  if (toGroup && toGroup !== fromGroup && !horizontal) {
    const remembered = groupMemory.get(toGroup);
    if (remembered && remembered.isConnected && cands.some((c) => c.el === remembered)) target = remembered;
  }
  setCurrent(target);
  return true;
}

function isEditable(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color'].includes(type);
  }
  return false;
}

function captures(el: HTMLElement | null, dir: Direction): boolean {
  if (!el) return false;
  const horizontal = dir === 'left' || dir === 'right';
  if (el instanceof HTMLInputElement && el.type === 'range') return horizontal;
  if (isEditable(el)) return horizontal || el.tagName === 'TEXTAREA';
  if (el.tagName === 'SELECT') return !horizontal;
  const cap = el.closest('[data-nav-capture]')?.getAttribute('data-nav-capture');
  if (!cap) return false;
  return cap === 'all' || (cap === 'horizontal' && horizontal) || (cap === 'vertical' && !horizontal);
}

/** Global keydown handler while TV mode is active. Installed in the capture phase. */
export function handleTvKey(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  if (e.key === 'Tab') {
    e.preventDefault(); // no tab indexing in TV mode
    return;
  }
  const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key as 'ArrowUp'];
  const active = document.activeElement as HTMLElement | null;
  if (dir) {
    if (current && active && current !== active && current.contains(active) === false && isEditable(active)) setCurrent(null);
    if (captures(current ?? active, dir)) return;
    e.preventDefault();
    move(dir);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    if (!current || isEditable(current) || current.tagName === 'SELECT') return;
    e.preventDefault();
    current.click();
    return;
  }
  if (BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode) || (e.key === 'Backspace' && !isEditable(active))) {
    if (isEditable(active) && e.key === 'Escape') {
      active?.blur();
    }
    e.preventDefault();
    performBack();
  }
}

export function resetSpatial() {
  current?.removeAttribute('data-tv-focus');
  current = null;
}

export function currentFocus() {
  return current;
}
