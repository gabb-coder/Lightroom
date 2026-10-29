/**
 * Logo watermark (M23): placed on the finished export at its final size.
 * Pure CPU code: the export composites with these functions directly (no
 * GPU twin), and the e2e reference uses the same ones.
 *
 * The logo is resampled on premultiplied alpha (so transparent pixels never
 * bleed their color into the edges), by area averaging when it shrinks and
 * bilinearly when it grows, then laid "over" the photo on sRGB-encoded
 * values, scaled by the opacity.
 */

export const WATERMARK_POSITIONS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

/** One of the nine grid positions, or a spot set by dragging (M25). */
export type WatermarkAnchor = WatermarkPosition | 'custom';

export interface WatermarkPlacement {
  position: WatermarkAnchor;
  /** Logo width as a percentage of the photo's width (1–100). */
  size: number;
  /** Gap to the photo's edges as a percentage of its shorter side (0–25). */
  inset: number;
  /**
   * For 'custom': where the logo sits in the room left between the margins,
   * 0 (left / top) to 1 (right / bottom). The grid positions are 0, ½ and 1.
   */
  x?: number;
  y?: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The logo's size, the margin, and the room left to move it in, in whole pixels. */
function layout(image: Size, logo: Size, p: WatermarkPlacement) {
  const inset = Math.round((Math.min(image.width, image.height) * p.inset) / 100);
  const room = { width: Math.max(1, image.width - 2 * inset), height: Math.max(1, image.height - 2 * inset) };
  let width = (image.width * p.size) / 100;
  let height = (width * logo.height) / logo.width;
  const fit = Math.min(1, room.width / width, room.height / height);
  width = Math.max(1, Math.round(width * fit));
  height = Math.max(1, Math.round(height * fit));
  return { inset, width, height, free: { x: room.width - width, y: room.height - height } };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Where the logo sits in its free room, 0–1 across and down. */
export function placementFractions(p: WatermarkPlacement): { x: number; y: number } {
  if (p.position === 'custom') return { x: clamp01(p.x ?? 0.5), y: clamp01(p.y ?? 0.5) };
  const [row, col] = cellOf(p.position);
  return { x: col / 2, y: row / 2 };
}

/**
 * Where the logo goes on an image, in whole pixels. Keeps the logo's aspect,
 * and shrinks it if it wouldn't fit between the insets.
 */
export function watermarkRect(image: Size, logo: Size, p: WatermarkPlacement): Rect {
  const { inset, width, height, free } = layout(image, logo, p);
  const f = placementFractions(p);
  return { x: inset + Math.round(free.x * f.x), y: inset + Math.round(free.y * f.y), width, height };
}

/**
 * The inverse, for dragging: the fractions that put the logo's top-left
 * corner nearest (left, top) in image pixels, kept between the margins.
 */
export function watermarkFractionsAt(image: Size, logo: Size, p: WatermarkPlacement, left: number, top: number): { x: number; y: number } {
  const { inset, free } = layout(image, logo, p);
  const along = (pos: number, room: number) => (room > 0 ? clamp01((pos - inset) / room) : 0.5);
  return { x: along(left, free.x), y: along(top, free.y) };
}

/**
 * Snaps fractions within `tolerance` of the grid (0, ½, 1) onto it; when
 * both snap, the result is that grid position, otherwise 'custom'.
 */
export function snapPlacement(x: number, y: number, tolerance: number): { position: WatermarkAnchor; x: number; y: number } {
  const snap = (v: number) => [0, 0.5, 1].find((g) => Math.abs(v - g) <= tolerance) ?? clamp01(v);
  const sx = snap(x);
  const sy = snap(y);
  const onGrid = (v: number) => v === 0 || v === 0.5 || v === 1;
  const position = onGrid(sx) && onGrid(sy) ? (WATERMARK_POSITIONS[sy * 6 + sx * 2] ?? 'custom') : 'custom';
  return { position, x: sx, y: sy };
}

/** Row and column (0–2) of a position in the 3 × 3 grid. */
export function cellOf(position: WatermarkPosition): [number, number] {
  const i = WATERMARK_POSITIONS.indexOf(position);
  return [Math.floor(i / 3), i % 3];
}

/**
 * Weights for resampling n source pixels to m: for each target pixel, the
 * source pixels it covers and how much (area averaging when shrinking,
 * linear interpolation between centers when growing). Weights sum to 1.
 */
export function resampleWeights(n: number, m: number): { index: number; weight: number }[][] {
  const out: { index: number; weight: number }[][] = [];
  const scale = n / m;
  for (let t = 0; t < m; t++) {
    const taps: { index: number; weight: number }[] = [];
    if (scale >= 1) {
      // Target pixel t covers source [t·scale, (t+1)·scale).
      const a = t * scale;
      const b = a + scale;
      for (let s = Math.floor(a); s < Math.min(n, Math.ceil(b)); s++) {
        const w = Math.min(b, s + 1) - Math.max(a, s);
        if (w > 1e-12) taps.push({ index: s, weight: w / scale });
      }
    } else {
      const c = (t + 0.5) * scale - 0.5;
      const s0 = Math.floor(c);
      const f = c - s0;
      const clamp = (i: number) => Math.min(n - 1, Math.max(0, i));
      if (f > 0) taps.push({ index: clamp(s0), weight: 1 - f }, { index: clamp(s0 + 1), weight: f });
      else taps.push({ index: clamp(s0), weight: 1 });
    }
    out.push(taps);
  }
  return out;
}

/** The logo resampled to `size`, as premultiplied RGBA floats in 0–1. */
export function resizeLogo(logo: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, size: Size): Float32Array {
  // Premultiply.
  const src = new Float32Array(logo.width * logo.height * 4);
  for (let i = 0; i < src.length; i += 4) {
    const a = (logo.data[i + 3] ?? 0) / 255;
    src[i] = ((logo.data[i] ?? 0) / 255) * a;
    src[i + 1] = ((logo.data[i + 1] ?? 0) / 255) * a;
    src[i + 2] = ((logo.data[i + 2] ?? 0) / 255) * a;
    src[i + 3] = a;
  }
  // Separable: rows first, then columns.
  const wx = resampleWeights(logo.width, size.width);
  const wy = resampleWeights(logo.height, size.height);
  const rows = new Float32Array(size.width * logo.height * 4);
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < size.width; x++) {
      for (const { index, weight } of wx[x] ?? []) {
        for (let c = 0; c < 4; c++) rows[(y * size.width + x) * 4 + c] = (rows[(y * size.width + x) * 4 + c] ?? 0) + (src[(y * logo.width + index) * 4 + c] ?? 0) * weight;
      }
    }
  }
  const out = new Float32Array(size.width * size.height * 4);
  for (let y = 0; y < size.height; y++) {
    for (const { index, weight } of wy[y] ?? []) {
      for (let x = 0; x < size.width; x++) {
        for (let c = 0; c < 4; c++) out[(y * size.width + x) * 4 + c] = (out[(y * size.width + x) * 4 + c] ?? 0) + (rows[(index * size.width + x) * 4 + c] ?? 0) * weight;
      }
    }
  }
  return out;
}

/**
 * Lays the logo over an RGBA8 image (in place): out = logo + photo · (1 − α),
 * with the logo's premultiplied color and alpha scaled by `opacity` (0–1).
 */
export function compositeLogo(image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, logo: Float32Array, rect: Rect, opacity: number): void {
  for (let y = 0; y < rect.height; y++) {
    const iy = rect.y + y;
    if (iy < 0 || iy >= image.height) continue;
    for (let x = 0; x < rect.width; x++) {
      const ix = rect.x + x;
      if (ix < 0 || ix >= image.width) continue;
      const l = (y * rect.width + x) * 4;
      const a = (logo[l + 3] ?? 0) * opacity;
      if (a <= 0) continue;
      const i = (iy * image.width + ix) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (logo[l + c] ?? 0) * opacity + ((image.data[i + c] ?? 0) / 255) * (1 - a);
        image.data[i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
    }
  }
}

/** Places and composites a logo onto an RGBA8 image, in place. */
export function applyWatermark(
  image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
  logo: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
  placement: WatermarkPlacement,
  opacity: number,
): Rect {
  const rect = watermarkRect(image, logo, placement);
  compositeLogo(image, resizeLogo(logo, rect), rect, opacity);
  return rect;
}

/** Shadow color for text of color `hex` (#rrggbb): dark behind light text, light behind dark text. */
export function textShadowColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 709 luma of the encoded values is enough to pick a side.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.5 ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.55)';
}
