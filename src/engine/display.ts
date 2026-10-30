import { outputToSource, type GeometryMap, type Size } from './geometry';
import { HISTOGRAM_BINS, type Histogram } from './histogram';
import { maskWeight, type MaskShape } from './masks';

/**
 * Display-only stage (M20): clipping warnings and the split Before/After
 * view. It works on the finished 8-bit image (after every edit), so it never
 * reaches exports or the histogram. The GPU runs the same rule on RGBA8
 * textures in the display pass, so both see identical bytes.
 */

export interface DisplayOptions {
  /** Paint pixels that are pure black (every channel 0). */
  shadows: boolean;
  /** Paint pixels that are pure white (every channel 255). */
  highlights: boolean;
  /** Split position across the width (0–1, Before on the left), or null for no split. */
  split: number | null;
  /** Mask overlay (M21): tint where this mask applies, or null. */
  overlay: MaskShape | null;
}

export const NO_DISPLAY: DisplayOptions = { shadows: false, highlights: false, split: null, overlay: null };

/** Mask overlay tint and its strength at full mask weight. */
export const MASK_OVERLAY_RGB = [255, 30, 60] as const;
export const MASK_OVERLAY_OPACITY = 0.5;

/** Maps output pixels to source pixels (engine/geometry.ts geometryMap), for the mask overlay. */
export interface DisplayFrame {
  map: GeometryMap;
  source: Size;
}

/** Overlay colors (RGB bytes): blue for crushed shadows, red for blown highlights. */
export const SHADOW_CLIP_RGB = [30, 110, 255] as const;
export const HIGHLIGHT_CLIP_RGB = [255, 40, 40] as const;

export function isPlainDisplay(o: DisplayOptions): boolean {
  return !o.shadows && !o.highlights && o.split === null && o.overlay === null;
}

/** Clipping overlay for one pixel's bytes: the overlay color, or null to keep the pixel. */
export function clipOverlay(r: number, g: number, b: number, o: Pick<DisplayOptions, 'shadows' | 'highlights'>): readonly [number, number, number] | null {
  if (o.highlights && r === 255 && g === 255 && b === 255) return HIGHLIGHT_CLIP_RGB;
  if (o.shadows && r === 0 && g === 0 && b === 0) return SHADOW_CLIP_RGB;
  return null;
}

/** True when output column `x` (pixel index) shows the Before image. Pixel centers decide. */
export function showsBefore(x: number, width: number, split: number | null): boolean {
  return split !== null && x + 0.5 < split * width;
}

/**
 * CPU reference for the display pass: picks Before or After per column,
 * applies the clipping overlay, then the mask overlay (needs `frame`).
 * `before` is only read when splitting.
 */
export function displayRgba8(
  after: Uint8Array | Uint8ClampedArray,
  before: Uint8Array | Uint8ClampedArray | null,
  width: number,
  o: DisplayOptions,
  frame: DisplayFrame | null = null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(after.length);
  for (let i = 0; i < after.length; i += 4) {
    const x = (i / 4) % width;
    const src = before && showsBefore(x, width, o.split) ? before : after;
    const r = src[i] ?? 0;
    const g = src[i + 1] ?? 0;
    const b = src[i + 2] ?? 0;
    const a = src[i + 3] ?? 255;
    // Transparent padding (outside a straightened photo) is not part of the picture.
    const clip = a > 0 ? clipOverlay(r, g, b, o) : null;
    out[i] = clip ? clip[0] : r;
    out[i + 1] = clip ? clip[1] : g;
    out[i + 2] = clip ? clip[2] : b;
    out[i + 3] = a;
    if (o.overlay && frame && a > 0) {
      const at = outputToSource(frame.map, x + 0.5, Math.floor(i / 4 / width) + 0.5);
      const t = at ? MASK_OVERLAY_OPACITY * maskWeight(o.overlay, at[0], at[1], frame.source.width, frame.source.height) : 0;
      for (let ch = 0; ch < 3; ch++) {
        const v = (out[i + ch] ?? 0) / 255;
        out[i + ch] = Math.round((v * (1 - t) + (MASK_OVERLAY_RGB[ch] ?? 0) / 255 * t) * 255);
      }
    }
  }
  return out;
}

/** Share of pixels clipped in each channel at one end of the histogram. */
export interface ClipShares {
  r: number;
  g: number;
  b: number;
}

/**
 * Indicator color for a histogram clipping triangle: the channels with more
 * than `threshold` of their pixels at the end bin, mixed (all three = white),
 * or null when nothing clips.
 */
export function clipIndicatorColor(shares: ClipShares, threshold = 0.001): string | null {
  const on = (v: number) => (v > threshold ? 255 : 0);
  const [r, g, b] = [on(shares.r), on(shares.g), on(shares.b)];
  if (r + g + b === 0) return null;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Per-channel share of pixels in the end bin (0 for shadows, 255 for highlights). */
export function clipShares(h: Histogram, end: 'shadows' | 'highlights'): ClipShares {
  const bin = end === 'shadows' ? 0 : HISTOGRAM_BINS - 1;
  const total = h.r.reduce((n, v) => n + v, 0) || 1;
  return { r: (h.r[bin] ?? 0) / total, g: (h.g[bin] ?? 0) / total, b: (h.b[bin] ?? 0) / total };
}
