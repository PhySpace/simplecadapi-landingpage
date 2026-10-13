import * as THREE from 'three/webgpu';
import { ChapterId, Rect } from '../scroll';

export interface View {
  w: number;
  h: number;
  /** narrow layout: model above the text */
  narrow: boolean;
}

export interface FrameInput {
  progress: number;
  visible: number;
  /** seconds since start */
  time: number;
  dt: number;
  /** pointer, -1..1 from the viewport centre */
  pointer: { x: number; y: number };
  view: View;
}

/** One chapter's 3D scene: loads its assets once, then poses itself from scroll progress. */
export abstract class Stage {
  abstract readonly id: ChapterId;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 1, 1, 8000);
  /** model space point the camera looks at, and the radius to fit */
  readonly target = new THREE.Vector3();
  radius = 60;
  /** fraction of the viewport box's shorter half-side the fitted radius fills */
  fill = 0.82;
  /** orbit (radians): azimuth around +Y, elevation */
  azimuth = 0.6;
  elevation = 0.45;
  private loading: Promise<void> | null = null;
  ready = false;

  /** whether `load()` has been asked for */
  get started() {
    return this.loading !== null;
  }

  /** Background work after `load()` (more products, more parts), done one unit at a time
   * by the Engine, nearest chapter first. */
  workLeft(): boolean {
    return false;
  }
  async doWork(): Promise<void> {}

  /** build the scene; called once */
  protected abstract setup(): Promise<void>;
  /** pose from this frame's scroll state */
  abstract update(f: FrameInput): void;

  load() {
    if (!this.loading) {
      this.loading = this.setup().then(() => {
        this.ready = true;
      });
    }
    return this.loading;
  }

  /** place the camera on its orbit so `radius` fills `fill` of the viewport box */
  frame(r: Rect) {
    const cam = this.camera;
    cam.aspect = r.w / r.h;
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // the fitted radius covers `fill` of the box's shorter side
    const shorter = Math.min(r.w, r.h);
    const d = (this.radius * r.h) / (half * shorter * this.fill);
    const ce = Math.cos(this.elevation);
    cam.position.set(
      this.target.x + d * ce * Math.sin(this.azimuth),
      this.target.y + d * Math.sin(this.elevation),
      this.target.z + d * ce * Math.cos(this.azimuth),
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.near = Math.max(0.5, d - this.radius * 4);
    cam.far = d + this.radius * 6;
    cam.updateProjectionMatrix();
  }
}
