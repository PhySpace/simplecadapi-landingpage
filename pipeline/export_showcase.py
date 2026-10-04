#!/usr/bin/env python3
"""Hero showcase: finished products from the repository's examples, one notebook run each.

A part exports its body. An assembly is walked through its components: every
distinct leaf body is exported once (in its own frame) and placed by instance
matrices composed from the solved component placements, so the page draws the
product exactly where the solver put each part.

Output: public/geometry/showcase/<product>/<leaf>.* + public/geometry/showcase/index.json
Instance matrices are 4x4, column-major, in the page frame (x, z, -y of CAD), mm.
"""
from __future__ import annotations

import sys
import time

import numpy as np

import simplecadapi as scad
from simplecadapi.runtime import run_notebook

from cad_export import export_solid
from common import GEOMETRY, SCA_EXAMPLES, write_json

OUT = GEOMETRY / "showcase"

# (key, notebook, title, linear tolerance)
PRODUCTS = [
    ("flange_plate", "flange_plate/flange_plate.py", "Flange plate", 0.08),
    ("u_link_motor_mount", "u_link_motor_mount/u_link_motor_mount.py", "U-link motor mount", 0.1),
    ("l_link_motor_mount", "l_link_motor_mount/l_link_motor_mount.py", "L-link motor mount", 0.1),
    ("planetary_reducer", "compact_two_stage_planetary_reducer/compact_two_stage_planetary_reducer.py",
     "Two-stage planetary reducer", 0.12),
    ("hydraulic_rod", "hydraulic_rod_assembly/hydraulic_rod_assembly.py", "Hydraulic rod assembly", 0.1),
    ("arc_handle", "arc_handle/arc_handle.py", "Arched handle", 0.08),
    ("caplcd_enclosure", "caplcd_enclosure/caplcd_enclosure.py", "LCD enclosure", 0.08),
]

# page = P cad, P maps (x, y, z) -> (x, z, -y)
P = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float)
P_INV = np.linalg.inv(P)


def placement_matrix(pl) -> np.ndarray:
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = pl.x_axis, pl.y_axis, pl.z_axis, pl.origin
    return m


def walk(item, world: np.ndarray, path: str, out: list) -> None:
    if isinstance(item, scad.Part):
        out.append((path or item.part_id, item, world))
        return
    for cid in item.component_ids():
        comp = item.get_component(cid)
        walk(comp.item, world @ placement_matrix(comp.placement), f"{path}/{cid}", out)


def export_product(key: str, notebook: str, title: str, tol: float) -> dict:
    t0 = time.perf_counter()
    run = run_notebook(SCA_EXAMPLES / notebook)
    leaves: list = []
    walk(run.product, np.eye(4), "", leaves)
    out_dir = OUT / key
    assets: dict[int, str] = {}
    instances = []
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    faces = 0
    for path, part, world in leaves:
        body = part.body
        ident = id(body)
        if ident not in assets:
            name = f"leaf_{len(assets):02d}"
            doc = export_solid(body, out_dir, name, {"part_id": part.part_id}, tol, 0.25)
            assets[ident] = name
            faces += doc["stats"]["faces"]
        page = P @ world @ P_INV
        doc_bounds = _bounds(out_dir / f"{assets[ident]}.json")
        corners = np.array([[x, y, z, 1] for x in doc_bounds[0::3] for y in doc_bounds[1::3] for z in doc_bounds[2::3]])
        w = (page @ corners.T).T[:, :3]
        lo, hi = np.minimum(lo, w.min(0)), np.maximum(hi, w.max(0))
        instances.append({"asset": assets[ident], "path": path,
                          "matrix": [round(v, 6) for v in page.T.reshape(-1)]})
    kind = "part" if isinstance(run.product, scad.Part) else "assembly"
    entry = {
        "key": key, "title": title, "notebook": f"examples/{notebook}", "kind": kind,
        "parts": len(leaves), "assets": len(assets), "instances": instances,
        "bounds": {"min": lo.tolist(), "max": hi.tolist(), "center": ((lo + hi) / 2).tolist(),
                   "radius": float(np.linalg.norm(hi - lo) / 2)},
    }
    if kind == "assembly":
        entry["components"] = len(run.product.component_ids())
        entry["constraints"] = len(run.product.constraint_ids())
    print(f"  {key}: {kind}, {len(leaves)} parts, {len(assets)} meshes, {time.perf_counter() - t0:.1f}s")
    return entry


def _bounds(json_path) -> list[float]:
    import json
    b = json.loads(json_path.read_text())["bounds"]
    # x-, y-, z- interleaved pairs for the corner product above: [xmin, ymin, zmin, xmax, ymax, zmax]
    return [b["min"][0], b["min"][1], b["min"][2], b["max"][0], b["max"][1], b["max"][2]]


def main() -> None:
    only = set(sys.argv[1:])
    entries = []
    for key, nb, title, tol in PRODUCTS:
        if only and key not in only:
            continue
        try:
            entries.append(export_product(key, nb, title, tol))
        except Exception as exc:  # keep the others; report the failure
            print(f"  {key}: FAILED {type(exc).__name__}: {exc}")
    index = OUT / "index.json"
    if only and index.exists():
        import json
        old = {e["key"]: e for e in json.loads(index.read_text())["products"]}
        old.update({e["key"]: e for e in entries})
        entries = [old[k] for k, *_ in PRODUCTS if k in old]
    write_json(index, {"products": entries})


if __name__ == "__main__":
    main()
