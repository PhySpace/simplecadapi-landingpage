#!/usr/bin/env python3
"""L-bracket static FEM: boundary surface + nodal von Mises + displacement.

Runs the example's own chain (examples/ap242_gmsh_volume_mesh): the bracket
notebook's package and AP242 STEP, the Gmsh volume mesh with the preserved
``interface.*`` tags as physical groups, and the CalculiX static solve. Then
reads the .msh boundary triangles and the .frd nodal results.

Needs the gmsh extra and a ccx binary: run with pipeline/.venv
(``uv pip install -e "../SimpleCADAPI[gmsh]"``).

Output (public/geometry/fem/):
  bracket.json/.bin   the bracket BRep (faces with interface.* tags, edges) via cad_export
  field.json/.bin     surface positions f32 | normals f32 | indices u32 | vm f32 | disp f32x3 | group u8
Coordinates in the page frame (x, z, -y) of CAD, mm.
"""
from __future__ import annotations

import sys

import numpy as np

from cad_export import export_solid, summarize
from common import GEOMETRY, SCA_EXAMPLES, write_json

EXAMPLE = SCA_EXAMPLES / "ap242_gmsh_volume_mesh"
sys.path.insert(0, str(EXAMPLE))
import export_fem_mesh  # noqa: E402
import export_step  # noqa: E402
import run_calculix  # noqa: E402
from simplecadapi.runtime import run_notebook  # noqa: E402

OUT = GEOMETRY / "fem"
MESH_SIZE = 1.0
FRD = EXAMPLE / "out" / "ap242_gmsh_bracket_static.frd"
GROUPS = {"interface.fixed_support": 1, "interface.load_surface": 2}


def to_page(p: np.ndarray) -> np.ndarray:
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


def read_frd(path) -> dict[str, dict[int, list[float]]]:
    """Nodal result blocks (DISP, STRESS) of the last step: name -> node -> values."""
    blocks: dict[str, dict[int, list[float]]] = {}
    current = None
    for line in path.read_text().splitlines():
        if line.startswith(" -4"):
            current = line.split()[1]
            blocks[current] = {}
        elif line.startswith(" -1") and current is not None:
            node = int(line[3:13])
            rest = line[13:]
            values = [float(rest[i:i + 12]) for i in range(0, len(rest) - 11, 12)]
            blocks[current][node] = values
        elif line.startswith(" -3"):
            current = None
    return blocks


def von_mises(s: list[float]) -> float:
    sxx, syy, szz, sxy, syz, szx = s[:6]
    return float(np.sqrt(0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2)
                         + 3.0 * (sxy ** 2 + syz ** 2 + szx ** 2)))


def boundary_surface():
    """Triangles of every meshed surface, with the physical interface group of each."""
    import gmsh

    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.open(str(export_fem_mesh.MESH_PATH))
    group_of_surface: dict[int, int] = {}
    for dim, tag in gmsh.model.getPhysicalGroups(2):
        name = gmsh.model.getPhysicalName(dim, tag)
        if name in GROUPS:
            for s in gmsh.model.getEntitiesForPhysicalGroup(dim, tag):
                group_of_surface[s] = GROUPS[name]
    _, tets, _ = gmsh.model.mesh.getElements(3)
    elements = sum(len(t) for t in tets)
    node_tags, coords, _ = gmsh.model.mesh.getNodes()
    xyz = {int(t): coords[3 * i:3 * i + 3] for i, t in enumerate(node_tags)}
    tris, tri_group = [], []
    for _, surface in gmsh.model.getEntities(2):
        types, _, conn = gmsh.model.mesh.getElements(2, surface)
        for etype, nodes in zip(types, conn):
            if etype != 2:  # 3-node triangle
                raise ValueError(f"unexpected surface element type {etype}")
            t = np.asarray(nodes, np.int64).reshape(-1, 3)
            tris.append(t)
            tri_group.extend([group_of_surface.get(surface, 0)] * len(t))
    gmsh.finalize()
    return xyz, np.concatenate(tris), np.asarray(tri_group, np.uint8), elements


def main() -> None:
    export_step.main()
    export_fem_mesh.main(mesh_size=MESH_SIZE)
    run_calculix.main()

    bracket = run_notebook(EXAMPLE / "bracket.py").product.body
    doc = export_solid(bracket, OUT, "bracket", {"notebook": "examples/ap242_gmsh_volume_mesh/bracket.py"},
                       0.05, 0.15)
    print(" ", summarize(doc))

    xyz, tris, tri_group, elements = boundary_surface()
    frd = read_frd(FRD)
    stress, disp = frd["STRESS"], frd["DISP"]
    used = np.unique(tris)
    remap = {int(n): i for i, n in enumerate(used)}
    pos = to_page(np.asarray([xyz[int(n)] for n in used], np.float64))
    idx = np.vectorize(remap.get)(tris).astype(np.uint32)
    # gmsh orients boundary triangles outward for a closed volume; normals are area-weighted
    nrm = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(nrm, idx[:, k], fn)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    vm = np.asarray([von_mises(stress[int(n)]) for n in used], np.float32)
    d = to_page(np.asarray([disp[int(n)][:3] for n in used], np.float64)).astype(np.float32)
    group = np.zeros(len(used), np.uint8)
    for k in range(3):
        np.maximum.at(group, idx[:, k], tri_group)

    chunks, buffers, offset = [], {}, 0
    for key, arr, kind in [("positions", pos.astype(np.float32), "f32"), ("normals", nrm.astype(np.float32), "f32"),
                           ("indices", idx, "u32"), ("vm", vm, "f32"), ("disp", d, "f32"), ("group", group, "u8")]:
        data = np.ascontiguousarray(arr).tobytes()
        buffers[key] = {"offset": offset, "length": int(arr.size), "type": kind}
        chunks.append(data)
        offset += len(data)
        pad = (-offset) % 4
        chunks.append(b"\0" * pad)
        offset += pad
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "field.bin").write_bytes(b"".join(chunks))
    summary = run_calculix.parse_calculix_dat(FRD.with_suffix(".dat"))
    write_json(OUT / "field.json", {
        "bin": "field.bin", "buffers": buffers,
        "nodes": int(len(used)), "triangles": int(len(idx)),
        "volumeNodes": len(xyz), "elements": elements, "meshSize": MESH_SIZE,
        "vmMax": float(vm.max()), "vmMin": float(vm.min()),
        "dispMax": float(np.linalg.norm(d, axis=1).max()),
        "loadZ": run_calculix.DEFAULT_LOAD_Z_N,
        "groups": {name: g for name, g in GROUPS.items()},
        "solver": "CalculiX ccx, linear static, C3D4",
        "summary": summary,
    })
    print(f"field: {len(used)} surface nodes, {len(idx)} tris, vm {vm.min():.2f}..{vm.max():.2f} MPa")


if __name__ == "__main__":
    main()
