import { loadCad, newFaces } from '../cad';
import { CadObject } from '../CadObject';
import { setInk } from '../materials';
import { FrameInput, Stage } from '../Stage';
import { FlangeIndex, loadJson } from '../../data';
import { codeStage, paramsStep, selectStep } from '../../timelines';
import { INK } from '../../style/tokens';

const flangeIndex = () => loadJson<FlangeIndex>('geometry/flange/index.json');

/** shared idle motion: a slow turn plus a little pointer parallax */
const idle = (s: Stage, f: FrameInput, base: number, speed = 0.12) => {
  s.azimuth = base + f.time * speed + f.pointer.x * 0.12;
  s.elevation = s.elevation * 0.9 + 0.1 * (s.elevation + f.pointer.y * -0.05);
};

/** 01: the six feature cells, one at a time; faces a cell created are drawn in focus ink */
export class CodeStage extends Stage {
  readonly id = 'code' as const;
  private objs: CadObject[] = [];
  private shown = -1;

  protected async setup() {
    const idx = await flangeIndex();
    const assets = await Promise.all(idx.stages.map((s) => loadCad(`flange/${s.asset}`)));
    this.objs = assets.map((a, i) => {
      const o = new CadObject(a, { hidden: true });
      const fresh = new Set(newFaces(i > 0 ? assets[i - 1] : null, a));
      o.styleFaces((face) => (fresh.has(face) ? { focus: true } : undefined));
      o.group.visible = false;
      this.scene.add(o.group);
      return o;
    });
    this.target.set(0, 12, 0);
    this.radius = 62;
  }

  update(f: FrameInput) {
    idle(this, f, 0.9, 0.1);
    this.elevation = 0.5;
    const k = codeStage(f.progress);
    if (k !== this.shown) {
      this.objs.forEach((o, i) => (o.group.visible = i === k));
      this.shown = k;
    }
    this.objs[k].reveal = f.visible;
  }
}

/** 02: QL narrows the edge set step by step, then the fillet lands and its faces carry the tag */
export class SelectStage extends Stage {
  readonly id = 'select' as const;
  private pre!: CadObject;
  private post!: CadObject;
  private steps: number[][] = [];

  protected async setup() {
    const idx = await flangeIndex();
    const [pre, post] = await Promise.all([loadCad('flange/stage_4'), loadCad('flange/stage_5')]);
    const od = idx.params.flange_od;
    const t = idx.params.flange_t;
    const all = pre.doc.edges;
    const circles = all.filter((e) => e.type === 'CIRCLE');
    const rims = circles.filter((e) => Math.abs(e.length - Math.PI * od) <= 0.5);
    const exact = idx.selections['flange-edge-fillets'].edges;
    this.steps = [all.map((e) => e.i), circles.map((e) => e.i), rims.map((e) => e.i), exact];
    // sanity: replaying the predicates on the exported props must land on the SDK's own resolve
    const replay = rims.filter((e) => e.cz !== null && (Math.abs(e.cz) <= 0.1 || Math.abs(e.cz - t) <= 0.1)).map((e) => e.i);
    if (replay.join(',') !== [...exact].sort((a, b) => a - b).join(',')) console.warn('QL replay differs', replay, exact);

    this.pre = new CadObject(pre, { hidden: true });
    this.pre.surface.u.dimAll.value = 0.45;
    this.post = new CadObject(post, { hidden: true });
    this.post.styleFaces((face) => (post.doc.faces[face].tags.includes('fillet.flange_edge') ? { focus: true, lift: 0.25 } : undefined));
    this.scene.add(this.pre.group, this.post.group);
    this.target.set(0, 10, 0);
    this.radius = 60;
  }

  update(f: FrameInput) {
    idle(this, f, 2.2, 0.06);
    this.elevation = 0.62;
    const s = selectStep(f.progress);
    const filleted = s >= 4;
    this.pre.group.visible = !filleted;
    this.post.group.visible = filleted;
    if (!filleted) this.pre.select(this.steps[s], s === 3 ? INK.pass : INK.focus);
    this.pre.reveal = f.visible;
    this.post.reveal = f.visible;
  }
}

/** 04: bolt-pattern variants step with scroll; the rejected bolt circle turns the edges red */
export class ParamsStage extends Stage {
  readonly id = 'params' as const;
  private objs: CadObject[] = [];
  private shown = -2;

  protected async setup() {
    const idx = await flangeIndex();
    const assets = await Promise.all(idx.variants.map((v) => loadCad(`flange/${v.asset}`)));
    this.objs = assets.map((a) => {
      const o = new CadObject(a, { hidden: true });
      o.group.visible = false;
      this.scene.add(o.group);
      return o;
    });
    this.target.set(0, 10, 0);
    this.radius = 60;
  }

  update(f: FrameInput) {
    this.azimuth = 0.25 + f.pointer.x * 0.1 + Math.sin(f.time * 0.3) * 0.08;
    this.elevation = 1.0;
    const n = this.objs.length;
    const k = paramsStep(f.progress, n);
    if (k !== this.shown) {
      // the rejected run builds nothing: the last accepted model stays, its edges in fail ink
      const show = k < 0 ? n - 3 : k;
      this.objs.forEach((o, i) => (o.group.visible = i === show));
      const o = this.objs[show];
      setInk(o.edges.u.ink, k < 0 ? INK.fail : '#ffffff');
      this.shown = k;
    }
    this.objs.forEach((o) => (o.reveal = f.visible));
  }
}
