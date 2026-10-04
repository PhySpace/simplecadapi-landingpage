/**
 * Every word on the page. Numbers that describe a model are read from the exported
 * geometry indexes at runtime, not typed here.
 */

export const HERO = {
  kicker: 'SimpleCADAPI 2.2 · OCP-native Python CAD SDK',
  lines: ['Model empowers model.', 'Design becomes design.'],
  body:
    'Language models write real, editable CAD as plain Python: one feature per cell, every ' +
    'dimension a named parameter, every step verified. The model does the operations. ' +
    'You keep the intent.',
  install: 'pip install simplecadapi',
};

export interface ChapterCopy {
  index: string;
  label: string;
  title: string;
  body: string;
}

export const CODE: ChapterCopy = {
  index: '01',
  label: 'Code is the model',
  title: 'The model writes the model.',
  body:
    'A SimpleCAD model is a marimo notebook — a plain .py file and the only source of truth. ' +
    'Each feature is one cell, each dimension a scad.var. An agent edits text; the BRep follows, ' +
    'cell by cell, with a fact card after every step.',
};

export const SELECT: ChapterCopy = {
  index: '02',
  label: 'Select by meaning',
  title: 'Name the edge, not its index.',
  body:
    'Agents cannot click. QL selects topology by what it is — type, length, position — and asserts ' +
    'how many it must find. The faces a fillet makes are tagged, so the next feature asks for ' +
    'fillet.flange_edge, not face #14.',
};

export const VERIFY: ChapterCopy = {
  index: '03',
  label: 'Verifier first',
  title: 'Errors are feedback.',
  body:
    'When the kernel refuses, the SDK says why in numbers: the operation, what it measured, the room ' +
    'it had, and how to fix it. An agent reads it, changes one value, and moves on — no stack-trace ' +
    'archaeology.',
};

export const PARAMS: ChapterCopy = {
  index: '04',
  label: 'Parameters and guards',
  title: 'Change the intent, not the geometry.',
  body:
    'Every dimension is a parameter and every assumption is a guard. Change bolt_count and the ' +
    'notebook rebuilds; push the bolt circle past the rim and the guard refuses before the kernel ' +
    'ever sees it.',
};

export const ASSEMBLY: ChapterCopy = {
  index: '05',
  label: 'Assemblies',
  title: 'Solved, not placed.',
  body:
    'Assemblies are constraints — revolute joints, gear meshes, bearing seats — solved strictly. ' +
    'Gears, bearings and fasteners come from scad.std as real parts. Sub-assemblies are notebooks ' +
    'too, composed with scad.use.',
};

export const SIM: ChapterCopy = {
  index: '06',
  label: 'One source, every solver',
  title: 'Simulation survives the next revision.',
  body:
    'One package exports AP242 STEP, editable FreeCAD and MJCF. Boundary faces keep their ' +
    'interface.* tags through Gmsh into CalculiX, so the load case finds its faces again after ' +
    'every change to the model.',
};

export const COMPOSE: ChapterCopy = {
  index: '07',
  label: 'Notebooks compose',
  title: 'One notebook, many parts.',
  body:
    'scad.use runs a part notebook with its own id and parameters, so one link_bar.py becomes ' +
    'crank, coupler, rocker and ground. The assembly is just another notebook, and a per-cell ' +
    'cache makes every rerun incremental.',
};

export const CLOSE = {
  lines: ['Design', 'becomes design.'],
  body: 'Describe what the part must do. Let the model write, verify and revise the CAD.',
};
