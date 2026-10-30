import type { Size } from '../engine/geometry';
import { MAX_SPOT_RADIUS, MIN_SPOT_RADIUS, type Spot, type SpotMode } from './editSettings';
import type { MaskView, Point2 } from './maskEdit';

/**
 * Spot removal editing (M28). Spots are stored normalized to the uploaded
 * photo; the overlay works in frame pixels through the same view as masks
 * (model/maskEdit.ts maskView).
 */

/** Options for new spots; a selected spot shows (and takes) its own. */
export interface SpotOptions {
  mode: SpotMode;
  /** 1–100 on the Size slider (spotRadius maps it). */
  size: number;
  feather: number;
  opacity: number;
}

export const DEFAULT_SPOT_OPTIONS: SpotOptions = { mode: 'heal', size: 30, feather: 50, opacity: 100 };

/** Size slider (1–100) → radius as a fraction of the long edge, exponential so small sizes are fine-grained. */
export function spotRadius(size: number): number {
  const t = (Math.min(100, Math.max(1, size)) - 1) / 99;
  return 0.003 * Math.pow(0.15 / 0.003, t);
}

/** The inverse of spotRadius, rounded to a slider step. */
export function spotSize(radius: number): number {
  const t = Math.log(Math.min(0.15, Math.max(0.003, radius)) / 0.003) / Math.log(0.15 / 0.003);
  return Math.round(1 + 99 * t);
}

/** Radius in frame pixels. */
export function spotRadiusFrame(spot: Pick<Spot, 'radius'>, view: MaskView): number {
  return (spot.radius * Math.max(view.source.width, view.source.height)) / view.scale;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Moves the spot (and its source with it) by a frame-pixel offset. */
export function moveSpot(start: Spot, view: MaskView, dx: number, dy: number): Spot {
  const c = view.toFrame(start.x, start.y);
  const s = view.toFrame(start.sx, start.sy);
  const a = view.fromFrame(c.x + dx, c.y + dy);
  const b = view.fromFrame(s.x + dx, s.y + dy);
  return { ...start, x: clamp01(a.x), y: clamp01(a.y), sx: clamp01(b.x), sy: clamp01(b.y) };
}

/** Moves only the source by a frame-pixel offset. */
export function moveSource(start: Spot, view: MaskView, dx: number, dy: number): Spot {
  const s = view.toFrame(start.sx, start.sy);
  const b = view.fromFrame(s.x + dx, s.y + dy);
  return { ...start, sx: clamp01(b.x), sy: clamp01(b.y) };
}

/** Resizes the spot so its rim passes through frame point p. */
export function resizeSpot(start: Spot, view: MaskView, p: Point2): Spot {
  const c = view.toFrame(start.x, start.y);
  const r = (Math.hypot(p.x - c.x, p.y - c.y) * view.scale) / Math.max(view.source.width, view.source.height);
  return { ...start, radius: Math.min(MAX_SPOT_RADIUS, Math.max(MIN_SPOT_RADIUS, r)) };
}

/** A small copy of the photo used to pick sources. */
export interface PixelSample extends Size {
  data: Uint8Array | Uint8ClampedArray;
}

/** Mean and spread of luminance-weighted color inside a ring (r0 ≤ d < r1) around (cx, cy), sample pixels. */
function ringStats(img: PixelSample, cx: number, cy: number, r0: number, r1: number): { mean: [number, number, number]; spread: number } | null {
  const sum = [0, 0, 0];
  let sq = 0;
  let n = 0;
  const reach = Math.ceil(r1);
  for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y++) {
    for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r0 || d >= r1) continue;
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (img.data[i + c] ?? 0);
      const lum = 0.2126 * (img.data[i] ?? 0) + 0.7152 * (img.data[i + 1] ?? 0) + 0.0722 * (img.data[i + 2] ?? 0);
      sq += lum * lum;
      n++;
    }
  }
  if (n === 0) return null;
  const mean: [number, number, number] = [(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n];
  const lumMean = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
  return { mean, spread: Math.sqrt(Math.max(0, sq / n - lumMean * lumMean)) };
}

/**
 * Picks a source for a new spot at normalized (x, y) with `radius`: of the
 * nearby discs that fit in the photo and don't overlap the spot, the one
 * whose colors and texture best match the ring just around the spot.
 */
export function autoSource(img: PixelSample, x: number, y: number, radius: number): { sx: number; sy: number } {
  const long = Math.max(img.width, img.height);
  const r = Math.max(1, radius * long);
  const cx = x * img.width;
  const cy = y * img.height;
  const around = ringStats(img, cx, cy, r, r * 1.6);
  let best: { sx: number; sy: number; score: number } | null = null;
  for (const dist of [2.2, 3, 4]) {
    for (let k = 0; k < 12; k++) {
      const a = (2 * Math.PI * k) / 12;
      const sx = cx + dist * r * Math.cos(a);
      const sy = cy + dist * r * Math.sin(a);
      if (sx - r < 0 || sy - r < 0 || sx + r > img.width || sy + r > img.height) continue;
      const disc = ringStats(img, sx, sy, 0, r);
      if (!disc || !around) {
        best ??= { sx, sy, score: Infinity };
        continue;
      }
      const color = Math.hypot(disc.mean[0] - around.mean[0], disc.mean[1] - around.mean[1], disc.mean[2] - around.mean[2]);
      // Prefer near candidates slightly: equal matches go to the closest.
      const score = color + 0.5 * Math.abs(disc.spread - around.spread) + dist;
      if (!best || score < best.score) best = { sx, sy, score };
    }
  }
  if (!best) {
    // Too big to fit anywhere nearby: the other half of the photo.
    return { sx: x < 0.5 ? Math.min(1, x + 0.5) : x - 0.5, sy: y };
  }
  return { sx: clamp01(best.sx / img.width), sy: clamp01(best.sy / img.height) };
}

/** A new spot at frame point p, with the current options and an automatic source. */
export function createSpot(id: string, view: MaskView, p: Point2, options: SpotOptions, sample: PixelSample | null): Spot {
  const at = view.fromFrame(p.x, p.y);
  const x = clamp01(at.x);
  const y = clamp01(at.y);
  const radius = spotRadius(options.size);
  const source = sample ? autoSource(sample, x, y, radius) : { sx: x < 0.5 ? x + 0.2 : x - 0.2, sy: y };
  return { id, mode: options.mode, x, y, ...source, radius, feather: options.feather, opacity: options.opacity };
}
