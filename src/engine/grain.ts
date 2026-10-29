/**
 * Film grain (Effects panel): monochrome value noise added to the developed
 * sRGB-encoded image before geometry, so the grain stays attached to the
 * photo when it is cropped or rotated. The noise is a pure function of the
 * full-resolution pixel position (integer hash, fixed seed), so every render
 * of the same settings is identical.
 */

/** Peak offset at Amount 100, in sRGB-encoded units. */
export const GRAIN_STRENGTH = 0.25;
/** Fixed seed: grain is stable between renders and sessions. */
export const GRAIN_SEED = 0x9e3779b9;

export interface GrainParams {
  /** Peak offset, GRAIN_STRENGTH · Amount / 100. */
  amount: number;
  /** Noise cell size in full-resolution pixels: 1 (Size 0) to 5 (Size 100). */
  cell: number;
}

export function grainParams(effects: { grain: number; grainSize: number }): GrainParams | null {
  if (effects.grain <= 0) return null;
  return { amount: (GRAIN_STRENGTH * effects.grain) / 100, cell: 1 + effects.grainSize / 25 };
}

/** 32-bit integer hash ("lowbias32", C. Wellons); identical in GLSL with uint math. */
export function hash32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Random value in [−1, 1] at an integer lattice point (24 bits, exact in float32). */
export function latticeValue(ix: number, iy: number): number {
  const h = hash32((ix + hash32((iy + GRAIN_SEED) >>> 0)) >>> 0);
  return ((h >>> 8) / 16777215) * 2 - 1;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [−1, 1] at a continuous position (lattice units). */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const top = latticeValue(ix, iy) * (1 - fx) + latticeValue(ix + 1, iy) * fx;
  const bottom = latticeValue(ix, iy + 1) * (1 - fx) + latticeValue(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Grain offset for the pixel (x, y) of an image rendered at `scale` of full
 * resolution. Positions are measured in full-resolution pixels so a proxy
 * samples the same grain field.
 */
export function grainOffset(x: number, y: number, p: GrainParams, scale = 1): number {
  const fx = (x + 0.5) / scale / p.cell;
  const fy = (y + 0.5) / scale / p.cell;
  return p.amount * valueNoise(fx, fy);
}
