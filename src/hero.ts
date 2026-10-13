import type { ShowcaseProduct } from './data';
import { asset, fetchJson } from './net';

/**
 * The hero card. It shows pre-rendered loops of the SDK's finished products (public/hero/,
 * made from the same 3D scenes by `?capture`, see README), one still frame first and then the
 * loop, so the first picture is on screen before any 3D code has been downloaded. The chips and
 * the label read this store and drive it.
 */

/** hero/index.json: the showcase products plus the files of their loops */
export interface LoopInfo {
  poster: string;
  gif: string;
  /** one loop, seconds (how long the product stays before the next one) */
  seconds: number;
  width: number;
  height: number;
  bytes: number;
}
export type HeroProduct = ShowcaseProduct & LoopInfo;
interface HeroIndex {
  products: HeroProduct[];
}

export const showcase = {
  index: 0,
  products: [] as ShowcaseProduct[],
  /** products that can be shown (their loop is downloaded) */
  loaded: new Set<number>(),
  /** the still frame of the first product is ready */
  posterReady: false,
  listeners: new Set<() => void>(),
  version: 0,
  emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    showcase.listeners.add(l);
    return () => showcase.listeners.delete(l);
  },
  /** the 3D showcase stage (only used when capturing the loops) jumps on this */
  request: -1,
};

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const loops = () => showcase.products as HeroProduct[];

/** the file to show for product i: its loop once downloaded, until then its still frame */
export const heroSrc = (i: number) => {
  const p = loops()[i];
  if (!p) return '';
  return asset(`hero/${showcase.loaded.has(i) && !reducedMotion() ? p.gif : p.poster}`);
};

/** resolves when the first loop is on screen (or after a few seconds, or if it fails): the 3D engine starts then */
let settle: () => void = () => {};
export const heroSettled = new Promise<void>((resolve) => {
  settle = resolve;
});

const loadImage = (url: string, priority: 'high' | 'low') =>
  new Promise<void>((resolve, reject) => {
    const img = new Image();
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
    img.decoding = 'async';
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });

let timer = 0;
const show = (i: number) => {
  window.clearTimeout(timer);
  showcase.index = i;
  showcase.emit();
  const p = loops()[i];
  // one loop of this product, then the next one that is ready
  timer = window.setTimeout(next, Math.max(2, p?.seconds ?? 6) * 1000);
};
const next = () => {
  const n = showcase.products.length;
  for (let k = 1; k <= n; k++) {
    const j = (showcase.index + k) % n;
    if (showcase.loaded.has(j)) return show(j);
  }
};

/** a click on a chip */
export const jumpTo = (i: number) => {
  if (showcase.loaded.has(i) && i !== showcase.index) show(i);
};

let started = false;
export const startHero = () => {
  if (started) return;
  started = true;
  window.setTimeout(settle, 5000);
  void (async () => {
    try {
      const index = await fetchJson<HeroIndex>('hero/index.json', 'high');
      showcase.products = index.products;
      showcase.emit();
      const still = reducedMotion();
      const url = (i: number, name: 'poster' | 'gif') => asset(`hero/${index.products[i][name]}`);
      await loadImage(url(0, 'poster'), 'high');
      showcase.posterReady = true;
      showcase.emit();
      if (!still) await loadImage(url(0, 'gif'), 'high');
      showcase.loaded.add(0);
      show(0);
      settle();
      // the others behind it, smallest first, one at a time
      const rest = index.products
        .map((p, i) => ({ i, bytes: p.bytes }))
        .filter(({ i }) => i > 0)
        .sort((a, b) => a.bytes - b.bytes);
      for (const { i } of rest) {
        await loadImage(url(i, still ? 'poster' : 'gif'), 'low').catch(console.error);
        showcase.loaded.add(i);
        showcase.emit();
      }
    } catch (err) {
      console.error('hero failed to load', err);
      settle();
    }
  })();
};
