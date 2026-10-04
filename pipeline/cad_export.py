"""Solid -> compact mesh asset for the landing page (adapted from physpace-promo).

Uses the SDK's own scene tessellation (scene/render_mesh.py) so the page
shows exactly the triangles and BRep edges the SDK viewer would show.

Asset layout (one JSON + one little-endian binary blob per solid):
  <name>.json  {faces:[{i,tags,area,first,count}], edges:[...], buffers:{...}, bounds, stats}
  <name>.bin   positions i16 | normals i8 | indices u16/u32 | linePositions i16 | lineIndices u16/u32
Positions are quantized over the asset's bounds (buffers.*.quant: value = min + q * step,
q in 0..65535 stored as int16 - 32768); normals are round(127 n). Every chunk starts
on a 4-byte boundary.
Coordinates are millimetres, three.js convention (+Y up): (x, z, -y) of CAD.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

from simplecadapi import ql
from simplecadapi.scene.render_mesh import build_edge_mesh, build_render_mesh

from common import write_json

LINEAR_TOL = 0.05
ANGULAR_TOL = 0.08


def _ql_prop(obj, path: str):
    """The exact property value QL's where() sees (so the page can replay a filter)."""
    v = ql._lookup_property(obj, path)
    if v is ql.MISSING:
        return None
    return round(v, 4) if isinstance(v, float) else v


def _faces(solid):
    return list(solid._iter_faces())


def _edges(solid):
    return list(solid._iter_edges())


def face_indices(solid, faces: Iterable) -> list[int]:
    """Indices (in solid._iter_faces order) of the given Face objects."""
    order = {f.topo_id: i for i, f in enumerate(_faces(solid))}
    return sorted(order[f.topo_id] for f in faces)


def edge_indices(solid, edges: Iterable) -> list[int]:
    order = {e.topo_id: i for i, e in enumerate(_edges(solid))}
    return sorted(order[e.topo_id] for e in edges)


def faces_with_tag(solid, tag: str) -> list[int]:
    return [i for i, f in enumerate(_faces(solid)) if tag in f._list_tags()]


def export_solid(solid, out_dir: Path, name: str, meta: dict | None = None,
                 linear_tol: float = LINEAR_TOL, angular_tol: float = ANGULAR_TOL) -> dict:
    faces, edges = _faces(solid), _edges(solid)
    face_ids = [f"f{i}" for i in range(len(faces))]
    edge_ids = [f"e{i}" for i in range(len(edges))]
    rm = build_render_mesh(solid, face_entity_ids=face_ids,
                           linear_tolerance=linear_tol, angular_tolerance=angular_tol)
    em = build_edge_mesh(solid, edge_entity_ids=edge_ids,
                         linear_tolerance=linear_tol, angular_tolerance=angular_tol)

    pos = np.asarray(rm.positions, np.float32) * 1000.0
    nrm = np.asarray(rm.normals, np.float32)
    idx = np.asarray(rm.indices, np.uint32)
    lpos = np.asarray(em.positions, np.float32).reshape(-1, 3) * 1000.0
    lidx = np.asarray(em.indices, np.uint32)

    both = np.concatenate([pos, lpos]) if len(lpos) else pos
    lo, hi = both.min(0), both.max(0)
    buffers, blob = encode_buffers(pos, nrm, idx, lpos, lidx, lo, hi)

    fgroups = {g.entity_id: g for g in rm.groups}
    egroups = {g.entity_id: g for g in em.groups}
    face_meta = []
    for i, f in enumerate(faces):
        g = fgroups[face_ids[i]]
        face_meta.append({"i": i, "tags": sorted(f._list_tags()), "area": round(f.get_area(), 4),
                          "first": g.first_index, "count": g.index_count})
    edge_meta = []
    for i, e in enumerate(edges):
        g = egroups.get(edge_ids[i])
        edge_meta.append({"i": i, "tags": sorted(e._list_tags()), "length": round(e.get_length(), 4),
                          "type": _ql_prop(e, "geom.type"), "cz": _ql_prop(e, "geom.center.z"),
                          "first": g.first_index if g else 0, "count": g.index_count if g else 0})

    doc = {
        "name": name,
        "bin": f"{name}.bin",
        "buffers": buffers,
        "bounds": {"min": lo.tolist(), "max": hi.tolist(), "center": ((lo + hi) / 2).tolist(),
                   "radius": float(np.linalg.norm(hi - lo) / 2)},
        "faces": face_meta,
        "edges": edge_meta,
        "stats": {"faces": len(faces), "edges": len(edges), "triangles": int(idx.size // 3),
                  "volume_mm3": round(float(solid.get_volume()), 3)},
        "meta": meta or {},
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{name}.bin").write_bytes(blob)
    write_json(out_dir / f"{name}.json", doc)
    return doc


def _quantize(p: np.ndarray, lo: np.ndarray, step: np.ndarray) -> np.ndarray:
    q = np.rint((p - lo) / step)
    return (np.clip(q, 0, 65535) - 32768).astype(np.int16)


def encode_buffers(pos, nrm, idx, lpos, lidx, lo, hi) -> tuple[dict, bytes]:
    """The compact binary layout above; returns (buffer descriptors, blob)."""
    lo = np.asarray(lo, np.float64)
    step = np.maximum((np.asarray(hi, np.float64) - lo) / 65535.0, 1e-9)
    quant = {"min": lo.tolist(), "step": step.tolist()}
    nv, nl = len(pos), len(lpos)
    parts = [
        ("positions", _quantize(np.asarray(pos, np.float64), lo, step), "i16", quant),
        ("normals", np.rint(np.clip(np.asarray(nrm, np.float64), -1, 1) * 127).astype(np.int8), "i8", None),
        ("indices", np.asarray(idx, np.uint16 if nv < 65536 else np.uint32), "u16" if nv < 65536 else "u32", None),
        ("linePositions", _quantize(np.asarray(lpos, np.float64).reshape(-1, 3), lo, step), "i16", quant),
        ("lineIndices", np.asarray(lidx, np.uint16 if nl < 65536 else np.uint32), "u16" if nl < 65536 else "u32", None),
    ]
    chunks, buffers, offset = [], {}, 0
    for key, arr, kind, q in parts:
        data = np.ascontiguousarray(arr).tobytes()
        buffers[key] = {"offset": offset, "length": int(arr.size), "type": kind, **({"quant": q} if q else {})}
        pad = (-len(data)) % 4
        chunks.append(data + b"\0" * pad)
        offset += len(data) + pad
    return buffers, b"".join(chunks)


def summarize(doc: dict) -> str:
    s = doc["stats"]
    return f"{doc['name']}: {s['faces']} faces, {s['edges']} edges, {s['triangles']} tris, V={s['volume_mm3']:.0f} mm3"


def write_index(out_dir: Path, entries: Sequence[dict], extra: dict | None = None) -> None:
    write_json(out_dir / "index.json", {"assets": list(entries), **(extra or {})})
