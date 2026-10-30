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
  /** Turn in degrees, clockwise (M35); the mark is placed by its turned bounding box. */
  rotation?: number;
}

/** Repeat the mark across the whole photo (M35); `spacing` = gap as % of the mark's size. */
export interface WatermarkPattern {
  spacing: number;
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

/** Bounding box of a w × h box turned by `deg`. */
export function rotatedBox(width: number, height: number, deg: number): Size {
  if (!deg) return { width, height };
  const t = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { width: width * c + height * s, height: width * s + height * c };
}

/**
 * The logo's own size (`inner`), its (turned) bounding box, the margin and
 * the room left to move it in, in whole pixels. Without a turn the box is
 * the logo itself.
 */
function layout(image: Size, logo: Size, p: WatermarkPlacement) {
  const inset = Math.round((Math.min(image.width, image.height) * p.inset) / 100);
  const room = { width: Math.max(1, image.width - 2 * inset), height: Math.max(1, image.height - 2 * inset) };
  let width = (image.width * p.size) / 100;
  let height = (width * logo.height) / logo.width;
  const turned = rotatedBox(width, height, p.rotation ?? 0);
  const fit = Math.min(1, room.width / turned.width, room.height / turned.height);
  width = Math.max(1, Math.round(width * fit));
  height = Math.max(1, Math.round(height * fit));
  const box = rotatedBox(width, height, p.rotation ?? 0);
  const boxW = Math.max(1, Math.round(box.width));
  const boxH = Math.max(1, Math.round(box.height));
  return { inset, inner: { width, height }, width: boxW, height: boxH, free: { x: Math.max(0, room.width - boxW), y: Math.max(0, room.height - boxH) } };
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
  return watermarkGeometry(image, logo, p).rect;
}

/** The (turned) mark's bounding box on the image, and the mark's own size inside it. */
export function watermarkGeometry(image: Size, logo: Size, p: WatermarkPlacement): { rect: Rect; inner: Size } {
  const { inset, inner, width, height, free } = layout(image, logo, p);
  const f = placementFractions(p);
  return { rect: { x: inset + Math.round(free.x * f.x), y: inset + Math.round(free.y * f.y), width, height }, inner };
}

/**
 * Where the tiles of a repeated mark go (M35): rows of `tile`-sized boxes
 * with gaps of `spacing` % of the tile, every other row shifted by half a
 * step (brick pattern), centered on the image and covering it to the edges.
 */
export function patternRects(image: Size, tile: Size, pattern: WatermarkPattern): Rect[] {
  const gapX = Math.round((tile.width * pattern.spacing) / 100);
  const gapY = Math.round((tile.height * pattern.spacing) / 100);
  const stepX = tile.width + gapX;
  const stepY = tile.height + gapY;
  const rows = Math.ceil(image.height / stepY) + 1;
  const cols = Math.ceil(image.width / stepX) + 2;
  const y0 = Math.round((image.height - (rows * stepY - gapY)) / 2);
  const x0 = Math.round((image.width - (cols * stepX - gapX)) / 2);
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 === 1 ? Math.round(stepX / 2) : 0;
    for (let c = 0; c < cols; c++) {
      const rect = { x: x0 + c * stepX + shift - Math.round(stepX / 2), y: y0 + r * stepY, width: tile.width, height: tile.height };
      if (rect.x < image.width && rect.y < image.height && rect.x + rect.width > 0 && rect.y + rect.height > 0) out.push(rect);
    }
  }
  return out;
}

/**
 * A resized (premultiplied) mark turned by `deg` clockwise into a box of
 * `box` size, centered; bilinear, transparent outside the mark.
 */
export function rotateRaster(raster: Float32Array, size: Size, deg: number, box: Size): Float32Array {
  const out = new Float32Array(box.width * box.height * 4);
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const at = (i: number, j: number, c: number) => (i < 0 || j < 0 || i >= size.width || j >= size.height ? 0 : (raster[(j * size.width + i) * 4 + c] ?? 0));
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      // Box pixel center → the mark's own pixel coordinates (inverse turn).
      const dx = x + 0.5 - box.width / 2;
      const dy = y + 0.5 - box.height / 2;
      const u = dx * cos + dy * sin + size.width / 2 - 0.5;
      const v = -dx * sin + dy * cos + size.height / 2 - 0.5;
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      const fx = u - i0;
      const fy = v - j0;
      for (let c = 0; c < 4; c++) {
        const top = at(i0, j0, c) * (1 - fx) + at(i0 + 1, j0, c) * fx;
        const bottom = at(i0, j0 + 1, c) * (1 - fx) + at(i0 + 1, j0 + 1, c) * fx;
        out[(y * box.width + x) * 4 + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
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

/**
 * Places and composites a logo onto an RGBA8 image, in place: resized,
 * turned if asked (M35), once at its place or repeated across the photo.
 * Returns the placed box (the first tile's, for a pattern).
 */
export function applyWatermark(
  image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
  logo: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
  placement: WatermarkPlacement,
  opacity: number,
  pattern: WatermarkPattern | null = null,
): Rect {
  const { rect, inner } = watermarkGeometry(image, logo, pattern ? { ...placement, inset: 0 } : placement);
  const resized = resizeLogo(logo, inner);
  const raster = placement.rotation ? rotateRaster(resized, inner, placement.rotation, rect) : resized;
  const tiles = pattern ? patternRects(image, rect, pattern) : [rect];
  for (const tile of tiles) compositeLogo(image, raster, tile, opacity);
  return tiles[0] ?? rect;
}

/** Shadow color for text of color `hex` (#rrggbb): dark behind light text, light behind dark text. */
export function textShadowColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 709 luma of the encoded values is enough to pick a side.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.5 ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.55)';
}
