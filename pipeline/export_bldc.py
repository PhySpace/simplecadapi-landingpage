#!/usr/bin/env python3
"""The integrated BLDC joint actuator: per-leaf meshes + explode offsets.

Captures the example's package with its own export.capture_package (the
assembly notebook through the runtime), reopens it exactly like render_showcase.py
(load -> materialize -> flatten placements), and exports every leaf part in
world coordinates. Explode offsets follow the example's own rules
(four axial modules, concentric radius bands, housings hidden in explode) by
reusing its helpers and constants.
"""
from __future__ import annotations

import math
import sys
import time

import simplecadapi as scad

from cad_export import export_solid, summarize, write_index
from common import GEOMETRY, SCA_EXAMPLES

sys.setrecursionlimit(30000)
sys.path.insert(0, str(SCA_EXAMPLES / "integrated_bldc_joint_actuator"))
import export as bldc_export  # noqa: E402
import render_showcase as rs  # noqa: E402

OUT = GEOMETRY / "bldc"
PACKAGE = bldc_export.PACKAGE_PATH
# ~0.3 mm per cell at the page framing: finer tessellation is invisible after dithering
LIN_TOL, ANG_TOL = 0.3, 0.35


def explode_offsets(placed, centers, radii) -> dict[int, float]:
    """Mirror of render_showcase.main's axial explode layout (mm along CAD z)."""
    groups: dict[str, list[int]] = {}
    for i, (name, _) in enumerate(placed):
        if name in rs.HOUSINGS_HIDDEN_IN_EXPLODE:
            continue
        groups.setdefault(rs._group_of(name), []).append(i)
    assert set(groups) == {"esc", "motor", "reducer", "output"}, sorted(groups)
    group_z = {g: sum(centers[i].z for i in m) / len(m) for g, m in groups.items()}
    order = sorted(group_z, key=group_z.get)

    layout = []
    for g in order:
        members = groups[g]
        band_of = {i: math.ceil(radii[i] / rs.RADIUS_BAND_MM) for i in members}
        layer_rank = {b: k for k, b in enumerate(sorted(set(band_of.values()), reverse=True))}
        fan = max(layer_rank.values()) * rs.INTRA_GAP if layer_rank else 0.0
        z_min = min(centers[i].z for i in members)
        z_max = max(centers[i].z for i in members)
        layout.append((g, members, band_of, layer_rank, z_min, z_max, fan))

    total = sum((zx - zn) + fan for *_, zn, zx, fan in layout) + rs.GROUP_GAP * (len(layout) - 1)
    cursor = -total / 2.0
    dz: dict[int, float] = {}
    for g, members, band_of, layer_rank, z_min, z_max, fan in layout:
        base = cursor - z_min
        for i in members:
            dz[i] = base + layer_rank[band_of[i]] * rs.INTRA_GAP
        cursor += (z_max - z_min) + fan + rs.GROUP_GAP
    return dz, {g: groups[g] for g in order}


def count_tree(item) -> tuple[int, int]:
    """Components and constraints over the whole assembly tree."""
    if isinstance(item, scad.Part):
        return 0, 0
    comps, cons = len(item.component_ids()), len(item.constraint_ids())
    for cid in item.component_ids():
        c, k = count_tree(item.get_component(cid).item)
        comps, cons = comps + c, cons + k
    return comps, cons


def main() -> None:
    t0 = time.perf_counter()
    asm = bldc_export.capture_package()
    t_build = time.perf_counter() - t0
    n_components, n_constraints = len(asm.component_ids()), len(asm.constraint_ids())
    root = scad.materialize_definition(scad.load_product_package(PACKAGE))
    tree_components, tree_constraints = count_tree(root)
    print(f"built in {t_build:.1f}s: {n_components} components, {n_constraints} constraints "
          f"(tree: {tree_components} / {tree_constraints})")
    leaves = []
    rs._flatten(root, (0.0, (0.0, 0.0, 0.0)), leaves)
    placed = [(name, rs._place(part.body, tf)) for name, part, tf in leaves]
    centers = [rs._center(b) for _, b in placed]
    radii = [rs._axis_radius(b) for _, b in placed]
    dz, groups = explode_offsets(placed, centers, radii)
    group_of = {i: g for g, members in groups.items() for i in members}

    entries = []
    for i, (name, body) in enumerate(placed):
        asset = f"leaf_{i:02d}"
        doc = export_solid(body, OUT, asset, {"path": name}, LIN_TOL, ANG_TOL)
        entries.append({
            "name": asset, "path": name,
            "module": group_of.get(i, "housing"),
            "hiddenInExplode": name in rs.HOUSINGS_HIDDEN_IN_EXPLODE,
            "explodeDz": round(dz.get(i, 0.0), 3),
            "axisRadius": round(radii[i], 3),
            "center": [round(centers[i].x, 3), round(centers[i].y, 3), round(centers[i].z, 3)],
        })
        print(f"  {name:<48} {summarize(doc)}  dz={dz.get(i, 0.0):+.1f}")

    write_index(OUT, entries, {
        "components": n_components, "constraints": n_constraints,
        "treeComponents": tree_components, "treeConstraints": tree_constraints, "leaves": len(placed),
        "buildSeconds": round(t_build, 1), "moduleOrder": list(groups),
        "orbitTiltDeg": rs.ORBIT_TILT_DEG,
    })
    print(f"exported {len(placed)} leaves in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
