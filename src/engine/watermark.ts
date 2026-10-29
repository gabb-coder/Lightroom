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

export interface WatermarkPlacement {
  position: WatermarkPosition;
  /** Logo width as a percentage of the photo's width (1–100). */
  size: number;
  /** Gap to the photo's edges as a percentage of its shorter side (0–25). */
  inset: number;
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

/**
 * Where the logo goes on an image, in whole pixels. Keeps the logo's aspect,
 * and shrinks it if it wouldn't fit between the insets.
 */
export function watermarkRect(image: Size, logo: Size, p: WatermarkPlacement): Rect {
  const inset = Math.round((Math.min(image.width, image.height) * p.inset) / 100);
  const room = { width: Math.max(1, image.width - 2 * inset), height: Math.max(1, image.height - 2 * inset) };
  let width = (image.width * p.size) / 100;
  let height = (width * logo.height) / logo.width;
  const fit = Math.min(1, room.width / width, room.height / height);
  width = Math.max(1, Math.round(width * fit));
  height = Math.max(1, Math.round(height * fit));
  const [row, col] = cellOf(p.position);
  const along = (free: number, cell: number) => (cell === 0 ? inset : cell === 2 ? inset + free : inset + Math.round(free / 2));
  return { x: along(room.width - width, col), y: along(room.height - height, row), width, height };
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
