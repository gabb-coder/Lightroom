import { clamp01, linearToSrgb, srgbToLinear, type Rgb } from './color';
import type { Point } from '../model/editSettings';

/**
 * Tone curve stage. Curves are drawn on sRGB-encoded values (what the curve
 * editor shows): each channel goes through the RGB curve, then its own
 * channel curve. Both are combined into one lookup table that the CPU and
 * the GPU sample identically (two entries, linear blend).
 */

export const CURVE_LUT_SIZE = 1024;

export interface CurveSet {
  rgb: readonly Point[];
  r: readonly Point[];
  g: readonly Point[];
  b: readonly Point[];
}

export function isIdentityCurve(points: readonly Point[]): boolean {
  return points.length === 2 && points[0]?.x === 0 && points[0].y === 0 && points[1]?.x === 1 && points[1].y === 1;
}

export function isIdentityCurveSet(c: CurveSet): boolean {
  return isIdentityCurve(c.rgb) && isIdentityCurve(c.r) && isIdentityCurve(c.g) && isIdentityCurve(c.b);
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolation through `points` (sorted by
 * x). Never overshoots between points; flat outside the first/last point.
 */
export function monotoneSpline(points: readonly Point[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a.x - b.x).filter((p, i, arr) => i === 0 || p.x > (arr[i - 1]?.x ?? -1));
  const n = pts.length;
  if (n === 0) return (x) => x;
  if (n === 1) return () => pts[0]?.y ?? 0;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) d.push(((ys[k + 1] ?? 0) - (ys[k] ?? 0)) / ((xs[k + 1] ?? 0) - (xs[k] ?? 0)));
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let k = 1; k < n - 1; k++) {
    const a = d[k - 1] ?? 0;
    const b = d[k] ?? 0;
    m[k] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    const dk = d[k] ?? 0;
    if (dk === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = (m[k] ?? 0) / dk;
    const b = (m[k + 1] ?? 0) / dk;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * dk;
      m[k + 1] = t * b * dk;
    }
  }
  return (x) => {
    if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
    if (x >= (xs[n - 1] ?? 1)) return ys[n - 1] ?? 1;
    let k = 0;
    while (k < n - 2 && x > (xs[k + 1] ?? 1)) k++;
    const x0 = xs[k] ?? 0;
    const h = (xs[k + 1] ?? 1) - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[k] ?? 0) +
      (t3 - 2 * t2 + t) * h * (m[k] ?? 0) +
      (-2 * t3 + 3 * t2) * (ys[k + 1] ?? 0) +
      (t3 - t2) * h * (m[k + 1] ?? 0)
    );
  };
}

/** RGBA float table: entry i holds each channel's combined curve at i/(N−1). */
export function buildCurveLut(c: CurveSet): Float32Array {
  const rgb = monotoneSpline(c.rgb);
  const ch = [monotoneSpline(c.r), monotoneSpline(c.g), monotoneSpline(c.b)];
  const lut = new Float32Array(CURVE_LUT_SIZE * 4);
  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    const v = clamp01(rgb(i / (CURVE_LUT_SIZE - 1)));
    for (let k = 0; k < 3; k++) lut[i * 4 + k] = clamp01(ch[k]?.(v) ?? v);
    lut[i * 4 + 3] = 1;
  }
  return lut;
}

/** Samples one channel of the table at v in [0, 1] (same arithmetic as the shader). */
export function sampleLut(lut: Float32Array, channel: number, v: number): number {
  const t = clamp01(v) * (CURVE_LUT_SIZE - 1);
  const i0 = Math.floor(t);
  const i1 = Math.min(i0 + 1, CURVE_LUT_SIZE - 1);
  const f = t - i0;
  return (lut[i0 * 4 + channel] ?? 0) * (1 - f) + (lut[i1 * 4 + channel] ?? 0) * f;
}

/** Tone curve stage on linear light (null table = identity, skipped). */
export function applyCurve(c: Rgb, lut: Float32Array | null): Rgb {
  if (!lut) return c;
  const channel = (k: number) => srgbToLinear(clamp01(sampleLut(lut, k, linearToSrgb(clamp01(c[k] ?? 0)))));
  return [channel(0), channel(1), channel(2)];
}
