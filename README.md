# SimpleCADAPI landing page

Vite + React + three.js (`WebGPURenderer`, TSL materials; WebGL2 fallback). Every model on
the page is exported from the SimpleCADAPI repository's own example notebooks.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/
```

Debug switches: `?at=<chapter>:<progress>` jumps to a chapter (`?at=sim:0.8`), `?only=hero,code`
limits the 3D stages, `?nobg` drops the ripple field, `?nogl` runs the page without a renderer.

## Geometry pipeline

`pipeline/` runs against a sibling `../SimpleCADAPI` checkout and writes `public/geometry/`.

```bash
PY=../SimpleCADAPI/.venv/bin/python
$PY pipeline/export_showcase.py   # hero: finished products (parts and assemblies)
$PY pipeline/export_flange.py     # chapters 01, 02, 04: stages, QL selections, variants
$PY pipeline/export_bldc.py       # chapter 05: BLDC actuator leaves + explode offsets
$PY pipeline/export_fourbar.py    # chapter 07: link_bar.py under four ids

# chapter 06 needs gmsh and a ccx binary (brew install costerwi/homebrew-calculix/calculix-ccx)
uv venv pipeline/.venv --python 3.10 && uv pip install -p pipeline/.venv -e "../SimpleCADAPI[gmsh]"
pipeline/.venv/bin/python pipeline/export_fem.py
```

`public/geometry/fillet_error/` (chapter 03) comes from physpace-promo; `pipeline/requantize.py`
converts assets in the older f32 layout to the compact one `cad_export.py` writes.
