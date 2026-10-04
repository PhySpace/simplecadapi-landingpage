#!/usr/bin/env python3
"""Flange plate: the six feature stages, the QL selections, and bolt-pattern variants.

Runs examples/flange_plate/flange_plate.py through the notebook runtime, so the
stages are the notebook's own cell values. Variants override the bolt-pattern
cell with plain numbers (all three of its variables, defect 3) and run without
the cell cache (defect 9 does not bite numbers, but variants are cheap).
"""
from __future__ import annotations

import math

from simplecadapi import ql
from simplecadapi.runtime import run_notebook

from cad_export import edge_indices, export_solid, summarize
from common import GEOMETRY, SCA_EXAMPLES, write_json

NOTEBOOK = SCA_EXAMPLES / "flange_plate" / "flange_plate.py"
OUT = GEOMETRY / "flange"
LIN, ANG = 0.08, 0.2

STAGES = [
    ("flange_disc", "flange-disc", "build"),
    ("center_boss", "center-boss", "add"),
    ("center_bore", "center-bore", "subtract"),
    ("bolt_holes", "bolt-holes", "subtract"),
    ("boss_root_fillet", "boss-root-fillet", "modify"),
    ("flange_edge_fillets", "flange-edge-fillets", "modify"),
]

# (bolt_count, bolt_pcd) steps for the parameter chapter; bolt_d stays 11
VARIANTS = [(4, 84.5), (6, 78.0), (6, 84.5), (8, 84.5), (10, 84.5), (12, 84.5)]
REJECTED = (8, 88.0)


def root_selector(t: float, boss_od: float):
    return ql.edges().where(ql.and_(
        ql.prop("geom.type", "==", "CIRCLE"),
        ql.prop("geom.center.z", ">=", t - 0.1),
        ql.prop("geom.center.z", "<=", t + 0.1),
        ql.prop("geom.length", ">=", math.pi * boss_od - 0.5),
        ql.prop("geom.length", "<=", math.pi * boss_od + 0.5),
    ))


def rim_selector(t: float, od: float):
    return ql.edges().where(ql.and_(
        ql.prop("geom.type", "==", "CIRCLE"),
        ql.prop("geom.length", ">=", math.pi * od - 0.5),
        ql.prop("geom.length", "<=", math.pi * od + 0.5),
        ql.or_(
            ql.and_(ql.prop("geom.center.z", ">=", -0.1), ql.prop("geom.center.z", "<=", 0.1)),
            ql.and_(ql.prop("geom.center.z", ">=", t - 0.1), ql.prop("geom.center.z", "<=", t + 0.1)),
        ),
    ))


def main() -> None:
    run = run_notebook(NOTEBOOK)
    v = run.values
    t, od, boss_od = float(v["FLANGE_T"]), float(v["FLANGE_OD"]), float(v["BOSS_OD"])

    stages = []
    for i, (name, slug, kind) in enumerate(STAGES):
        body = v[name]
        doc = export_solid(body, OUT, f"stage_{i}", {"slug": slug, "kind": kind}, LIN, ANG)
        stages.append({"asset": f"stage_{i}", "slug": slug, "kind": kind,
                       "faces": doc["stats"]["faces"], "volume": doc["stats"]["volume_mm3"]})
        print(" ", summarize(doc))

    # QL evidence: the edges each fillet selects, as indices into the stage it reads
    selections = {
        "boss-root-fillet": {
            "stage": "stage_3",
            "edges": edge_indices(v["bolt_holes"], root_selector(t, boss_od).resolve(v["bolt_holes"])),
            "candidates": len(ql.edges().resolve(v["bolt_holes"])),
            "circles": len(ql.edges().where(ql.prop("geom.type", "==", "CIRCLE")).resolve(v["bolt_holes"])),
        },
        "flange-edge-fillets": {
            "stage": "stage_4",
            "edges": edge_indices(v["boss_root_fillet"], rim_selector(t, od).resolve(v["boss_root_fillet"])),
            "candidates": len(ql.edges().resolve(v["boss_root_fillet"])),
            "circles": len(ql.edges().where(ql.prop("geom.type", "==", "CIRCLE")).resolve(v["boss_root_fillet"])),
        },
    }

    variants = []
    for count, pcd in VARIANTS:
        r = run_notebook(NOTEBOOK, overrides={"BOLT_COUNT": count, "BOLT_D": 11.0, "BOLT_PCD": pcd},
                         cache=False)
        name = f"bolts_{count}_pcd_{str(pcd).replace('.', '_')}"
        doc = export_solid(r.values["flange_edge_fillets"], OUT, name,
                           {"bolt_count": count, "bolt_pcd": pcd}, LIN, ANG)
        variants.append({"asset": name, "bolt_count": count, "bolt_pcd": pcd,
                         "faces": doc["stats"]["faces"], "volume": doc["stats"]["volume_mm3"],
                         "web": round(od / 2 - pcd / 2 - 11.0 / 2, 3)})
        print(" ", summarize(doc))

    try:
        run_notebook(NOTEBOOK, overrides={"BOLT_COUNT": REJECTED[0], "BOLT_D": 11.0,
                                          "BOLT_PCD": REJECTED[1]}, cache=False)
        rejected = None
    except Exception as exc:  # the notebook's feasibility guard
        rejected = {"bolt_count": REJECTED[0], "bolt_pcd": REJECTED[1],
                    "error": type(exc).__name__, "message": str(exc).splitlines()[0]}
    print("rejected:", rejected)

    write_json(OUT / "index.json", {
        "notebook": "examples/flange_plate/flange_plate.py",
        "params": {"flange_od": od, "flange_t": t, "boss_od": boss_od,
                   "bore_d": float(v["BORE_D"]), "bolt_d": float(v["BOLT_D"]),
                   "bolt_pcd": float(v["BOLT_PCD"]), "bolt_count": int(float(v["BOLT_COUNT"]))},
        "stages": stages,
        "selections": selections,
        "variants": variants,
        "rejected": rejected,
    })


if __name__ == "__main__":
    main()
