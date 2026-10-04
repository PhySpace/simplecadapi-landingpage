#!/usr/bin/env python3
"""Re-encode assets written in the old f32/u32 layout into cad_export's compact one.

    python pipeline/requantize.py public/geometry/bldc public/geometry/fillet_error
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from cad_export import encode_buffers
from common import write_json


def convert(json_path: Path) -> bool:
    doc = json.loads(json_path.read_text())
    if "buffers" not in doc or "positions" not in doc["buffers"]:
        return False
    if doc["buffers"]["positions"]["type"] != "f32":
        return False
    raw = (json_path.parent / doc["bin"]).read_bytes()

    def arr(key):
        b = doc["buffers"][key]
        dtype = np.float32 if b["type"] == "f32" else np.uint32
        return np.frombuffer(raw, dtype, b["length"], b["offset"])

    pos, nrm = arr("positions").reshape(-1, 3), arr("normals").reshape(-1, 3)
    lpos = arr("linePositions").reshape(-1, 3)
    both = np.concatenate([pos, lpos]) if len(lpos) else pos
    buffers, blob = encode_buffers(pos, nrm, arr("indices"), lpos, arr("lineIndices"),
                                   both.min(0), both.max(0))
    doc["buffers"] = buffers
    (json_path.parent / doc["bin"]).write_bytes(blob)
    write_json(json_path, doc)
    return True


if __name__ == "__main__":
    n = 0
    for d in sys.argv[1:]:
        for p in sorted(Path(d).glob("*.json")):
            n += convert(p)
    print(f"re-encoded {n} assets")
