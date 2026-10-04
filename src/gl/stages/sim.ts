import * as THREE from 'three/webgpu';
import { fetchBuffer, loadCad } from '../cad';
import { CadObject } from '../CadObject';
import { FemSurface, makeFemSurface } from '../materials';
import { FrameInput, Stage } from '../Stage';
import { FieldIndex, loadJson } from '../../data';
import { simDeform, simField } from '../../timelines';

/** displacement scale: ~6 mm of visible sag at full exaggeration (also the page readout) */
export const exaggeration = (p: number, dispMax: number) => (simDeform(p) * 6) / dispMax;

/** the interface tags the load case reads */
export const LOAD_CASE_TAGS = ['interface.fixed_support', 'interface.load_surface'];

/**
 * 06: the L-bracket. First the BRep with the tagged boundary faces; then the CalculiX
 * nodal von Mises field on the Gmsh boundary, with the solved displacement exaggerated.
 */
export class SimStage extends Stage {
  readonly id = 'sim' as const;
  private brep!: CadObject;
  private wire!: CadObject;
  private fem!: FemSurface;
  private femMesh!: THREE.Mesh;
  private dispMax = 1;

  protected async setup() {
    const [a, idx] = await Promise.all([loadCad('fem/bracket'), loadJson<FieldIndex>('geometry/fem/field.json')]);
    const buf = await fetchBuffer(`geometry/fem/${idx.bin}`);
    const f32 = (k: string) => new Float32Array(buf, idx.buffers[k].offset, idx.buffers[k].length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f32('positions'), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f32('normals'), 3));
    g.setAttribute('vm', new THREE.BufferAttribute(f32('vm'), 1));
    g.setAttribute('disp', new THREE.BufferAttribute(f32('disp'), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, idx.buffers.indices.offset, idx.buffers.indices.length), 1));
    this.fem = makeFemSurface(idx.vmMax);
    this.femMesh = new THREE.Mesh(g, this.fem.material);
    this.femMesh.frustumCulled = false;
    this.dispMax = idx.dispMax;

    this.brep = new CadObject(a, { hidden: true });
    this.brep.styleFaces((face) =>
      a.doc.faces[face].tags.some((t) => LOAD_CASE_TAGS.includes(t)) ? { focus: true, lift: 0.3 } : undefined,
    );
    // the BRep edges stay over the field until the shape starts to move
    this.wire = new CadObject(a, { faces: 'none' });
    this.scene.add(this.brep.group, this.femMesh, this.wire.group);
    this.target.set(12, 18, 0);
    this.radius = 30;
    this.fill = 0.86;
  }

  update(f: FrameInput) {
    this.azimuth = 0.95 + Math.sin(f.time * 0.2) * 0.1 + f.pointer.x * 0.12 + f.progress * 0.5;
    this.elevation = 0.42;
    const field = simField(f.progress);
    const deform = simDeform(f.progress);
    this.brep.reveal = f.visible * (1 - field);
    this.brep.group.visible = field < 0.999;
    this.fem.u.reveal.value = f.visible * field;
    this.femMesh.visible = field > 0.001;
    this.fem.u.dispScale.value = exaggeration(f.progress, this.dispMax);
    this.wire.reveal = f.visible * field * (1 - deform);
    this.wire.group.visible = field > 0.001 && deform < 0.999;
  }
}
