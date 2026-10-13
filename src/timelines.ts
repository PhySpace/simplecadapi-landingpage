import { ramp, smooth } from './math';

/**
 * How each chapter spends its scroll progress. The DOM and the 3D stage read the same
 * functions, so the highlighted line of code and the model always agree.
 */

/** 01: which of the six feature cells has run */
export const codeStage = (p: number) => Math.min(5, Math.floor(ramp(p, 0.04, 0.94) * 6));

/** 02: QL filter steps, then the fillet and its tag */
export const SELECT_STEPS = [0, 0.16, 0.32, 0.48, 0.68] as const;
export const selectStep = (p: number) => {
  let s = 0;
  SELECT_STEPS.forEach((t, i) => {
    if (p >= t) s = i;
  });
  return s;
};

/** 03: 0 attempt + raise, 1 read the measurement, 2 retried and passed */
export const verifyPhase = (p: number) => (p < 0.3 ? 0 : p < 0.58 ? 1 : 2);

/** 04: variant index, or -1 for the rejected bolt circle */
export const paramsStep = (p: number, n: number) => (p >= 0.84 ? -1 : Math.min(n - 1, Math.floor(ramp(p, 0.02, 0.82) * n)));

/** 05: 0 assembled .. 1 exploded */
export const explode = (p: number) => smooth(p, 0.18, 0.72);

/** 06: tags -> field -> exaggerated displacement */
export const simField = (p: number) => smooth(p, 0.3, 0.44);
export const simDeform = (p: number) => smooth(p, 0.52, 0.9);

/** 07: crank angle (radians) and the active scad.use line */
export const crankAngle = (p: number) => p * Math.PI * 4;
export const COMPOSE_LINKS = ['ground_span', 'crank', 'coupler', 'rocker'] as const;
export const composeActive = (p: number) => Math.min(3, Math.floor(ramp(p, 0.02, 0.9) * 4));

/** displacement scale: ~6 mm of visible sag at full exaggeration (also the page readout) */
export const exaggeration = (p: number, dispMax: number) => (simDeform(p) * 6) / dispMax;

/** the interface tags the load case reads */
export const LOAD_CASE_TAGS = ['interface.fixed_support', 'interface.load_surface'];
