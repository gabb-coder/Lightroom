import type { Spot } from '../model/editSettings';
import type { Size } from './geometry';

/**
 * Spot removal (M28): retouches the ORIGINAL pixels before everything else,
 * so every later edit applies to the retouched photo.
 *
 * Each spot covers a disc (center c, radius r) with the patch around a
 * source center s, faded over the feathered edge and scaled by opacity:
 *
 *   out = mix(out, value, alpha),  value = src(s + (p − c)) [+ correction]
 *
 * Clone copies the patch as it is. Heal also adds a smooth correction so
 * the patch's edge matches the spot's surroundings: the difference between
 * what is around the spot and what is around the source is measured at
 * HEAL_DIRECTIONS points on the rim (each the mean of RIM_STEPS samples
 * just outside it), and interpolated inside by inverse squared distance —
 * a cheap stand-in for Poisson blending that keeps the patch's texture but
 * takes on the surrounding color and brightness.
 *
 * Spots apply in order; every spot reads from the original image (not from
 * the spots before it). Sampling is bilinear with clamped edges on
 * sRGB-encoded values, the same arithmetic as the GPU retouch pass.
 */

export const HEAL_DIRECTIONS = 24;
export const RIM_STEPS = 3;

/** A spot in pixels of an image of a given size. */
export interface SpotPx {
  heal: boolean;
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  r: number;
  /** Radius of the fully covered core. */
  inner: number;
  opacity: number;
}

/** Spots that change something, in pixels of `size`. */
export function spotsPx(spots: readonly Spot[], size: Size): SpotPx[] {
  const long = Math.max(size.width, size.height);
  return spots
    .filter((s) => s.opacity > 0 && s.radius * long >= 0.5)
    .map((s) => {
      const r = s.radius * long;
      return {
        heal: s.mode === 'heal',
        cx: s.x * size.width,
        cy: s.y * size.height,
        sx: s.sx * size.width,
        sy: s.sy * size.height,
        r,
        inner: r * (1 - s.feather / 100),
        opacity: s.opacity / 100,
      };
    });
}

/** Bilinear sample (channels 0–1) at pixel position (x, y), centers at +0.5, edges clamped. */
export function sampleClamped(data: Uint8Array | Uint8ClampedArray, size: Size, x: number, y: number): [number, number, number] {
  const u = Math.min(size.width - 0.5, Math.max(0.5, x)) - 0.5;
  const v = Math.min(size.height - 0.5, Math.max(0.5, y)) - 0.5;
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const fx = u - i0;
  const fy = v - j0;
  const i1 = Math.min(size.width - 1, i0 + 1);
  const j1 = Math.min(size.height - 1, j0 + 1);
  const at = (i: number, j: number, c: number) => (data[(j * size.width + i) * 4 + c] ?? 0) / 255;
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) out[c] = mix(mix(at(i0, j0, c), at(i1, j0, c), fx), mix(at(i0, j1, c), at(i1, j1, c), fx), fy);
  return out;
}

/** Feathered coverage at distance d from the center (smoothstep from the core to the rim). */
export function spotAlpha(d: number, s: SpotPx): number {
  if (d >= s.r) return 0;
  if (d <= s.inner) return 1;
  const t = (s.r - d) / (s.r - s.inner);
  return t * t * (3 - 2 * t);
}

/** Rim step outward, in pixels. */
export function rimStep(r: number): number {
  return Math.max(1, 0.1 * r);
}

/** Surroundings minus source surroundings at each rim direction (heal), channels 0–1. */
export function rimDifferences(data: Uint8Array | Uint8ClampedArray, size: Size, s: SpotPx): [number, number, number][] {
  const out: [number, number, number][] = [];
  const step = rimStep(s.r);
  for (let k = 0; k < HEAL_DIRECTIONS; k++) {
    const a = (2 * Math.PI * k) / HEAL_DIRECTIONS;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const d: [number, number, number] = [0, 0, 0];
    for (let j = 0; j < RIM_STEPS; j++) {
      const dist = s.r + j * step;
      const there = sampleClamped(data, size, s.cx + dist * ux, s.cy + dist * uy);
      const from = sampleClamped(data, size, s.sx + dist * ux, s.sy + dist * uy);
      for (let c = 0; c < 3; c++) d[c] = (d[c] ?? 0) + ((there[c] ?? 0) - (from[c] ?? 0)) / RIM_STEPS;
    }
    out.push(d);
  }
  return out;
}

/** Heal correction at pixel position (px, py): rim differences weighted by inverse squared distance. */
export function healCorrection(rim: readonly (readonly [number, number, number])[], s: SpotPx, px: number, py: number): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  let weights = 0;
  rim.forEach((d, k) => {
    const a = (2 * Math.PI * k) / HEAL_DIRECTIONS;
    const bx = s.cx + s.r * Math.cos(a);
    const by = s.cy + s.r * Math.sin(a);
    const w = 1 / ((px - bx) ** 2 + (py - by) ** 2 + 1);
    for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + w * (d[c] ?? 0);
    weights += w;
  });
  return [sum[0] / weights, sum[1] / weights, sum[2] / weights];
}

/** CPU reference: the original RGBA8 image with every spot applied (a copy when there are none). */
export function retouchRgba8(data: Uint8Array | Uint8ClampedArray, size: Size, spots: readonly Spot[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const list = spotsPx(spots, size);
  if (list.length === 0) return out;
  const rims = list.map((s) => (s.heal ? rimDifferences(data, size, s) : null));
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * size.width + x) * 4;
      let color: [number, number, number] | null = null;
      list.forEach((s, n) => {
        const alpha = spotAlpha(Math.hypot(px - s.cx, py - s.cy), s) * s.opacity;
        if (alpha <= 0) return;
        color ??= [(data[i] ?? 0) / 255, (data[i + 1] ?? 0) / 255, (data[i + 2] ?? 0) / 255];
        const value = sampleClamped(data, size, s.sx + px - s.cx, s.sy + py - s.cy);
        const rim = rims[n];
        const corr = rim ? healCorrection(rim, s, px, py) : [0, 0, 0];
        for (let c = 0; c < 3; c++) color[c] = (color[c] ?? 0) * (1 - alpha) + ((value[c] ?? 0) + (corr[c] ?? 0)) * alpha;
      });
      if (!color) continue;
      const done: [number, number, number] = color;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(Math.min(1, Math.max(0, done[c] ?? 0)) * 255);
    }
  }
  return out;
}
