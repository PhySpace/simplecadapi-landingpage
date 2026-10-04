import { loadCad } from '../cad';
import { CadObject } from '../CadObject';
import { setInk } from '../materials';
import { FrameInput, Stage } from '../Stage';
import { INK } from '../../style/tokens';
import { verifyPhase } from '../../timelines';

/**
 * 03: fillet_rsolid(box, [edge], radius=12) on a 10 x 4 x 4 mm box: the kernel refuses, the
 * failing edge goes red; after the retry at 3.8 mm the new fillet faces are drawn in pass ink.
 */
export class VerifyStage extends Stage {
  readonly id = 'verify' as const;
  private box!: CadObject;
  private fixed!: CadObject;
  private failing: number[] = [0];

  protected async setup() {
    const [box, fixed] = await Promise.all([loadCad('fillet_error/box'), loadCad('fillet_error/fixed')]);
    this.box = new CadObject(box, { hidden: true });
    this.failing = (box.doc.meta.failingEdges as number[]) ?? [0];
    this.fixed = new CadObject(fixed, { hidden: true });
    setInk(this.fixed.surface.u.focus, INK.pass);
    this.fixed.styleFaces((face) => (fixed.doc.faces[face].tags.includes('fillet.fixed') ? { focus: true } : undefined));
    this.scene.add(this.box.group, this.fixed.group);
    this.target.set(0, 2, 0);
    this.radius = 6.2;
    this.fill = 0.74;
  }

  update(f: FrameInput) {
    this.azimuth = -0.75 + Math.sin(f.time * 0.25) * 0.12 + f.pointer.x * 0.1;
    this.elevation = 0.5;
    const phase = verifyPhase(f.progress);
    this.box.group.visible = phase < 2;
    this.fixed.group.visible = phase === 2;
    // the failing edge blinks while the error is being read
    const blink = phase === 1 && Math.floor(f.time * 3) % 2 === 0;
    this.box.select(blink ? null : this.failing, INK.fail);
    this.box.reveal = f.visible;
    this.fixed.reveal = f.visible;
  }
}
