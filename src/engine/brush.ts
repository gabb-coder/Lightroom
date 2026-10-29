import type { BrushMask, BrushStroke } from '../model/editSettings';

/**
 * Brush masks (M21). Strokes are rasterized on the CPU into an 8-bit weight
 * map whose long edge is BRUSH_RASTER_EDGE cells, with the photo's aspect.
 * The GPU gets the same bytes as a texture and samples them with the same
 * manual bilinear filter (`sampleBrush`), so CPU and GPU weights agree.
 *
 * Each stroke places round dabs along its path (spacing a fifth of the
 * radius). A dab is 1 inside its solid core and falls off smoothly over the
 * feathered rim. Painting keeps the larger weight, erasing the smaller of
 * the current weight and 1 − dab. Working in bytes gives the same result as
 * floats rounded at the end, because rounding preserves max and min.
 */

export const BRUSH_RASTER_EDGE = 1024;
/** Dab spacing as a fraction of the radius. */
export const DAB_SPACING = 0.2;

/** A rasterized brush mask. Serializes to its key only, so params stay cheap to compare. */
export class BrushRaster {
  private static next = 0;
  readonly key = `brush-${BrushRaster.next++}`;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly data: Uint8Array,
  ) {}
  toJSON(): string {
    return this.key;
  }
}

export function rasterSize(aspect: number): { width: number; height: number } {
  if (aspect >= 1) return { width: BRUSH_RASTER_EDGE, height: Math.max(1, Math.round(BRUSH_RASTER_EDGE / aspect)) };
  return { width: Math.max(1, Math.round(BRUSH_RASTER_EDGE * aspect)), height: BRUSH_RASTER_EDGE };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Weight of a dab at distance `d` (in radii) from its center. */
export function dabWeight(d: number, feather: number): number {
  return 1 - smoothstep(1 - Math.max(feather / 100, 1e-4), 1, d);
}

/** Dab centers along a stroke (normalized coordinates), every DAB_SPACING radii in pixel space. */
export function dabCenters(stroke: BrushStroke, aspect: number): [number, number][] {
  const p = stroke.points;
  // Normalized → long-edge units, so distances are the same along x and y.
  const sx = aspect >= 1 ? 1 : aspect;
  const sy = aspect >= 1 ? 1 / aspect : 1;
  const step = Math.max(stroke.radius * DAB_SPACING, 0.5 / BRUSH_RASTER_EDGE);
  const out: [number, number][] = [[p[0] ?? 0, p[1] ?? 0]];
  let carry = 0; // distance walked since the last dab
  for (let i = 2; i + 1 < p.length; i += 2) {
    const ax = p[i - 2] ?? 0;
    const ay = p[i - 1] ?? 0;
    const bx = p[i] ?? 0;
    const by = p[i + 1] ?? 0;
    const len = Math.hypot((bx - ax) * sx, (by - ay) * sy);
    let at = step - carry;
    // The epsilon keeps a dab that lands exactly on a point from being lost to rounding.
    while (at <= len + 1e-9) {
      const t = at / len;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      at += step;
    }
    carry = len - (at - step);
  }
  return out;
}

/** Paints (or erases) one stroke into `data` (a raster of `size`). */
export function applyStroke(data: Uint8Array, size: { width: number; height: number }, aspect: number, stroke: BrushStroke): void {
  const { width: rw, height: rh } = size;
  const sx = aspect >= 1 ? 1 : aspect;
  const sy = aspect >= 1 ? 1 / aspect : 1;
  // Cell size in long-edge units on each axis.
  const cellX = sx / rw;
  const cellY = sy / rh;
  const r = stroke.radius;
  const r2 = r * r;
  for (const [cu, cv] of dabCenters(stroke, aspect)) {
    const cx = cu * sx;
    const cy = cv * sy;
    const x0 = Math.max(0, Math.floor((cx - r) / cellX - 0.5));
    const x1 = Math.min(rw - 1, Math.ceil((cx + r) / cellX - 0.5));
    const y0 = Math.max(0, Math.floor((cy - r) / cellY - 0.5));
    const y1 = Math.min(rh - 1, Math.ceil((cy + r) / cellY - 0.5));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5) * cellY - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) * cellX - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const w = Math.round(dabWeight(Math.sqrt(d2 / r2), stroke.feather) * 255);
        const i = y * rw + x;
        const v = data[i] ?? 0;
        data[i] = stroke.erase ? Math.min(v, 255 - w) : Math.max(v, w);
      }
    }
  }
}

/** Rasterizes every stroke, in order (no caching; see `brushRaster`). */
export function rasterizeBrush(mask: Pick<BrushMask, 'aspect' | 'strokes'>): BrushRaster {
  const size = rasterSize(mask.aspect);
  const data = new Uint8Array(size.width * size.height);
  for (const stroke of mask.strokes) applyStroke(data, size, mask.aspect, stroke);
  return new BrushRaster(size.width, size.height, data);
}

/**
 * Weight at normalized point (u, v): bilinear between cell centers, clamped
 * at the edges. The develop and display shaders do exactly this.
 */
export function sampleBrush(r: BrushRaster, u: number, v: number): number {
  const x = u * r.width - 0.5;
  const y = v * r.height - 0.5;
  const fx0 = Math.floor(x);
  const fy0 = Math.floor(y);
  const fx = x - fx0;
  const fy = y - fy0;
  const cx = (i: number) => Math.min(r.width - 1, Math.max(0, i));
  const cy = (i: number) => Math.min(r.height - 1, Math.max(0, i));
  const at = (ix: number, iy: number) => (r.data[cy(iy) * r.width + cx(ix)] ?? 0) / 255;
  const top = at(fx0, fy0) * (1 - fx) + at(fx0 + 1, fy0) * fx;
  const bottom = at(fx0, fy0 + 1) * (1 - fx) + at(fx0 + 1, fy0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Cache so painting stays fast: per mask id, the raster of all strokes but
 * the last. While a stroke grows, only that stroke is drawn again (onto a
 * copy of the cached base). Strokes are immutable, so reference equality
 * tells which ones are unchanged.
 */
interface CacheEntry {
  aspect: number;
  strokes: readonly BrushStroke[];
  raster: BrushRaster;
  /** Raster of strokes[0 .. baseCount). */
  base: Uint8Array;
  baseCount: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHED = 16;

export function brushRaster(mask: BrushMask): BrushRaster {
  const hit = cache.get(mask.id);
  if (hit && hit.aspect === mask.aspect && hit.strokes === mask.strokes) return hit.raster;
  const size = rasterSize(mask.aspect);
  const n = mask.strokes.length;
  const usable = hit && hit.aspect === mask.aspect && hit.baseCount <= n && mask.strokes.slice(0, hit.baseCount).every((s, i) => s === hit.strokes[i]);
  const base = usable ? hit.base.slice() : new Uint8Array(size.width * size.height);
  for (let i = usable ? hit.baseCount : 0; i < n - 1; i++) applyStroke(base, size, mask.aspect, mask.strokes[i] as BrushStroke);
  const data = base.slice();
  const last = mask.strokes[n - 1];
  if (last) applyStroke(data, size, mask.aspect, last);
  const raster = new BrushRaster(size.width, size.height, data);
  cache.delete(mask.id);
  cache.set(mask.id, { aspect: mask.aspect, strokes: mask.strokes, raster, base, baseCount: Math.max(0, n - 1) });
  // Oldest first in a Map: drop masks not used lately.
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  return raster;
}
