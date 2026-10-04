import * as THREE from 'three/webgpu';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { CadAsset, edgeIndex, fatLines } from './cad';
import {
  DEFAULT_LOOK,
  Edges,
  Look,
  Surface,
  WideEdges,
  clearStyle,
  commitStyle,
  makeEdges,
  makeOccluder,
  makeSurface,
  makeWideEdges,
  setFaceStyle,
} from './materials';
import { INK, WHITE } from '../style/tokens';

/** visible BRep edges and selections, in cells */
export const EDGE_WIDTH = 2;
export const SELECT_WIDTH = 3;

export interface CadObjectOptions {
  /** dithered faces (default), depth-only faces (pure line drawing), or no faces */
  faces?: 'dither' | 'occlude' | 'none';
  /** dotted hidden edges behind the surfaces */
  hidden?: boolean;
  edgeInk?: string;
  look?: Look;
}

/** One exported solid: dithered faces, wide white BRep edges, optional hidden lines and selections. */
export class CadObject {
  readonly group = new THREE.Group();
  readonly surface: Surface;
  readonly edges: WideEdges;
  readonly hiddenEdges: Edges | null;
  private readonly faceMesh: THREE.Mesh;
  private selection: { lines: LineSegments2; edges: WideEdges; key: string } | null = null;

  constructor(
    readonly asset: CadAsset,
    opts: CadObjectOptions = {},
  ) {
    const faces = opts.faces ?? 'dither';
    this.surface = makeSurface(asset.doc.faces.length, opts.look ?? DEFAULT_LOOK);
    const mat = faces === 'occlude' ? makeOccluder() : this.surface.material;
    this.faceMesh = new THREE.Mesh(asset.mesh, mat);
    this.faceMesh.visible = faces !== 'none';
    this.faceMesh.frustumCulled = false;
    this.group.add(this.faceMesh);

    this.edges = makeWideEdges(opts.edgeInk ?? WHITE, EDGE_WIDTH);
    const lines = new LineSegments2(fatLines(asset.lines), this.edges.material);
    lines.renderOrder = 1;
    lines.frustumCulled = false;
    this.group.add(lines);

    this.hiddenEdges = opts.hidden ? makeEdges(opts.edgeInk ?? WHITE, 'hidden') : null;
    if (this.hiddenEdges) {
      const h = new THREE.LineSegments(asset.lines, this.hiddenEdges.material);
      h.renderOrder = 2;
      h.frustumCulled = false;
      this.group.add(h);
    }
  }

  /** dissolve 0 (gone) .. 1 (solid) */
  set reveal(v: number) {
    this.surface.u.reveal.value = v;
    this.edges.u.reveal.value = v;
    if (this.hiddenEdges) this.hiddenEdges.u.reveal.value = v;
    if (this.selection) this.selection.edges.u.reveal.value = v;
  }

  set facesVisible(v: boolean) {
    this.faceMesh.visible = v;
  }

  /** per-face style for every face; undefined clears it */
  styleFaces(fn?: (face: number) => Parameters<typeof setFaceStyle>[2] | undefined) {
    clearStyle(this.surface);
    if (fn) {
      for (let i = 0; i < this.asset.doc.faces.length; i++) {
        const st = fn(i);
        if (st) setFaceStyle(this.surface, i, st);
      }
    }
    commitStyle(this.surface);
  }

  /** draw these edges on top of everything in `ink` (null clears) */
  select(edges: number[] | null, ink: string = INK.focus) {
    const key = edges ? `${edges.join(',')}|${ink}` : '';
    if (this.selection?.key === key) return;
    if (this.selection) {
      this.group.remove(this.selection.lines);
      this.selection.lines.geometry.dispose();
      this.selection.edges.material.dispose();
      this.selection = null;
    }
    if (!edges || edges.length === 0) return;
    const e = makeWideEdges(ink, SELECT_WIDTH, true);
    e.u.reveal.value = this.edges.u.reveal.value;
    const lines = new LineSegments2(fatLines(this.asset.lines, edgeIndex(this.asset, edges)), e.material);
    lines.renderOrder = 10;
    lines.frustumCulled = false;
    this.group.add(lines);
    this.selection = { lines, edges: e, key };
  }

  dispose() {
    this.select(null);
    this.surface.material.dispose();
    this.surface.style.dispose();
    this.edges.material.dispose();
    this.hiddenEdges?.material.dispose();
  }
}
