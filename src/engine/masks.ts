import type { Rgb } from './color';
import { applyExposure, exposureGain } from './exposure';
import { applySaturation, saturationScale } from './saturation';
import { applyTone, toneParams, type ToneParams } from './tone';
import { applyWhiteBalance, whiteBalanceGains } from './whiteBalance';
import type { Mask, MaskAdjust } from '../model/editSettings';
import { brushRaster, sampleBrush, type BrushRaster } from './brush';

/**
 * Local adjustments (M15): each gradient mask has a weight per pixel (0..1)
 * and its own white balance, exposure, contrast/highlights/shadows and
 * saturation. They run right after the global tone stage:
 *
 *   c = mix(c, adjust_m(c), weight_m(x, y))   for each mask m, in order
 *
 * Weights are computed in source pixel space from normalized mask
 * coordinates, so they don't depend on the render size (proxy, export).
 */

export interface MaskShape {
  kind: 'linear' | 'radial' | 'brush';
  /** linear: x0, y0, x1, y1; radial: cx, cy, rx, ry (all normalized); brush: unused. */
  a: [number, number, number, number];
  /** radial: cos(angle), sin(angle), feather 0..1, invert 0/1; brush: raster width, height. */
  b: [number, number, number, number];
  /** Brush masks (M21): the rasterized strokes (engine/brush.ts). */
  raster: BrushRaster | null;
}

export interface MaskParams {
  shape: MaskShape;
  whiteBalance: Rgb;
  exposureGain: number;
  tone: ToneParams;
  saturationScale: number;
}

const isNeutral = (a: MaskAdjust) => Object.values(a).every((v) => v === 0);

export function maskShape(m: Mask): MaskShape {
  if (m.kind === 'linear') return { kind: 'linear', a: [m.x0, m.y0, m.x1, m.y1], b: [0, 0, 0, 0], raster: null };
  if (m.kind === 'brush') {
    const raster = brushRaster(m);
    return { kind: 'brush', a: [0, 0, 0, 0], b: [raster.width, raster.height, 0, 0], raster };
  }
  const t = (m.angle * Math.PI) / 180;
  return { kind: 'radial', a: [m.cx, m.cy, m.rx, m.ry], b: [Math.cos(t), Math.sin(t), m.feather / 100, m.invert ? 1 : 0], raster: null };
}

/** Masks that change something (neutral adjustments, or a brush with nothing painted, are skipped). */
export function maskParams(masks: readonly Mask[]): MaskParams[] {
  return masks
    .filter((m) => !isNeutral(m.adjust) && !(m.kind === 'brush' && m.strokes.length === 0))
    .map((m) => ({
      shape: maskShape(m),
      whiteBalance: whiteBalanceGains(m.adjust.temp, m.adjust.tint),
      exposureGain: exposureGain(m.adjust.exposure),
      tone: toneParams({ contrast: m.adjust.contrast, highlights: m.adjust.highlights, shadows: m.adjust.shadows, whites: 0, blacks: 0 }),
      saturationScale: saturationScale(m.adjust.saturation),
    }));
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Weight of a mask at source pixel center (px, py) of a W × H image.
 * Linear: 1 up to the start point, smooth fall-off to 0 at the end point.
 * Radial: 1 inside the solid core, smooth fall-off over the feathered rim,
 * 0 outside (inverted: the reverse). Brush: the painted weight map.
 */
export function maskWeight(s: MaskShape, px: number, py: number, W: number, H: number): number {
  if (s.kind === 'brush') return s.raster ? sampleBrush(s.raster, px / W, py / H) : 0;
  if (s.kind === 'linear') {
    const [x0, y0, x1, y1] = s.a;
    const dx = (x1 - x0) * W;
    const dy = (y1 - y0) * H;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return 0;
    const t = ((px - x0 * W) * dx + (py - y0 * H) * dy) / len2;
    return 1 - smoothstep(0, 1, t);
  }
  const [cx, cy, rx, ry] = s.a;
  const [cos, sin, feather, invert] = s.b;
  const ox = px - cx * W;
  const oy = py - cy * H;
  // Into the ellipse's own axes (rotated by `angle` in pixel space).
  const u = (ox * cos + oy * sin) / (rx * W);
  const v = (-ox * sin + oy * cos) / (ry * H);
  const r = Math.sqrt(u * u + v * v);
  const inner = 1 - Math.max(feather, 1e-4);
  const w = 1 - smoothstep(inner, 1, r);
  return invert > 0.5 ? 1 - w : w;
}

/** The full-strength local adjustment of one mask. */
export function adjustForMask(c: Rgb, m: MaskParams): Rgb {
  let out = applyWhiteBalance(c, m.whiteBalance);
  out = applyExposure(out, m.exposureGain);
  out = applyTone(out, m.tone);
  return applySaturation(out, m.saturationScale);
}

/** GLSL mix(): a·(1 − t) + b·t. */
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** Applies every mask at one pixel, given each mask's weight there. */
export function applyMasks(c: Rgb, masks: readonly MaskParams[], weights: readonly number[]): Rgb {
  let out = c;
  masks.forEach((m, i) => {
    const w = weights[i] ?? 0;
    if (w <= 0) return;
    const adjusted = adjustForMask(out, m);
    out = w >= 1 ? adjusted : [mix(out[0], adjusted[0], w), mix(out[1], adjusted[1], w), mix(out[2], adjusted[2], w)];
  });
  return out;
}
