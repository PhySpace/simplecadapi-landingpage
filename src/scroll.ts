import { useSyncExternalStore } from 'react';

/** Chapters in page order; each is one scroll-pinned section with its own 3D stage. */
export const CHAPTERS = ['hero', 'code', 'select', 'verify', 'params', 'assembly', 'sim', 'compose', 'close'] as const;
export type ChapterId = (typeof CHAPTERS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChapterFrame {
  /** 0 when the section's top reaches the viewport top, 1 when its bottom reaches the bottom */
  progress: number;
  /** 0..1 presence: fades over the hand-off band between neighbouring chapters */
  visible: number;
  /** the chapter's 3D viewport box (css px, top-left origin), if it has one */
  rect: Rect | null;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const elements = new Map<ChapterId, HTMLElement>();
const viewports = new Map<ChapterId, HTMLElement>();
export const frames = Object.fromEntries(CHAPTERS.map((c) => [c, { progress: 0, visible: c === 'hero' ? 1 : 0, rect: null }])) as Record<
  ChapterId,
  ChapterFrame
>;

export const registerChapter = (id: ChapterId, el: HTMLElement | null) => {
  if (el) elements.set(id, el);
  else elements.delete(id);
};

/** the box a chapter's stage draws into */
export const registerViewport = (id: ChapterId, el: HTMLElement | null) => {
  if (el) viewports.set(id, el);
  else viewports.delete(id);
};

/** fraction of the viewport over which one chapter hands off to the next */
const BAND = 0.6;

const listeners = new Set<() => void>();
let version = 0;

/** Read every chapter's rect once; call once per animation frame. */
export const measure = () => {
  const vh = window.innerHeight;
  let changed = false;
  for (const id of CHAPTERS) {
    const el = elements.get(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const span = Math.max(1, r.height - vh);
    const progress = clamp01(-r.top / span);
    const enter = id === 'hero' ? 1 : clamp01((vh - r.top) / (BAND * vh));
    const exit = id === 'close' ? 1 : clamp01(r.bottom / (BAND * vh));
    const visible = Math.min(enter, exit);
    const f = frames[id];
    if (Math.abs(f.progress - progress) > 1e-4 || Math.abs(f.visible - visible) > 1e-4) changed = true;
    f.progress = progress;
    f.visible = visible;
    const vp = viewports.get(id);
    if (vp) {
      const b = vp.getBoundingClientRect();
      f.rect = { x: b.left, y: b.top, w: b.width, h: b.height };
    } else {
      f.rect = null;
    }
  }
  if (changed) {
    version++;
    listeners.forEach((l) => l());
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * A chapter's progress quantized to `steps` (re-renders only when the step changes).
 * Returns the step index 0..steps.
 */
export const useChapterStep = (id: ChapterId, steps: number) =>
  useSyncExternalStore(subscribe, () => Math.round(frames[id].progress * steps));

/** quantized visibility, for DOM fades */
export const useChapterVisible = (id: ChapterId, steps = 20) =>
  useSyncExternalStore(subscribe, () => Math.round(frames[id].visible * steps) / steps);

export const scrollVersion = () => version;
