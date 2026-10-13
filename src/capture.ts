import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { Engine } from './gl/Engine';
import { LOOP_ASSEMBLY, LOOP_PART, ShowcaseStage, loopSeconds } from './gl/stages/showcase';
import type { HeroProduct } from './hero';
import { showcase } from './hero';
import { frames } from './scroll';
import { CELL } from './style/tokens';

/**
 * Makes public/hero/*: a loop (GIF) and a still frame for every product of the hero, from the
 * real 3D scene. Dev only: `npm run dev`, open /?capture at a 1600x900 window, wait for
 * `window.__capture.done`. Frames are read back from the GL canvas at its own resolution (one
 * pixel per dither cell), so the loops are exactly what the live page used to draw.
 * The files are written by the dev server (see vite.config.ts).
 */

const FPS = 15;
export const capture = (window as unknown as { __capture: { done: boolean; log: string[] } }).__capture ?? { done: false, log: [] };
(window as unknown as { __capture: typeof capture }).__capture = capture;

const log = (message: string) => {
  capture.log.push(message);
  document.title = message;
  console.log(message);
};

const save = async (name: string, body: BodyInit) => {
  const r = await fetch(`/__hero/save?name=${encodeURIComponent(name)}`, { method: 'POST', body });
  if (!r.ok) throw new Error(`could not save ${name}: ${r.status}`);
};

/** palette entry used for "unchanged" pixels (a 2-colour image leaves entries 2 and 3 spare) */
const TRANSPARENT = 2;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;
export async function runCapture() {
  if (running) return; // React StrictMode mounts twice
  running = true;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  document.body.appendChild(canvas);
  const stage = new ShowcaseStage();
  const engine = new Engine(() => [stage]);
  await engine.init(canvas);
  engine.stopLoop();
  while (!stage.allLoaded()) await wait(200);
  log(`all ${showcase.products.length} products loaded`);

  engine.draw(0, 1 / FPS);
  const rect = frames.hero.rect;
  if (!rect) throw new Error('the hero card has no size');
  // the crop in GL pixels (the canvas is 1/CELL of the css size)
  // inset by one pixel: the card's edge cell can straddle the page behind it
  const sx = Math.round(rect.x / CELL) + 1;
  const sy = Math.round(rect.y / CELL) + 1;
  const sw = Math.floor(rect.w / CELL) - 2;
  const sh = Math.floor(rect.h / CELL) - 2;
  log(`card ${sw}x${sh} at ${sx},${sy} (canvas ${engine.renderer.domElement.width}x${engine.renderer.domElement.height})`);
  const copy = document.createElement('canvas');
  copy.width = sw;
  copy.height = sh;
  const ctx = copy.getContext('2d', { willReadFrequently: true })!;
  const readFrame = () => {
    ctx.drawImage(engine.renderer.domElement, sx, sy, sw, sh, 0, 0, sw, sh);
    return ctx.getImageData(0, 0, sw, sh).data;
  };

  const products = showcase.products;
  const out: HeroProduct[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const seconds = loopSeconds(p.kind);
    const count = Math.round(seconds * FPS);
    const encoder = GIFEncoder();
    let palette: number[][] | null = null;
    let poster: Uint8Array | null = null;
    let previous: Uint8Array | null = null;
    for (let k = 0; k < count; k++) {
      stage.capture = { index: i, t: k / FPS };
      engine.draw(k / FPS, 1 / FPS);
      const rgba = readFrame();
      if (!palette) {
        palette = quantize(rgba, 4);
        // a GIF palette has a power-of-two size; the first spare entry is the transparent one
        while (palette.length < 4) palette.push([0, 0, 0]);
      }
      const index = applyPalette(rgba, palette);
      // after the first frame only the pixels that changed are written (the rest are
      // transparent over the frame before): it halves the file
      const frame = index.slice();
      if (previous) for (let q = 0; q < frame.length; q++) if (frame[q] === previous[q]) frame[q] = TRANSPARENT;
      previous = index;
      encoder.writeFrame(frame, sw, sh, {
        palette: k === 0 ? palette : undefined,
        delay: Math.round(1000 / FPS),
        repeat: 0,
        ...(k > 0 ? { transparent: true, transparentIndex: TRANSPARENT } : {}),
        dispose: 1,
      });
      if (k === 0) {
        const still = GIFEncoder();
        still.writeFrame(index, sw, sh, { palette, repeat: -1 });
        still.finish();
        poster = still.bytes();
      }
    }
    encoder.finish();
    const gif = encoder.bytes();
    await save(`${p.key}.gif`, new Blob([gif.slice().buffer]));
    await save(`${p.key}.poster.gif`, new Blob([poster!.slice().buffer]));
    out.push({ key: p.key, title: p.title, notebook: p.notebook, kind: p.kind, parts: p.parts, poster: `${p.key}.poster.gif`, gif: `${p.key}.gif`, seconds, width: sw, height: sh, bytes: gif.length });
    log(`${p.key}: ${count} frames, ${gif.length} B loop, ${poster!.length} B still, palette ${palette!.length}`);
  }
  await save('index.json', JSON.stringify({ fps: FPS, loops: { part: LOOP_PART, assembly: LOOP_ASSEMBLY }, products: out }, null, 2));
  capture.done = true;
  log('done');
}
