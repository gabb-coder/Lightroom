import { clamp01, linearToSrgb, srgbToLinear, type Rgb } from './color';
import { HSL_COLORS, type HslAdjust, type HslColor } from '../model/editSettings';

/**
 * Color mixer stage. Works on sRGB-encoded HSV. Each of the 8 ranges is
 * centered on a hue; between two neighboring centers the ranges cross-fade
 * with cos² weights that sum to 1, so a range has no effect at or beyond its
 * neighbors' centers. Effects scale with saturation, so grays never change.
 */

/** Center hue (degrees) of each range, in HSL_COLORS order. */
export const HSL_CENTERS: Readonly<Record<HslColor, number>> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 270,
  magenta: 300,
};

export const HSL_CENTER_LIST: readonly number[] = HSL_COLORS.map((c) => HSL_CENTERS[c]);

/** Hue shift at ±100, in degrees. */
export const HSL_MAX_HUE_SHIFT = 30;
/** Brightness change at ±100 for a fully saturated color (fraction of V). */
export const HSL_MAX_LUM = 0.5;

/** Pre-scaled slider amounts (-1..1), indexed like HSL_COLORS. */
export interface HslParams {
  hue: number[];
  sat: number[];
  lum: number[];
}

export function hslParams(hsl: Record<HslColor, HslAdjust>): HslParams | null {
  const hue = HSL_COLORS.map((c) => hsl[c].hue / 100);
  const sat = HSL_COLORS.map((c) => hsl[c].sat / 100);
  const lum = HSL_COLORS.map((c) => hsl[c].lum / 100);
  return [...hue, ...sat, ...lum].every((v) => v === 0) ? null : { hue, sat, lum };
}

/** Weight of each range for a hue in degrees [0, 360). Two neighbors at most, summing to 1. */
export function hueWeights(h: number): number[] {
  const w = new Array<number>(HSL_CENTER_LIST.length).fill(0);
  const n = HSL_CENTER_LIST.length;
  for (let k = 0; k < n; k++) {
    const c0 = HSL_CENTER_LIST[k] ?? 0;
    const c1 = k === n - 1 ? 360 : (HSL_CENTER_LIST[k + 1] ?? 360);
    if (h >= c0 && h < c1) {
      const t = (h - c0) / (c1 - c0);
      const a = 0.5 + 0.5 * Math.cos(Math.PI * t);
      w[k] = a;
      w[(k + 1) % n] = 1 - a;
      break;
    }
  }
  return w;
}

export function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max > 0 ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const sectors: readonly Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = sectors[Math.min(5, Math.floor(hh))] ?? [c, x, 0];
  return [r + m, g + m, b + m];
}

/** Color mixer stage on linear light (null params = identity, skipped). */
export function applyHsl(c: Rgb, p: HslParams | null): Rgb {
  if (!p) return c;
  const [h, s, v] = rgbToHsv([linearToSrgb(clamp01(c[0])), linearToSrgb(clamp01(c[1])), linearToSrgb(clamp01(c[2]))]);
  const w = hueWeights(h);
  let dh = 0;
  let ds = 0;
  let dl = 0;
  for (let k = 0; k < w.length; k++) {
    const wk = w[k] ?? 0;
    dh += wk * (p.hue[k] ?? 0);
    ds += wk * (p.sat[k] ?? 0);
    dl += wk * (p.lum[k] ?? 0);
  }
  const h2 = h + dh * HSL_MAX_HUE_SHIFT * s;
  const s2 = clamp01(s * (1 + ds));
  const v2 = clamp01(v * (1 + dl * HSL_MAX_LUM * s));
  const out = hsvToRgb(h2, s2, v2);
  return [srgbToLinear(out[0]), srgbToLinear(out[1]), srgbToLinear(out[2])];
}
