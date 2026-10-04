import * as THREE from 'three/webgpu';
import { Discard, Fn, If, clamp, float, log, screenCoordinate, sin, texture, uniform, vec4 } from 'three/tsl';
import { blueNoiseTexture } from './materials';

/**
 * The brand ripple as a 1-bit field (physpace_analysis/ripple.py): a chirped wave flowing out
 * of the page's top-right corner, thresholded against blue noise, while the hero is on screen.
 */
export class Backdrop {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** corner: the ripple's origin in cells (top-left origin); extent: the page diagonal in cells */
  readonly u = { amount: uniform(0), shift: uniform(0), corner: uniform(new THREE.Vector2()), extent: uniform(1) };

  constructor() {
    const bn = blueNoiseTexture();
    const m = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, transparent: true });
    const u = this.u;
    m.colorNode = Fn(() => {
      const cell = screenCoordinate.xy;
      const d = cell.sub(u.corner).length();
      const far = u.extent;
      const k = float(54).div(far);
      const phase = float(6.28318530718).div(k).mul(log(float(1).add(k.mul(d).div(10))));
      const s = sin(phase.mul(0.5).sub(u.shift)).mul(0.5).add(0.5);
      const fall = clamp(float(1.15).sub(d.div(far.mul(0.42))), 0, 1);
      const tone = s.mul(s).mul(fall).mul(0.62).mul(u.amount);
      const th = texture(bn, cell.div(64)).r.mul(255).add(0.5).div(256);
      If(tone.lessThanEqual(th), () => {
        Discard();
      });
      return vec4(1, 1, 1, 1);
    })();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
}

/** a black card: keeps the ripple out from under the hero model */
export class Matte {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    const m = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    m.colorNode = vec4(0, 0, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
}
