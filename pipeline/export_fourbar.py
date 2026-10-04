#!/usr/bin/env python3
"""Four-bar linkage: one part notebook, four family members, plus the pivot bolt.

Each link is ``link_bar.py`` run under its own id with its own CENTER_DISTANCE,
exactly as the assembly notebook's ``scad.use("link_bar.py", id=..., ...)``
calls do. Local frame: pivot_a at the origin, the bar along +X. The page
places them with the closed-form four-bar solution.
"""
from __future__ import annotations

import sys

from simplecadapi.runtime import run_notebook

from cad_export import export_solid, summarize
from common import GEOMETRY, SCA_EXAMPLES, write_json

EXAMPLE = SCA_EXAMPLES / "four_bar_linkage"
sys.path.insert(0, str(EXAMPLE))
import dimensions as dim  # noqa: E402

OUT = GEOMETRY / "fourbar"
LIN, ANG = 0.05, 0.2
LINKS = {"ground_span": dim.GROUND_LENGTH, "crank": dim.CRANK_LENGTH,
         "coupler": dim.COUPLER_LENGTH, "rocker": dim.ROCKER_LENGTH}


def main() -> None:
    links = []
    for link_id, length in LINKS.items():
        run = run_notebook(EXAMPLE / "link_bar.py", id=link_id, overrides={"CENTER_DISTANCE": length})
        part = run.product
        doc = export_solid(part.body, OUT, link_id, {"part_id": part.part_id, "center_distance": length}, LIN, ANG)
        links.append({"asset": link_id, "part_id": part.part_id, "center_distance": length,
                      "faces": doc["stats"]["faces"], "volume": doc["stats"]["volume_mm3"]})
        print(" ", summarize(doc), part.part_id)
    bolt = run_notebook(EXAMPLE / "pivot_bolt.py").product
    doc = export_solid(bolt.body, OUT, "pivot_bolt", {"part_id": bolt.part_id}, LIN, ANG)
    print(" ", summarize(doc))
    asm = run_notebook(EXAMPLE / "four_bar_linkage.py").product
    write_json(OUT / "index.json", {
        "notebook": "examples/four_bar_linkage/four_bar_linkage.py",
        "links": links, "bolt": "pivot_bolt",
        "components": len(asm.component_ids()), "constraints": len(asm.constraint_ids()),
        "barThickness": dim.BAR_THICKNESS,
        "lengths": {"ground": dim.GROUND_LENGTH, "crank": dim.CRANK_LENGTH,
                    "coupler": dim.COUPLER_LENGTH, "rocker": dim.ROCKER_LENGTH},
    })


if __name__ == "__main__":
    main()
