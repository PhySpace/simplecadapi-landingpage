import { loadCad } from '../cad';
import { CadObject } from '../CadObject';
import { FrameInput, Stage } from '../Stage';
import { FourbarIndex, loadJson } from '../../data';
import { COMPOSE_LINKS, composeActive, crankAngle } from '../../timelines';

/** closed-form crank-rocker: pivots A (crank) and D (rocker) on the ground span */
export const solveFourBar = (L: FourbarIndex['lengths'], theta: number) => {
  const A = [0, 0];
  const D = [L.ground, 0];
  const B = [L.crank * Math.cos(theta), L.crank * Math.sin(theta)];
  const dx = D[0] - B[0];
  const dy = D[1] - B[1];
  const d = Math.hypot(dx, dy);
  const a = (L.coupler ** 2 - L.rocker ** 2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L.coupler ** 2 - a * a));
  const P = [B[0] + (a * dx) / d, B[1] + (a * dy) / d];
  const C = [P[0] - (h * dy) / d, P[1] + (h * dx) / d];
  return { A, B, C, D };
};

/**
 * 07: four family members of link_bar.py and four pivot bolts, driven by the crank. The
 * links stack on layers (bar thickness + 0.4 mm), the stacking the example's collision
 * check settled on; the active scad.use line's link is drawn in focus ink.
 */
export class ComposeStage extends Stage {
  readonly id = 'compose' as const;
  private links = new Map<string, CadObject>();
  private bolts: CadObject[] = [];
  private lengths!: FourbarIndex['lengths'];
  private layer = 4.4;
  private active = -1;

  protected async setup() {
    const idx = await loadJson<FourbarIndex>('geometry/fourbar/index.json');
    this.lengths = idx.lengths;
    this.layer = idx.barThickness + 0.4;
    const [linkAssets, bolt] = await Promise.all([
      Promise.all(idx.links.map((l) => loadCad(`fourbar/${l.asset}`))),
      loadCad('fourbar/pivot_bolt'),
    ]);
    idx.links.forEach((l, i) => {
      const o = new CadObject(linkAssets[i], { hidden: true });
      this.links.set(l.asset, o);
      this.scene.add(o.group);
    });
    for (let i = 0; i < 4; i++) {
      const o = new CadObject(bolt, { hidden: false });
      this.bolts.push(o);
      this.scene.add(o.group);
    }
    this.target.set(32, 4, -6);
    this.radius = 44;
    this.fill = 0.9;
  }

  private place(id: string, origin: number[], to: number[], layer: number) {
    const o = this.links.get(id)!;
    o.group.position.set(origin[0], layer * this.layer, -origin[1]);
    o.group.rotation.y = Math.atan2(to[1] - origin[1], to[0] - origin[0]);
  }

  update(f: FrameInput) {
    this.azimuth = 0.35 + f.pointer.x * 0.12 + Math.sin(f.time * 0.15) * 0.05;
    this.elevation = 0.86;
    const { A, B, C, D } = solveFourBar(this.lengths, crankAngle(f.progress) + f.time * 0.15);
    this.place('ground_span', A, D, 0);
    this.place('crank', A, B, 1);
    this.place('rocker', D, C, 1);
    this.place('coupler', B, C, 2);
    const top = [1, 2, 2, 1];
    [A, B, C, D].forEach((p, i) => this.bolts[i].group.position.set(p[0], top[i] * this.layer + 2, -p[1]));

    const k = composeActive(f.progress);
    if (k !== this.active) {
      COMPOSE_LINKS.forEach((id, i) => this.links.get(id)!.styleFaces(i === k ? () => ({ focus: true }) : undefined));
      this.active = k;
    }
    this.links.forEach((o) => (o.reveal = f.visible));
    this.bolts.forEach((o) => (o.reveal = f.visible));
  }
}
