import type { Geometry } from '../model/editSettings';
import { applyVignette, vignetteMask } from './vignette';

/**
 * Geometry stage (last in the pipeline): crop, straighten, rotate and flip.
 * Each output pixel is mapped back to a continuous source position with an
 * affine matrix and bilinearly sampled from the developed (8-bit) image.
 *
 * Coordinate spaces, all in pixels with y down:
 *   output   the cropped result, outW × outH
 *   oriented the source after quarter turns and flips (Wo × Ho); the crop
 *            rect and straighten live here
 *   source   the uploaded image (W × H)
 */

export interface Size {
  width: number;
  height: number;
}

/** x' = a·x + b·y + c,  y' = d·x + e·y + f */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 0, 1, 0];

/** (A ∘ B)(p) = A(B(p)) */
export function compose(A: Affine, B: Affine): Affine {
  const [a, b, c, d, e, f] = A;
  const [g, h, i, j, k, l] = B;
  return [a * g + b * j, a * h + b * k, a * i + b * l + c, d * g + e * j, d * h + e * k, d * i + e * l + f];
}

/** Inverse of an affine map (identity if singular). */
export function invertAffine(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * e - b * d;
  if (det === 0) return IDENTITY;
  return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det];
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

export function orientedSize(src: Size, rotation: number): Size {
  return rotation % 2 === 1 ? { width: src.height, height: src.width } : { width: src.width, height: src.height };
}

/** Pixel size of the cropped output for a source of the given size. */
export function outputSize(src: Size, g: Geometry): Size {
  const o = orientedSize(src, g.rotation);
  return {
    width: Math.max(1, Math.round(g.cropRect.w * o.width)),
    height: Math.max(1, Math.round(g.cropRect.h * o.height)),
  };
}

export function isIdentityGeometry(g: Geometry): boolean {
  const c = g.cropRect;
  return c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && g.angle === 0 && g.rotation === 0 && !g.flipH && !g.flipV && lensParams(g) === null;
}

/**
 * Lens and perspective (M29), in the oriented image (after quarter turns
 * and flips, before straighten and crop), so "vertical" is the photo's
 * visual vertical and the crop works on the corrected image. In centered
 * coordinates normalized by half the long edge (u right, w down), an
 * output-side position maps to the photo as:
 *
 *   scale:        (u, w) / scale
 *   perspective:  (u, w) / (1 − a·w − b·u)     (a projective map: lines stay straight)
 *   distortion:   (u, w) · (1 − k·ρ²)          (ρ = radius / half diagonal)
 *
 * Fringe samples the red and blue channels at positions scaled about the
 * center by (1 + fringe), fixing lateral color fringes; they clamp at the
 * photo's edges instead of turning transparent.
 */
export interface LensParams {
  /** Inverse of the Scale slider (1 = 100 %). */
  invScale: number;
  /** Vertical and horizontal perspective. */
  a: number;
  b: number;
  /** Distortion: positive removes barrel distortion, negative pincushion. */
  k: number;
  fringeRed: number;
  fringeBlue: number;
}

export const LENS_LIMITS = { perspective: 0.5, distortion: 0.3, fringe: 0.004 } as const;
/** Below this perspective denominator a position is behind the horizon: transparent. */
export const MIN_PERSPECTIVE_DEN = 0.05;

export function lensParams(g: Pick<Geometry, 'distortion' | 'vertical' | 'horizontal' | 'scale' | 'fringeRed' | 'fringeBlue'>): LensParams | null {
  if (g.distortion === 0 && g.vertical === 0 && g.horizontal === 0 && g.scale === 100 && g.fringeRed === 0 && g.fringeBlue === 0) return null;
  return {
    invScale: 100 / g.scale,
    a: (g.vertical / 100) * LENS_LIMITS.perspective,
    b: (g.horizontal / 100) * LENS_LIMITS.perspective,
    k: (g.distortion / 100) * LENS_LIMITS.distortion,
    fringeRed: (g.fringeRed / 100) * LENS_LIMITS.fringe,
    fringeBlue: (g.fringeBlue / 100) * LENS_LIMITS.fringe,
  };
}

/** Oriented position on the output side → oriented position in the photo; null when behind the horizon. */
export function lensMap(lens: LensParams, o: Size, x: number, y: number): [number, number] | null {
  const h = Math.max(o.width, o.height) / 2;
  const cx = o.width / 2;
  const cy = o.height / 2;
  let u = ((x - cx) / h) * lens.invScale;
  let w = ((y - cy) / h) * lens.invScale;
  const den = 1 - lens.a * w - lens.b * u;
  if (den < MIN_PERSPECTIVE_DEN) return null;
  u /= den;
  w /= den;
  const f = 1 - lens.k * (u * u + w * w) * halfDiagonal2(o, h);
  return [cx + u * f * h, cy + w * f * h];
}

/** 1 / (half diagonal / half long edge)². */
function halfDiagonal2(o: Size, h: number): number {
  return (h * h) / ((o.width / 2) ** 2 + (o.height / 2) ** 2);
}

/** Scales an oriented position about the center (fringe correction for one channel). */
export function fringePoint(o: Size, x: number, y: number, amount: number): [number, number] {
  return [o.width / 2 + (x - o.width / 2) * (1 + amount), o.height / 2 + (y - o.height / 2) * (1 + amount)];
}

/**
 * How output pixels find their photo position. Without lens corrections
 * `before` already maps output → source (the single geometry matrix);
 * with them, `before` maps output → oriented, then lensMap, then `after`.
 */
export interface GeometryMap {
  before: Affine;
  after: Affine;
  lens: LensParams | null;
  oriented: Size;
}

export function geometryMap(src: Size, g: Geometry, out: Size = outputSize(src, g)): GeometryMap {
  const o = orientedSize(src, g.rotation);
  const lens = lensParams(g);
  if (!lens) return { before: geometryMatrix(src, g, out), after: IDENTITY, lens: null, oriented: o };
  return { before: outputToOriented(o, g, out), after: orientationToSource(src, g), lens, oriented: o };
}

/** Output pixel position → source pixel position; null when it falls behind the horizon. */
export function outputToSource(map: GeometryMap, x: number, y: number): [number, number] | null {
  const [ox, oy] = applyAffine(map.before, x, y);
  if (!map.lens) return [ox, oy];
  const q = lensMap(map.lens, map.oriented, ox, oy);
  return q ? applyAffine(map.after, q[0], q[1]) : null;
}

/** Source pixel position → output pixel position (lensMap inverted by Newton steps); null if not found. */
export function sourceToOutput(map: GeometryMap, x: number, y: number): [number, number] | null {
  if (!map.lens) return applyAffine(invertAffine(map.before), x, y);
  const lens = map.lens;
  const [qx, qy] = applyAffine(invertAffine(map.after), x, y);
  let px = qx;
  let py = qy;
  const e = 0.5;
  for (let i = 0; i < 12; i++) {
    const f = lensMap(lens, map.oriented, px, py);
    const fx = lensMap(lens, map.oriented, px + e, py);
    const fy = lensMap(lens, map.oriented, px, py + e);
    if (!f || !fx || !fy) return null;
    const rx = f[0] - qx;
    const ry = f[1] - qy;
    if (Math.hypot(rx, ry) < 1e-6) break;
    // Jacobian by finite differences, then one Newton step.
    const j00 = (fx[0] - f[0]) / e;
    const j10 = (fx[1] - f[1]) / e;
    const j01 = (fy[0] - f[0]) / e;
    const j11 = (fy[1] - f[1]) / e;
    const det = j00 * j11 - j01 * j10;
    if (det === 0) return null;
    px -= (j11 * rx - j01 * ry) / det;
    py -= (-j10 * rx + j00 * ry) / det;
  }
  return applyAffine(invertAffine(map.before), px, py);
}

/** Oriented pixel → source pixel: undo the flips, then the quarter turns. */
function orientationToSource(src: Size, g: Geometry): Affine {
  const o = orientedSize(src, g.rotation);
  const unflip: Affine = [g.flipH ? -1 : 1, 0, g.flipH ? o.width : 0, 0, g.flipV ? -1 : 1, g.flipV ? o.height : 0];
  const W = src.width;
  const H = src.height;
  // Clockwise turn r maps source (x, y) to oriented; these are the inverses.
  const unrotate: Affine[] = [
    [1, 0, 0, 0, 1, 0],
    [0, 1, 0, -1, 0, H], // r=1: xs = yo, ys = H - xo
    [-1, 0, W, 0, -1, H], // r=2
    [0, -1, W, 1, 0, 0], // r=3: xs = W - yo, ys = xo
  ];
  return compose(unrotate[g.rotation] ?? IDENTITY, unflip);
}

/** Straighten: the image turns by `angle` (clockwise) about the oriented center. */
function straightenInverse(o: Size, angleDeg: number): Affine {
  if (angleDeg === 0) return IDENTITY;
  const t = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = o.width / 2;
  const cy = o.height / 2;
  return [cos, -sin, cx - cos * cx + sin * cy, sin, cos, cy - sin * cx - cos * cy];
}

/** Output pixel coordinates → oriented pixel coordinates: crop, then straighten. */
function outputToOriented(o: Size, g: Geometry, out: Size): Affine {
  const c = g.cropRect;
  const toOriented: Affine = [(c.w * o.width) / out.width, 0, c.x * o.width, 0, (c.h * o.height) / out.height, c.y * o.height];
  return compose(straightenInverse(o, g.angle), toOriented);
}

/**
 * Output pixel coordinates → source pixel coordinates (continuous, pixel
 * centers at +0.5), without lens corrections (see geometryMap for those).
 */
export function geometryMatrix(src: Size, g: Geometry, out: Size = outputSize(src, g)): Affine {
  const o = orientedSize(src, g.rotation);
  return compose(orientationToSource(src, g), outputToOriented(o, g, out));
}

/**
 * Samples an RGBA8 image at a continuous position. Outside the image the
 * result is transparent; within it, edges clamp. Mirrors the GLSL exactly
 * (same lerp order).
 */
export function sampleBilinear(data: Uint8Array | Uint8ClampedArray, W: number, H: number, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x > W || y > H) return [0, 0, 0, 0];
  const u = x - 0.5;
  const v = y - 0.5;
  const i0f = Math.floor(u);
  const j0f = Math.floor(v);
  const fx = u - i0f;
  const fy = v - j0f;
  const clampI = (i: number) => Math.min(W - 1, Math.max(0, i));
  const clampJ = (j: number) => Math.min(H - 1, Math.max(0, j));
  const i0 = clampI(i0f);
  const i1 = clampI(i0f + 1);
  const j0 = clampJ(j0f);
  const j1 = clampJ(j0f + 1);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  for (let ch = 0; ch < 4; ch++) {
    const at = (i: number, j: number) => data[(j * W + i) * 4 + ch] ?? 0;
    out[ch] = mix(mix(at(i0, j0), at(i1, j0), fx), mix(at(i0, j1), at(i1, j1), fx), fy);
  }
  return out;
}

/** Clamps a position into the image, for channels that must not turn transparent. */
function clampInto(src: Size, p: readonly [number, number]): [number, number] {
  return [Math.min(src.width, Math.max(0, p[0])), Math.min(src.height, Math.max(0, p[1]))];
}

/** The developed image's color at output pixel position (x, y), with lens corrections and fringe. */
export function sampleOutput(data: Uint8Array | Uint8ClampedArray, src: Size, map: GeometryMap, x: number, y: number): [number, number, number, number] {
  const [ox, oy] = applyAffine(map.before, x, y);
  if (!map.lens) return sampleBilinear(data, src.width, src.height, ox, oy);
  const lens = map.lens;
  const q = lensMap(lens, map.oriented, ox, oy);
  if (!q) return [0, 0, 0, 0];
  const [sx, sy] = applyAffine(map.after, q[0], q[1]);
  const px = sampleBilinear(data, src.width, src.height, sx, sy);
  if (px[3] === 0) return px;
  const channel = (amount: number, ch: number) => {
    const f = fringePoint(map.oriented, q[0], q[1], amount);
    const [fx, fy] = clampInto(src, applyAffine(map.after, f[0], f[1]));
    return sampleBilinear(data, src.width, src.height, fx, fy)[ch] ?? 0;
  };
  if (lens.fringeRed !== 0) px[0] = channel(lens.fringeRed, 0);
  if (lens.fringeBlue !== 0) px[2] = channel(lens.fringeBlue, 2);
  return px;
}

/**
 * CPU reference for the final pass on a developed RGBA8 image: geometry,
 * then the post-crop vignette (signed strength, 0 = off) in output space.
 */
export function applyGeometryRgba8(
  data: Uint8Array | Uint8ClampedArray,
  src: Size,
  g: Geometry,
  vignette = 0,
): { width: number; height: number; data: Uint8ClampedArray } {
  const out = outputSize(src, g);
  const map = geometryMap(src, g, out);
  const result = new Uint8ClampedArray(out.width * out.height * 4);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const px = sampleOutput(data, src, map, x + 0.5, y + 0.5);
      const mask = vignette === 0 || px[3] === 0 ? 0 : vignetteMask((x + 0.5) / out.width, (y + 0.5) / out.height);
      const i = (y * out.width + x) * 4;
      for (let ch = 0; ch < 3; ch++) result[i + ch] = Math.round(mask === 0 ? px[ch] ?? 0 : applyVignette((px[ch] ?? 0) / 255, vignette, mask) * 255);
      result[i + 3] = Math.round(px[3]);
    }
  }
  return { width: out.width, height: out.height, data: result };
}
