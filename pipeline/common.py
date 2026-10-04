"""Shared paths for the landing-page asset pipeline.

Run every script with the SimpleCADAPI checkout's interpreter, e.g.
  ../SimpleCADAPI/.venv/bin/python pipeline/export_flange.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEOMETRY = ROOT / "public" / "geometry"
BUILD = ROOT / "pipeline" / "build"
SCA_ROOT = ROOT.parent / "SimpleCADAPI"
SCA_EXAMPLES = SCA_ROOT / "examples"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
