import * as THREE from 'three/webgpu';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/** Asset base: everything under public/ */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

type BufType = 'f32' | 'u32' | 'u16' | 'i16' | 'i8' | 'u8';

export interface BufDesc {
  offset: number;
  length: number;
  type: BufType;
  /** i16 positions: value = min + (q + 32768) * step */
  quant?: { min: number[]; step: number[] };
}

/** pipeline/cad_export.py document */
export interface CadDoc {
  name: string;
  bin: string;
  buffers: Record<'positions' | 'normals' | 'indices' | 'linePositions' | 'lineIndices', BufDesc>;
  bounds: { min: number[]; max: number[]; center: number[]; radius: number };
  faces: { i: number; tags: string[]; area: number; first: number; count: number }[];
  edges: { i: number; tags: string[]; length: number; type: string | null; cz: number | null; first: number; count: number }[];
  stats: { faces: number; edges: number; triangles: number; volume_mm3: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: Record<string, any>;
}

export interface CadAsset {
  key: string;
  doc: CadDoc;
  /** triangles with a per-vertex face index (aFace) */
  mesh: THREE.BufferGeometry;
  /** every BRep edge as line segments */
  lines: THREE.BufferGeometry;
  /** per-face centroid (mm, page frame), for matching faces across rebuilds */
  centroids: Float32Array;
}

const ARRAYS = {
  f32: Float32Array,
  u32: Uint32Array,
  u16: Uint16Array,
  i16: Int16Array,
  i8: Int8Array,
  u8: Uint8Array,
} as const;

export const rawView = (buf: ArrayBuffer, b: BufDesc) => new ARRAYS[b.type](buf, b.offset, b.length);

/** Decode any stored buffer to floats (dequantizing positions, unpacking normals). */
export const floats = (buf: ArrayBuffer, b: BufDesc): Float32Array => {
  const raw = rawView(buf, b);
  if (b.type === 'f32') return raw as Float32Array;
  const out = new Float32Array(raw.length);
  if (b.type === 'i16' && b.quant) {
    const { min, step } = b.quant;
    for (let i = 0; i < raw.length; i++) out[i] = min[i % 3] + (raw[i] + 32768) * step[i % 3];
  } else if (b.type === 'i8') {
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] / 127;
  } else {
    for (let i = 0; i < raw.length; i++) out[i] = raw[i];
  }
  return out;
};

const indices = (buf: ArrayBuffer, b: BufDesc) => {
  const raw = rawView(buf, b);
  return b.type === 'u16' || b.type === 'u32' ? (raw as Uint16Array | Uint32Array) : Uint32Array.from(raw);
};

const build = (key: string, doc: CadDoc, buf: ArrayBuffer): CadAsset => {
  const pos = floats(buf, doc.buffers.positions);
  const nrm = floats(buf, doc.buffers.normals);
  const idx = indices(buf, doc.buffers.indices);
  const nv = pos.length / 3;
  const face = new Float32Array(nv).fill(0);
  const centroids = new Float32Array(doc.faces.length * 3);
  for (const f of doc.faces) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let j = f.first; j < f.first + f.count; j++) {
      const v = idx[j];
      face[v] = f.i;
      sx += pos[v * 3];
      sy += pos[v * 3 + 1];
      sz += pos[v * 3 + 2];
    }
    const n = Math.max(1, f.count);
    centroids[f.i * 3] = sx / n;
    centroids[f.i * 3 + 1] = sy / n;
    centroids[f.i * 3 + 2] = sz / n;
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mesh.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  mesh.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  mesh.setIndex(new THREE.BufferAttribute(idx, 1));
  mesh.computeBoundingSphere();

  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.BufferAttribute(floats(buf, doc.buffers.linePositions), 3));
  lines.setIndex(new THREE.BufferAttribute(indices(buf, doc.buffers.lineIndices), 1));
  return { key, doc, mesh, lines, centroids };
};

/** How urgently a download is wanted: `high` for what is on screen now, `low` for what is
 * only being prepared in the background. The browser may ignore it. */
export type Priority = 'high' | 'low' | 'auto';

const fetchOk = async (url: string, priority: Priority = 'auto') => {
  const r = await fetch(url, priority === 'auto' ? undefined : { priority });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
};

export const fetchJson = async <T,>(path: string, priority: Priority = 'auto'): Promise<T> =>
  (await fetchOk(asset(path), priority)).json() as Promise<T>;
export const fetchBuffer = async (path: string, priority: Priority = 'auto') =>
  (await fetchOk(asset(path), priority)).arrayBuffer();

const cache = new Map<string, Promise<CadAsset>>();

/** Load geometry/<path>.json + its blob, once (the first caller's priority applies). */
export const loadCad = (path: string, priority: Priority = 'auto'): Promise<CadAsset> => {
  let p = cache.get(path);
  if (!p) {
    p = (async () => {
      const doc = await fetchJson<CadDoc>(`geometry/${path}.json`, priority);
      const dir = path.split('/').slice(0, -1).join('/');
      const buf = await fetchBuffer(`geometry/${dir}/${doc.bin}`, priority);
      return build(path, doc, buf);
    })();
    cache.set(path, p);
  }
  return p;
};

/** Line geometry holding only the given edges (selections drawn over everything). */
export const edgeSubset = (a: CadAsset, edges: number[]): THREE.BufferGeometry => {
  const all = a.lines.getIndex()!.array as Uint16Array | Uint32Array;
  let n = 0;
  for (const e of edges) n += a.doc.edges[e].count;
  const out = new Uint32Array(n);
  let k = 0;
  for (const e of edges) {
    const { first, count } = a.doc.edges[e];
    out.set(all.subarray(first, first + count), k);
    k += count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', a.lines.getAttribute('position'));
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
};

/**
 * Faces of `next` without a counterpart in `prev` (same area within 1 %, centroid within
 * `tol` mm): what a feature block created.
 */
export const newFaces = (prev: CadAsset | null, next: CadAsset, tol = 0.6): number[] => {
  if (!prev) return next.doc.faces.map((f) => f.i);
  const out: number[] = [];
  for (const f of next.doc.faces) {
    const c = next.centroids.subarray(f.i * 3, f.i * 3 + 3);
    const hit = prev.doc.faces.some((g) => {
      if (Math.abs(g.area - f.area) > 0.01 * Math.max(f.area, 1e-6)) return false;
      const d = prev.centroids.subarray(g.i * 3, g.i * 3 + 3);
      return Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) < tol;
    });
    if (!hit) out.push(f.i);
  }
  return out;
};

const fatCache = new WeakMap<THREE.BufferGeometry, LineSegmentsGeometry>();

/**
 * Wide-line geometry (one instanced quad per segment) for `lines`, or for the segments
 * `index` picks out of it. The whole-asset version is built once and shared.
 */
export const fatLines = (lines: THREE.BufferGeometry, index?: ArrayLike<number>): LineSegmentsGeometry => {
  if (!index) {
    const hit = fatCache.get(lines);
    if (hit) return hit;
  }
  const pos = lines.getAttribute('position').array as Float32Array;
  const idx = index ?? (lines.getIndex()!.array as ArrayLike<number>);
  const out = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i] * 3;
    out[i * 3] = pos[v];
    out[i * 3 + 1] = pos[v + 1];
    out[i * 3 + 2] = pos[v + 2];
  }
  const g = new LineSegmentsGeometry();
  g.setPositions(out);
  if (!index) fatCache.set(lines, g);
  return g;
};

/** the index list (pairs) of the given edges */
export const edgeIndex = (a: CadAsset, edges: number[]): Uint32Array => {
  const all = a.lines.getIndex()!.array as Uint16Array | Uint32Array;
  let n = 0;
  for (const e of edges) n += a.doc.edges[e].count;
  const out = new Uint32Array(n);
  let k = 0;
  for (const e of edges) {
    const { first, count } = a.doc.edges[e];
    out.set(all.subarray(first, first + count), k);
    k += count;
  }
  return out;
};
