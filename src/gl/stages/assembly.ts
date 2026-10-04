import * as THREE from 'three/webgpu';
import { loadCad } from '../cad';
import { CadObject } from '../CadObject';
import { FrameInput, Stage } from '../Stage';
import { BldcIndex, loadJson } from '../../data';
import { lerp, smooth } from '../../math';
import { explode } from '../../timelines';

/** the example's explode offsets, compressed to fit a card */
const EXPLODE_SCALE = 0.45;

/**
 * 05: the integrated BLDC joint actuator, 74 leaf solids placed by the solved assembly.
 * Scroll explodes it along its axis exactly as the example's render_showcase does: four
 * modules apart, concentric radius bands peeling inside each, housings fading out.
 */
export class AssemblyStage extends Stage {
  readonly id = 'assembly' as const;
  private tilt = new THREE.Group();
  private spin = new THREE.Group();
  private leaves: { obj: CadObject; dz: number; housing: boolean }[] = [];
  private span = { lo: 0, hi: 0, loX: 0, hiX: 0, cz: 0 };

  protected async setup() {
    const idx = await loadJson<BldcIndex>('geometry/bldc/index.json');
    const assets = await Promise.all(idx.assets.map((a) => loadCad(`bldc/${a.name}`)));
    let lo = Infinity;
    let hi = -Infinity;
    let loX = Infinity;
    let hiX = -Infinity;
    assets.forEach((a, i) => {
      const meta = idx.assets[i];
      const obj = new CadObject(a, { hidden: false });
      this.spin.add(obj.group);
      this.leaves.push({ obj, dz: meta.explodeDz, housing: meta.hiddenInExplode });
      lo = Math.min(lo, a.doc.bounds.min[1]);
      hi = Math.max(hi, a.doc.bounds.max[1]);
      if (!meta.hiddenInExplode) {
        loX = Math.min(loX, a.doc.bounds.min[1] + meta.explodeDz);
        hiX = Math.max(hiX, a.doc.bounds.max[1] + meta.explodeDz);
      }
    });
    this.span = { lo, hi, loX, hiX, cz: 0 };
    // CAD z (the actuator axis) is page +Y; lean the stack across the frame
    this.tilt.rotation.z = -1.02;
    this.tilt.add(this.spin);
    this.scene.add(this.tilt);
    this.azimuth = 0.0;
    this.elevation = 0.18;
  }

  update(f: FrameInput) {
    const e = explode(f.progress);
    const fade = 1 - smooth(e, 0.0, 0.35);
    const spread = e * EXPLODE_SCALE;
    this.spin.rotation.y = f.time * 0.25 + f.progress * 2.4;
    this.azimuth = f.pointer.x * 0.1;
    for (const l of this.leaves) {
      l.obj.group.position.y = l.dz * spread;
      l.obj.reveal = f.visible * (l.housing ? fade : 1);
      l.obj.group.visible = !l.housing || fade > 0.01;
    }
    // frame the axial extent: assembled body -> exploded stack (centre on the axis)
    const lo = lerp(this.span.lo, this.span.loX * EXPLODE_SCALE, e);
    const hi = lerp(this.span.hi, this.span.hiX * EXPLODE_SCALE, e);
    const mid = new THREE.Vector3(0, (lo + hi) / 2, 0).applyEuler(this.tilt.rotation);
    this.target.copy(mid);
    this.radius = Math.max(34, (hi - lo) / 2 + 12);
    this.fill = 1.0;
  }
}
