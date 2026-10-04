export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 over [a, b] */
export const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
export const smooth = (v: number, a: number, b: number) => {
  const t = ramp(v, a, b);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** quantize 0..1 to n steps: stepped motion reads better at cell resolution */
export const steps = (v: number, n: number) => Math.floor(clamp01(v) * n) / n;
