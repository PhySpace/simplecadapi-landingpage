import * as THREE from 'three/webgpu';
import {
  Discard,
  Fn,
  If,
  attribute,
  cameraProjectionMatrix,
  clamp,
  dot,
  float,
  floor,
  int,
  ivec2,
  max,
  mix,
  mod,
  modelViewMatrix,
  normalView,
  positionLocal,
  positionView,
  pow,
  screenCoordinate,
  select,
  texture,
  textureLoad,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { asset } from './cad';
import { CELL, FEM_RAMP, INK, WHITE } from '../style/tokens';

/**
 * The page's surface language, after physpace-promo's film shader: shade, then threshold
 * against blue noise at cell resolution, so every lit cell is exactly black or one ink.
 * Every material also dissolves through a second, decorrelated noise lookup (`reveal`),
 * which is how scenes cross between chapters.
 */

let blueNoise: THREE.Texture | null = null;

export const loadBlueNoise = async () => {
  const t = await new THREE.TextureLoader().loadAsync(asset('brand/blue_noise_64.png'));
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  blueNoise = t;
};

export const blueNoiseTexture = () => {
  if (!blueNoise) throw new Error('blue noise not loaded');
  return blueNoise;
};

/** blue-noise threshold in (0, 1) at this cell, shifted by `offset` cells to decorrelate uses */
const threshold = (ox = 0, oy = 0) => {
  if (!blueNoise) throw new Error('blue noise not loaded');
  return texture(blueNoise, screenCoordinate.xy.add(vec2(ox, oy)).div(64)).r.mul(255).add(0.5).div(256);
};

const DISSOLVE: [number, number] = [29, 41];

export interface Look {
  floor: number;
  gain: number;
  rim: number;
  key: [number, number, number];
}

/** mid key: lit faces dither to grey so the white BRep edges stay legible on top */
export const DEFAULT_LOOK: Look = { floor: 0.04, gain: 0.64, rim: 0.26, key: [-0.45, 0.65, 0.62] };

export const color = (css: string) => new THREE.Color(css);

/** inks are vec3 uniforms (linear rgb of a css colour); the output pass converts back to sRGB */
const inkVec = (css: string) => {
  const c = color(css);
  return new THREE.Vector3(c.r, c.g, c.b);
};

export const setInk = (u: { value: THREE.Vector3 }, css: string) => {
  const c = color(css);
  u.value.set(c.r, c.g, c.b);
};

export const makeSurface = (faceCount: number, look: Look = DEFAULT_LOOK) => {
  const n = Math.max(1, faceCount);
  const style = new THREE.DataTexture(new Float32Array(n * 4), n, 1, THREE.RGBAFormat, THREE.FloatType);
  style.magFilter = THREE.NearestFilter;
  style.minFilter = THREE.NearestFilter;
  style.generateMipmaps = false;
  style.needsUpdate = true;

  const u = {
    reveal: uniform(1),
    dimAll: uniform(0),
    floor: uniform(look.floor),
    gain: uniform(look.gain),
    rim: uniform(look.rim),
    key: uniform(new THREE.Vector3(...look.key).normalize()),
    ink: uniform(inkVec(WHITE)),
    focus: uniform(inkVec(INK.focus)),
  };
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  // faces sit a little behind their edges, so the wide edge ribbons win the depth test
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1.5;
  material.polygonOffsetUnits = 2;
  material.colorNode = Fn(() => {
    If(threshold(...DISSOLVE).greaterThan(u.reveal), () => {
      Discard();
    });
    // per-face style: r lift toward white, g dim toward black, b hide, a focus ink
    const st = textureLoad(style, ivec2(int(attribute('aFace', 'float').add(0.5)), int(0)));
    If(st.b.greaterThan(0.5), () => {
      Discard();
    });
    const nv = normalView;
    const v = positionView.negate().normalize();
    const ndl = max(dot(nv, u.key), 0.0);
    const fill = nv.y.mul(0.5).add(0.5);
    const rim = pow(float(1).sub(max(dot(nv, v), 0.0)), 3.0);
    const tone = u.floor.add(u.gain.mul(ndl.mul(0.74).add(fill.mul(0.2)))).add(u.rim.mul(rim)).toVar();
    tone.mulAssign(float(1).sub(u.dimAll));
    tone.assign(mix(tone, float(1), st.r));
    tone.mulAssign(float(1).sub(st.g.mul(0.9)));
    const ink = select(st.a.greaterThan(0.5), u.focus, u.ink);
    return vec4(select(tone.greaterThan(threshold()), ink, vec3(0)), 1);
  })();
  return { material, style, u };
};

export type Surface = ReturnType<typeof makeSurface>;

/** write one face's style (call `commitStyle` once after a batch) */
export const setFaceStyle = (
  s: Surface,
  face: number,
  st: { lift?: number; dim?: number; hide?: boolean; focus?: boolean },
) => {
  const d = s.style.image.data as Float32Array;
  d[face * 4] = st.lift ?? 0;
  d[face * 4 + 1] = st.dim ?? 0;
  d[face * 4 + 2] = st.hide ? 1 : 0;
  d[face * 4 + 3] = st.focus ? 1 : 0;
};

export const clearStyle = (s: Surface) => (s.style.image.data as Float32Array).fill(0);
export const commitStyle = (s: Surface) => {
  s.style.needsUpdate = true;
};

/** depth-only surface: hides the edges behind the solid without drawing it */
export const makeOccluder = () => {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorWrite = false;
  return m;
};

export type EdgeMode = 'visible' | 'hidden' | 'top' | 'dotted';

/**
 * BRep edges, one cell wide. `visible` slides 0.4 % toward the eye so it wins the depth test
 * against the faces it bounds; `hidden` draws only what lies behind a surface, dotted;
 * `top` ignores depth (selections drawn over everything); `dotted` ignores depth and is
 * dotted (a quiet line drawing behind text).
 */
export const makeEdges = (css: string, mode: EdgeMode = 'visible') => {
  const u = { reveal: uniform(1), ink: uniform(inkVec(css)) };
  const m = new THREE.LineBasicNodeMaterial();
  m.vertexNode = Fn(() => {
    const mv = modelViewMatrix.mul(vec4(positionLocal, 1.0));
    const k = mode === 'hidden' ? 1.0 : 0.996;
    return cameraProjectionMatrix.mul(vec4(mv.xyz.mul(k), 1.0));
  })();
  m.colorNode = Fn(() => {
    If(threshold(...DISSOLVE).greaterThan(u.reveal), () => {
      Discard();
    });
    if (mode === 'hidden' || mode === 'dotted') {
      const c = floor(screenCoordinate.xy);
      If(mod(c.x.add(c.y), 3.0).greaterThan(0.5), () => {
        Discard();
      });
    }
    return vec4(u.ink, 1);
  })();
  if (mode === 'hidden') {
    m.depthFunc = THREE.GreaterDepth;
    m.depthWrite = false;
  }
  if (mode === 'top' || mode === 'dotted') {
    m.depthTest = false;
    m.depthWrite = false;
  }
  return { material: m, u };
};

export type Edges = ReturnType<typeof makeEdges>;

/**
 * BRep edges as wide ribbons (`width` cells), for legibility over the dithered faces.
 * `top` ignores depth (selections drawn over everything).
 */
export const makeWideEdges = (css: string, width = 2, top = false) => {
  const u = { reveal: uniform(1), ink: uniform(inkVec(css)) };
  // Line2NodeMaterial measures width in css px (it divides by the pixel ratio, 1 / CELL here)
  const m = new THREE.Line2NodeMaterial({ linewidth: width * CELL });
  m.linewidth = width * CELL;
  m.colorNode = Fn(() => {
    If(threshold(...DISSOLVE).greaterThan(u.reveal), () => {
      Discard();
    });
    return vec4(u.ink, 1);
  })();
  if (top) {
    m.depthTest = false;
    m.depthWrite = false;
  }
  return { material: m, u };
};

export type WideEdges = ReturnType<typeof makeWideEdges>;

/** colour scale exponent: bands follow (vm / vmMax)^gamma, so the low-stress body still reads */
export const FEM_GAMMA = 0.5;

/**
 * FEM field: nodal von Mises picks one of the ramp's bands, dithered between neighbours
 * by blue noise; shading still decides lit vs black per cell. `dispScale` exaggerates the
 * solved displacement.
 */
export const makeFemSurface = (vmMax: number) => {
  const ramp = uniformArray(FEM_RAMP.map((c) => color(c)), 'color');
  const u = {
    reveal: uniform(1),
    vmMax: uniform(vmMax),
    dispScale: uniform(0),
    key: uniform(new THREE.Vector3(...DEFAULT_LOOK.key).normalize()),
  };
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.positionNode = positionLocal.add(attribute('disp', 'vec3').mul(u.dispScale));
  m.colorNode = Fn(() => {
    If(threshold(...DISSOLVE).greaterThan(u.reveal), () => {
      Discard();
    });
    const s = pow(clamp(attribute('vm', 'float').div(u.vmMax), 0.0, 1.0), FEM_GAMMA).mul(FEM_RAMP.length - 1);
    const lo = floor(s);
    const band = lo.add(select(s.sub(lo).greaterThan(threshold(7, 13)), float(1), float(0)));
    const ink = ramp.element(int(band));
    const nv = normalView;
    const ndl = max(dot(nv, u.key), 0.0);
    const tone = float(0.42).add(ndl.mul(0.5)).add(nv.y.mul(0.08));
    return vec4(select(tone.greaterThan(threshold(3, 5)), ink, vec3(0)), 1);
  })();
  return { material: m, u };
};

export type FemSurface = ReturnType<typeof makeFemSurface>;
