import * as THREE from 'three/webgpu';
import { CHAPTERS, ChapterId, frames, measure } from '../scroll';
import { CELL } from '../style/tokens';
import { Backdrop, Matte } from './Backdrop';
import { loadBlueNoise } from './materials';
import { Stage, View } from './Stage';

export type EngineStatus = 'webgpu' | 'webgl2' | 'failed';

/**
 * One fixed canvas behind the page. It renders at 1/CELL of the css size and is shown with
 * nearest filtering, so one GL pixel is one dither cell and a 1-pixel line is a clean seam.
 * Each visible chapter's stage renders into it in turn.
 */
export class Engine {
  renderer!: THREE.WebGPURenderer;
  private stages = new Map<ChapterId, Stage>();
  private backdrop: Backdrop | null = null;
  private matte: Matte | null = null;
  private view: View = { w: 1, h: 1, narrow: false };
  private pointer = { x: 0, y: 0 };
  private start = performance.now();
  private last = performance.now();
  status: EngineStatus = 'failed';

  constructor(private readonly makeStages: () => Stage[]) {}

  async init(canvas: HTMLCanvasElement): Promise<EngineStatus> {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true });
    await renderer.init();
    this.renderer = renderer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.status = (renderer.backend as any).isWebGPUBackend ? 'webgpu' : 'webgl2';
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.setPixelRatio(1 / CELL);
    await loadBlueNoise();
    // debug switches: ?nobg drops the ripple field, ?only=hero,code limits the stages
    const q = new URLSearchParams(location.search);
    if (!q.has('nobg')) this.backdrop = new Backdrop();
    this.matte = new Matte();
    const only = q.get('only')?.split(',');
    for (const s of this.makeStages()) if (!only || only.includes(s.id)) this.stages.set(s.id, s);
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.preload();
    renderer.setAnimationLoop(this.tick);
    return this.status;
  }

  /**
   * Download in order of what the visitor is looking at. The hero's first model comes first,
   * alone. After it, one unit of work at a time (a stage, or one more product of the hero):
   * the chapter on screen first, then the nearest ones, those below before those above.
   * Scrolling re-orders what is still waiting, because the choice is made again after every unit.
   */
  private async preload() {
    const hero = this.stages.get('hero');
    if (hero) await this.run(() => hero.load());
    for (;;) {
      const next = this.nextWork();
      if (!next) break;
      await this.run(next);
    }
  }

  private async run(work: () => Promise<void>) {
    try {
      await work();
    } catch (err) {
      console.error('loading failed', err);
    }
  }

  private nextWork(): (() => Promise<void>) | null {
    const current = CHAPTERS.reduce((best, id) => (frames[id].visible > frames[best].visible ? id : best), 'hero' as ChapterId);
    const at = CHAPTERS.indexOf(current);
    let best: { rank: number; work: () => Promise<void> } | null = null;
    for (const [id, stage] of this.stages) {
      const work = !stage.started ? () => stage.load() : stage.workLeft() ? () => stage.doWork() : null;
      if (!work) continue;
      const d = CHAPTERS.indexOf(id) - at;
      const rank = Math.abs(d) + (d < 0 ? 0.5 : 0);
      if (!best || rank < best.rank) best = { rank, work };
    }
    return best ? best.work : null;
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.view = { w, h, narrow: w < 860 };
    this.renderer.setSize(w, h, true);
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / this.view.w) * 2 - 1;
    this.pointer.y = (e.clientY / this.view.h) * 2 - 1;
  };

  private tick = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    measure();
    const r = this.renderer;
    r.setScissorTest(false);
    r.clear();
    const time = (now - this.start) / 1000;
    const { w: W, h: H } = this.view;
    // the brand ripple runs out of the page's top-right corner while the hero is up
    if (this.backdrop && frames.hero.visible > 0.001) {
      r.setViewport(0, 0, W, H);
      this.backdrop.u.amount.value = frames.hero.visible;
      this.backdrop.u.shift.value = time * 0.9;
      this.backdrop.u.corner.value.set(W / CELL, 0);
      this.backdrop.u.extent.value = Math.hypot(W, H) / CELL;
      r.render(this.backdrop.scene, this.backdrop.camera);
    }
    r.setScissorTest(true);
    for (const id of CHAPTERS) {
      const f = frames[id];
      const rect = f.rect;
      if (!rect || f.visible <= 0.001 || rect.y > H || rect.y + rect.h < 0 || rect.w < 4 || rect.h < 4) continue;
      // css px from the top-left (the pixel ratio applies)
      const vy = rect.y;
      r.setViewport(rect.x, vy, rect.w, rect.h);
      r.setScissor(rect.x, vy, rect.w, rect.h);
      if (id === 'hero' && this.backdrop && this.matte) r.render(this.matte.scene, this.matte.camera);
      const s = this.stages.get(id);
      if (!s || !s.ready) continue;
      s.update({ progress: f.progress, visible: f.visible, time, dt, pointer: this.pointer, view: this.view });
      s.frame(rect);
      r.clearDepth();
      r.render(s.scene, s.camera);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  };

  dispose() {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onPointer);
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
  }
}
