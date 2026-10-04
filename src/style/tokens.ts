/**
 * The page's palette. Black and white carry everything; a colour appears only where it
 * carries one meaning (the physpace-promo INK system), plus the FEM ramp, which is data.
 */
export const WHITE = '#ffffff';
export const BLACK = '#000000';

export const INK = {
  /** what to look at now: the active cell, a selection, a tag */
  focus: '#ff9a2e',
  /** accepted, resolved, solved */
  pass: '#3ddc84',
  /** rejected, raised, failing */
  fail: '#ff4d5e',
  /** a named parameter (scad.var) */
  name: '#4aa3ff',
} as const;

/** von Mises, low to high: eight bands, dithered between neighbours */
export const FEM_RAMP = [
  '#2346d8',
  '#1f8fe8',
  '#22c7d6',
  '#3fdc8f',
  '#b6e23a',
  '#ffd23a',
  '#ff8a2e',
  '#ff3b4e',
] as const;

/** CSS px per GL cell: the canvas renders at 1/CELL and is shown pixelated */
export const CELL = 2;

export const GITHUB_REPO = 'PhySpace/SimpleCADAPI';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const PYPI_URL = 'https://pypi.org/project/simplecadapi/';
export const PAPER_URL = 'https://arxiv.org/abs/2608.00891';
export const DOCS_URL = `${GITHUB_URL}/tree/master/docs`;
