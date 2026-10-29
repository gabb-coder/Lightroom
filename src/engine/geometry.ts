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
  return c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 && g.angle === 0 && g.rotation === 0 && !g.flipH && !g.flipV;
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

/** Output pixel coordinates → source pixel coordinates (continuous, pixel centers at +0.5). */
export function geometryMatrix(src: Size, g: Geometry, out: Size = outputSize(src, g)): Affine {
  const o = orientedSize(src, g.rotation);
  const c = g.cropRect;
  const toOriented: Affine = [(c.w * o.width) / out.width, 0, c.x * o.width, 0, (c.h * o.height) / out.height, c.y * o.height];
  return compose(orientationToSource(src, g), compose(straightenInverse(o, g.angle), toOriented));
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
  const m = geometryMatrix(src, g, out);
  const result = new Uint8ClampedArray(out.width * out.height * 4);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const [sx, sy] = applyAffine(m, x + 0.5, y + 0.5);
      const px = sampleBilinear(data, src.width, src.height, sx, sy);
      const mask = vignette === 0 || px[3] === 0 ? 0 : vignetteMask((x + 0.5) / out.width, (y + 0.5) / out.height);
      const i = (y * out.width + x) * 4;
      for (let ch = 0; ch < 3; ch++) result[i + ch] = Math.round(mask === 0 ? px[ch] ?? 0 : applyVignette((px[ch] ?? 0) / 255, vignette, mask) * 255);
      result[i + 3] = Math.round(px[3]);
    }
  }
  return { width: out.width, height: out.height, data: result };
}
