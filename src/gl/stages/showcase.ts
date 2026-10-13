import * as THREE from 'three/webgpu';
import { loadCad } from '../cad';
import { CadObject } from '../CadObject';
import { FrameInput, Stage } from '../Stage';
import { ShowcaseIndex, ShowcaseProduct, loadJson } from '../../data';
import { showcase } from '../../hero';
import type { Priority } from '../cad';
import { lerp, smooth } from '../../math';

/** capture: a part turns once per loop, an assembly runs one assemble/explode/close cycle */
export const LOOP_PART = 9;
export const LOOP_ASSEMBLY = 6.4;
export const loopSeconds = (kind: 'part' | 'assembly') => (kind === 'assembly' ? LOOP_ASSEMBLY : LOOP_PART);

const HOLD = 4.6;
/** assemblies stay longer: they assemble, explode, hold, and close again */
const HOLD_ASSEMBLY = 6.4;
const FADE = 0.9;
/** explode: each part moves away from the product centre by this fraction of its offset */
const EXPLODE = 0.7;

/** 0 assembled .. 1 exploded over one assembly hold */
const explodeAt = (t: number) => smooth(t, 0.9, 2.1) * (1 - smooth(t, 4.2, 5.4));

interface Shown {
  group: THREE.Group;
  objs: CadObject[];
  product: ShowcaseProduct;
  /** per instance: its solved placement, and its offset from the product centre */
  base: THREE.Matrix4[];
  away: THREE.Vector3[];
  /** enclosing parts (housings): they dissolve while the rest is exploded */
  shell: boolean[];
}

/** 00: finished products from the examples, one after another, dissolving through each other */
export class ShowcaseStage extends Stage {
  readonly id = 'hero' as const;
  private shown: (Shown | null)[] = [];
  /** products still to load, smallest first: the rest of the rotation fills in behind the first */
  private queue: number[] = [];
  /** capture mode: pose product `index` at `t` seconds into its loop (no transitions, no pointer) */
  capture: { index: number; t: number } | null = null;
  private clock = 0;
  private current = 0;
  private next = -1;
  private shift = new THREE.Matrix4();
  /** the hold of the product fading out (fixed for the whole fade) */
  private fadeHold = HOLD;

  protected async setup() {
    const idx = await loadJson<ShowcaseIndex>('geometry/showcase/index.json', 'high');
    showcase.products = idx.products;
    this.shown = idx.products.map(() => null);
    // the first product alone, at high priority: it is what the visitor is looking at
    await this.build(0, 'high');
    this.frameProduct(idx.products[0]);
    showcase.emit();
    // the others follow one at a time, small ones first (the heavy assemblies last)
    this.queue = idx.products
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i > 0)
      .sort((a, b) => a.p.assets - b.p.assets || a.p.instances.length - b.p.instances.length)
      .map(({ i }) => i);
  }

  workLeft() {
    return this.queue.length > 0;
  }

  async doWork() {
    const i = this.queue.shift();
    if (i !== undefined) await this.build(i, 'low').catch(console.error);
  }

  private async build(i: number, priority: Priority) {
    const p = showcase.products[i];
    const names = [...new Set(p.instances.map((x) => x.asset))];
    const assets = new Map(await Promise.all(names.map(async (n) => [n, await loadCad(`showcase/${p.key}/${n}`, priority)] as const)));
    const group = new THREE.Group();
    const centre = new THREE.Vector3().fromArray(p.bounds.center);
    const base: THREE.Matrix4[] = [];
    const away: THREE.Vector3[] = [];
    const shell: boolean[] = [];
    const size = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
    const whole = size(new THREE.Box3(new THREE.Vector3().fromArray(p.bounds.min), new THREE.Vector3().fromArray(p.bounds.max)));
    const wholeVol = whole.x * whole.y * whole.z;
    const objs = p.instances.map((inst) => {
      const a = assets.get(inst.asset)!;
      const o = new CadObject(a, { hidden: p.kind === 'part' });
      o.group.matrixAutoUpdate = false;
      const m = new THREE.Matrix4().fromArray(inst.matrix);
      o.group.matrix.copy(m);
      base.push(m);
      away.push(new THREE.Vector3().fromArray(a.doc.bounds.center).applyMatrix4(m).sub(centre));
      const box = new THREE.Box3(new THREE.Vector3().fromArray(a.doc.bounds.min), new THREE.Vector3().fromArray(a.doc.bounds.max)).applyMatrix4(m);
      const v = size(box);
      shell.push(p.instances.length > 3 && v.x * v.y * v.z > 0.35 * wholeVol);
      group.add(o.group);
      return o;
    });
    group.visible = false;
    this.scene.add(group);
    this.shown[i] = { group, objs, product: p, base, away, shell };
    showcase.loaded.add(i);
    showcase.emit();
  }

  private frameProduct(p: ShowcaseProduct) {
    this.target.fromArray(p.bounds.center);
    this.radius = p.bounds.radius;
    this.fill = 0.92;
  }

  private nextLoaded(from: number) {
    const n = this.shown.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      if (this.shown[j]) return j;
    }
    return from;
  }

  private hold() {
    return showcase.products[this.current]?.kind === 'assembly' ? HOLD_ASSEMBLY : HOLD;
  }

  private updateCapture(f: FrameInput, index: number, t: number) {
    const s = this.shown[index];
    if (!s) return;
    this.current = index;
    this.next = -1;
    this.clock = t;
    const kind = s.product.kind;
    const e = kind === 'assembly' ? explodeAt(t) : 0;
    this.shown.forEach((x, i) => {
      if (x) x.group.visible = i === index;
    });
    s.objs.forEach((o, k) => {
      o.reveal = f.visible * (s.shell[k] ? 1 - smooth(e, 0, 0.6) : 1);
      const d = s.away[k];
      o.group.matrix.copy(s.base[k]).premultiply(this.shift.makeTranslation(d.x * e * EXPLODE, d.y * e * EXPLODE, d.z * e * EXPLODE));
    });
    this.frameProduct(s.product);
    this.radius = s.product.bounds.radius * (1 + 0.55 * e * EXPLODE);
    // a full turn over the loop for a part; a gentle sway for an assembly, which also explodes
    const phase = (2 * Math.PI * t) / loopSeconds(kind);
    this.azimuth = 0.6 + (kind === 'assembly' ? 0.45 * Math.sin(phase) : phase);
    this.elevation = 0.5;
  }

  /** every product's meshes are loaded (capture waits for this) */
  allLoaded() {
    return this.shown.length > 0 && this.shown.every(Boolean);
  }

  update(f: FrameInput) {
    if (this.capture) return this.updateCapture(f, this.capture.index, this.capture.t);
    this.clock += f.dt;
    const HOLD = this.hold();
    // a chip click waits for a running fade to finish, then cuts straight to its product
    if (showcase.request >= 0 && this.next < 0) {
      const r = showcase.request;
      showcase.request = -1;
      if (this.shown[r] && r !== this.current) {
        this.next = r;
        this.clock = HOLD;
        this.fadeHold = HOLD;
      }
    }
    if (this.next < 0 && this.clock > HOLD) {
      const j = this.nextLoaded(this.current);
      if (j !== this.current) {
        this.next = j;
        this.fadeHold = HOLD;
      } else this.clock = 0;
    }
    // fade: the outgoing product dissolves out, then the incoming one dissolves in
    let a = 1;
    if (this.next >= 0) {
      const t = (this.clock - this.fadeHold) / FADE;
      if (t < 0.5) a = 1 - smooth(t, 0, 0.5);
      else {
        if (this.current !== this.next) {
          this.current = this.next;
          this.frameProduct(showcase.products[this.current]);
          showcase.index = this.current;
          showcase.emit();
        }
        a = smooth(t, 0.5, 1);
        if (t >= 1) {
          this.next = -1;
          this.clock = 0;
        }
      }
    }
    const cur = this.shown[this.current];
    const e = cur && cur.product.kind === 'assembly' && this.next < 0 ? explodeAt(this.clock) : 0;
    this.shown.forEach((s, i) => {
      if (!s) return;
      s.group.visible = i === this.current;
      if (i !== this.current) return;
      s.objs.forEach((o, k) => {
        o.reveal = a * f.visible * (s.shell[k] ? 1 - smooth(e, 0, 0.6) : 1);
        const d = s.away[k];
        o.group.matrix.copy(s.base[k]).premultiply(this.shift.makeTranslation(d.x * e * EXPLODE, d.y * e * EXPLODE, d.z * e * EXPLODE));
      });
    });
    if (cur) this.radius = cur.product.bounds.radius * (1 + 0.55 * e * EXPLODE);
    this.azimuth = 0.6 + f.time * 0.14 + f.pointer.x * 0.12;
    this.elevation = lerp(0.5, 0.3, smooth(f.progress, 0, 1)) - f.pointer.y * 0.04;
  }
}
