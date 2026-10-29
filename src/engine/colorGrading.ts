import { clamp01, linearToSrgb, LUMA_WEIGHTS as W, mapRgb, srgbToLinear, type Rgb } from './color';
import { hsvToRgb } from './hsl';
import { GRADE_REGIONS, type ColorGradingSettings, type GradeWheel } from '../model/editSettings';

/**
 * Color grading (M14), applied last among the color stages (after B&W, so it
 * also split-tones monochrome photos). Works on sRGB-encoded values:
 *
 *   e' = e + Σ weight_r(Y) · (tint_r + lum_r)
 *
 * where Y is the encoded luma, tint_r is a zero-luma color offset (the
 * wheel's hue at its saturation) and lum_r a gray offset. Shadows and
 * highlights split at the balance point; their transition widens with
 * blending; midtones are a bump around the same point; global applies
 * everywhere.
 */

/** Strongest color offset (saturation 100) and luminance offset (±100), in encoded units. */
export const GRADE_TINT_STRENGTH = 0.18;
export const GRADE_LUM_STRENGTH = 0.2;

export interface GradeOffset {
  /** Color offset with zero luma, plus a gray offset. */
  tint: Rgb;
  lum: number;
}

export interface ColorGradingParams {
  shadows: GradeOffset;
  midtones: GradeOffset;
  highlights: GradeOffset;
  global: GradeOffset;
  /** Luma where shadows give way to highlights (0.5 at balance 0). */
  pivot: number;
  /** Half-width of the shadows↔highlights transition. */
  width: number;
  /** Half-width of the midtones bump. */
  midWidth: number;
}

function offsetOf(w: GradeWheel): GradeOffset {
  const color = hsvToRgb(w.hue, 1, 1);
  const y = W[0] * color[0] + W[1] * color[1] + W[2] * color[2];
  const k = (GRADE_TINT_STRENGTH * w.sat) / 100;
  return { tint: mapRgb(color, (c) => (c - y) * k), lum: (GRADE_LUM_STRENGTH * w.lum) / 100 };
}

/** Null when every wheel is neutral (then the stage is skipped, pixel-exact). */
export function colorGradingParams(g: ColorGradingSettings): ColorGradingParams | null {
  if (GRADE_REGIONS.every((r) => g[r].sat === 0 && g[r].lum === 0)) return null;
  const blend = g.blending / 100;
  return {
    shadows: offsetOf(g.shadows),
    midtones: offsetOf(g.midtones),
    highlights: offsetOf(g.highlights),
    global: offsetOf(g.global),
    pivot: 0.5 - 0.3 * (g.balance / 100),
    width: 0.05 + 0.45 * blend,
    midWidth: 0.2 + 0.3 * blend,
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Weights of shadows, midtones and highlights at encoded luma y. */
export function gradeWeights(y: number, p: Pick<ColorGradingParams, 'pivot' | 'width' | 'midWidth'>): [number, number, number] {
  const high = smoothstep(p.pivot - p.width, p.pivot + p.width, y);
  const mid = 1 - smoothstep(0, p.midWidth, Math.abs(y - p.pivot));
  return [1 - high, mid, high];
}

/** Total offset of one channel at the given weights. */
function channelOffset(p: ColorGradingParams, k: 0 | 1 | 2, ws: number, wm: number, wh: number): number {
  const tint = p.global.tint[k] + ws * p.shadows.tint[k] + wm * p.midtones.tint[k] + wh * p.highlights.tint[k];
  const lum = p.global.lum + ws * p.shadows.lum + wm * p.midtones.lum + wh * p.highlights.lum;
  return tint + lum;
}

/** Applies color grading to a linear-light color. */
export function applyColorGrading(c: Rgb, p: ColorGradingParams | null): Rgb {
  if (!p) return c;
  const e = mapRgb(c, (v) => linearToSrgb(clamp01(v)));
  const y = W[0] * e[0] + W[1] * e[1] + W[2] * e[2];
  const [ws, wm, wh] = gradeWeights(y, p);
  const channel = (k: 0 | 1 | 2) => srgbToLinear(clamp01(e[k] + channelOffset(p, k, ws, wm, wh)));
  return [channel(0), channel(1), channel(2)];
}
