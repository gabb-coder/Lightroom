import { describe, expect, it } from 'vitest';
import {
  applyWatermark,
  compositeLogo,
  patternRects,
  placementFractions,
  rotatedBox,
  rotateRaster,
  resampleWeights,
  resizeLogo,
  snapPlacement,
  textShadowColor,
  watermarkFractionsAt,
  watermarkGeometry,
  watermarkRect,
  WATERMARK_POSITIONS,
} from './watermark';

const IMAGE = { width: 1000, height: 600 };
const LOGO = { width: 200, height: 100 };

/** A solid RGBA8 image. */
function solid(width: number, height: number, rgba: number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

describe('watermark placement', () => {
  it('puts the logo in each of the nine positions, inset from the edges', () => {
    // 15% of 1000 = 150 × 75; inset 5% of 600 = 30.
    const at = (position: (typeof WATERMARK_POSITIONS)[number]) => watermarkRect(IMAGE, LOGO, { position, size: 15, inset: 5 });
    expect(at('bottom-right')).toEqual({ x: 1000 - 30 - 150, y: 600 - 30 - 75, width: 150, height: 75 });
    expect(at('top-left')).toEqual({ x: 30, y: 30, width: 150, height: 75 });
    expect(at('center')).toEqual({ x: 425, y: 263, width: 150, height: 75 });
    expect(at('top')).toMatchObject({ x: 425, y: 30 });
    expect(at('left')).toMatchObject({ x: 30, y: 263 });
    expect(at('bottom')).toMatchObject({ x: 425, y: 495 });
    for (const p of WATERMARK_POSITIONS) {
      const r = at(p);
      expect(r.x).toBeGreaterThanOrEqual(30);
      expect(r.y + r.height).toBeLessThanOrEqual(570);
    }
  });

  it('places a dragged (custom) logo by fractions of the room between the margins', () => {
    const at = (x: number, y: number) => watermarkRect(IMAGE, LOGO, { position: 'custom', size: 15, inset: 5, x, y });
    // Room: 1000 − 60 − 150 = 790 across, 600 − 60 − 75 = 465 down.
    expect(at(0, 0)).toEqual({ x: 30, y: 30, width: 150, height: 75 });
    expect(at(1, 1)).toEqual(watermarkRect(IMAGE, LOGO, { position: 'bottom-right', size: 15, inset: 5 }));
    expect(at(0.25, 0.6)).toMatchObject({ x: 30 + Math.round(790 * 0.25), y: 30 + Math.round(465 * 0.6) });
    // Never past the margins.
    expect(at(-2, 3)).toEqual(at(0, 1));
    // The grid positions are the fractions 0, ½ and 1, pixel for pixel.
    for (const position of WATERMARK_POSITIONS) {
      const f = placementFractions({ position, size: 15, inset: 5 });
      expect(at(f.x, f.y)).toEqual(watermarkRect(IMAGE, LOGO, { position, size: 15, inset: 5 }));
    }
  });

  it('finds the fractions for a dragged corner, kept inside the margins', () => {
    const p = { position: 'custom' as const, size: 15, inset: 5 };
    const f = watermarkFractionsAt(IMAGE, LOGO, p, 30 + 790 * 0.4, 30 + 465 * 0.75);
    expect(f.x).toBeCloseTo(0.4, 9);
    expect(f.y).toBeCloseTo(0.75, 9);
    expect(watermarkRect(IMAGE, LOGO, { ...p, ...f })).toMatchObject({ x: 30 + 316, y: 30 + Math.round(348.75) });
    expect(watermarkFractionsAt(IMAGE, LOGO, p, -500, 5000)).toEqual({ x: 0, y: 1 });
    // A logo as wide as the room has nowhere to go across: it stays centered.
    expect(watermarkFractionsAt(IMAGE, LOGO, { ...p, size: 100 }, 400, 0).x).toBe(0.5);
  });

  it('snaps near the grid onto it, and names the position when both axes snap', () => {
    expect(snapPlacement(0.99, 0.015, 0.02)).toEqual({ position: 'top-right', x: 1, y: 0 });
    expect(snapPlacement(0.51, 0.49, 0.02)).toEqual({ position: 'center', x: 0.5, y: 0.5 });
    expect(snapPlacement(0.3, 0.995, 0.02)).toEqual({ position: 'custom', x: 0.3, y: 1 });
    expect(snapPlacement(1.4, -0.2, 0)).toEqual({ position: 'top-right', x: 1, y: 0 });
    for (const position of WATERMARK_POSITIONS) {
      const f = placementFractions({ position, size: 1, inset: 0 });
      expect(snapPlacement(f.x, f.y, 0).position).toBe(position);
    }
  });

  it('shrinks a logo that would not fit, keeping its shape', () => {
    const tall = watermarkRect({ width: 1000, height: 200 }, { width: 100, height: 400 }, { position: 'center', size: 50, inset: 10 });
    expect(tall.height).toBe(160); // 200 − 2 × 20
    expect(tall.width).toBe(40);
  });
});

describe('logo resampling', () => {
  it('weights sum to one, shrinking and growing', () => {
    for (const [n, m] of [
      [200, 150],
      [7, 3],
      [3, 8],
      [100, 100],
    ] as const) {
      for (const taps of resampleWeights(n, m)) expect(taps.reduce((s, t) => s + t.weight, 0)).toBeCloseTo(1, 9);
    }
  });

  it('keeps flat colors flat and does not bleed the color of transparent pixels into edges', () => {
    // Left half opaque white, right half transparent RED (its color must not show).
    const logo = solid(8, 4, [255, 255, 255, 255]);
    for (let y = 0; y < 4; y++) for (let x = 4; x < 8; x++) logo.data.set([255, 0, 0, 0], (y * 8 + x) * 4);
    const out = resizeLogo(logo, { width: 3, height: 2 });
    // Middle pixel straddles the edge: half covered, still pure white once un-premultiplied.
    const a = out[1 * 4 + 3] ?? 0;
    expect(a).toBeGreaterThan(0.2);
    expect(a).toBeLessThan(0.8);
    expect((out[1 * 4 + 1] ?? 0) / a).toBeCloseTo(1, 6); // green: no red bleed
    expect(out[0 * 4 + 3]).toBeCloseTo(1, 6);
    expect(out[2 * 4 + 3]).toBeCloseTo(0, 6);
  });
});

describe('compositing', () => {
  it('lays the logo over the photo with its alpha and the opacity', () => {
    const image = solid(4, 1, [0, 0, 0, 255]);
    const logo = new Float32Array([1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]); // white, half-transparent white, clear
    compositeLogo(image, logo, { x: 1, y: 0, width: 3, height: 1 }, 1);
    expect(Array.from(image.data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255]);
    const faded = solid(1, 1, [100, 100, 100, 255]);
    compositeLogo(faded, new Float32Array([1, 1, 1, 1]), { x: 0, y: 0, width: 1, height: 1 }, 0.5);
    expect(Array.from(faded.data)).toEqual([178, 178, 178, 255]); // 255·0.5 + 100·0.5
  });

  it('only touches the logo rectangle', () => {
    const image = solid(100, 60, [10, 20, 30, 255]);
    const rect = applyWatermark(image, solid(20, 10, [255, 255, 255, 255]), { position: 'bottom-right', size: 20, inset: 5 }, 1);
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 100; x++) {
        const inside = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
        expect(image.data[(y * 100 + x) * 4]).toBe(inside ? 255 : 10);
      }
    }
  });
});

describe('text watermark shadow', () => {
  it('is dark behind light text and light behind dark text', () => {
    expect(textShadowColor('#ffffff')).toBe('rgba(0, 0, 0, 0.55)');
    expect(textShadowColor('#ffd400')).toBe('rgba(0, 0, 0, 0.55)');
    expect(textShadowColor('#000000')).toBe('rgba(255, 255, 255, 0.55)');
    expect(textShadowColor('#1e3a8a')).toBe('rgba(255, 255, 255, 0.55)');
  });
});

describe('turned and repeated marks (M35)', () => {
  it('without a turn the box is the mark itself and the result is what it was before', () => {
    const p = { position: 'bottom-right' as const, size: 20, inset: 3 };
    const g = watermarkGeometry(IMAGE, LOGO, { ...p, rotation: 0 });
    expect(g.rect).toEqual(watermarkRect(IMAGE, LOGO, p));
    expect(g.inner).toEqual({ width: g.rect.width, height: g.rect.height });

    const logo = solid(LOGO.width, LOGO.height, [255, 0, 0, 255]);
    const before = solid(IMAGE.width, IMAGE.height, [10, 20, 30, 255]);
    const rect = watermarkRect(before, logo, p);
    compositeLogo(before, resizeLogo(logo, rect), rect, 0.6);
    const after = solid(IMAGE.width, IMAGE.height, [10, 20, 30, 255]);
    applyWatermark(after, logo, { ...p, rotation: 0 }, 0.6, null);
    let differ = 0;
    for (let i = 0; i < after.data.length; i++) if (after.data[i] !== before.data[i]) differ++;
    expect(differ).toBe(0);
  });

  it('turns about the center: the box grows to hold it and stays between the margins', () => {
    expect(rotatedBox(200, 100, 90).width).toBeCloseTo(100);
    expect(rotatedBox(200, 100, 90).height).toBeCloseTo(200);
    const turned = rotatedBox(200, 100, 45);
    expect(turned.width).toBeCloseTo(turned.height);
    expect(turned.width).toBeCloseTo(150 * Math.SQRT2);

    const g = watermarkGeometry(IMAGE, LOGO, { position: 'bottom-right', size: 30, inset: 2, rotation: 30 });
    expect(g.inner.width).toBe(300);
    expect(g.rect.width).toBeGreaterThan(g.inner.width);
    expect(g.rect.x + g.rect.width).toBe(IMAGE.width - 12);
    expect(g.rect.y + g.rect.height).toBe(IMAGE.height - 12);
    // A big turned mark shrinks to fit, keeping its shape.
    const big = watermarkGeometry(IMAGE, LOGO, { position: 'center', size: 100, inset: 0, rotation: 90 });
    expect(big.rect.height).toBeLessThanOrEqual(IMAGE.height);
    expect(big.inner.width / big.inner.height).toBeCloseTo(2, 1);
  });

  it('turns clockwise, like CSS rotate(): the left end of the mark ends up at the top at 90°', () => {
    // 4 × 2 mark: red left half, blue right half (premultiplied, opaque).
    const size = { width: 4, height: 2 };
    const raster = new Float32Array(4 * 2 * 4);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) raster.set(x < 2 ? [1, 0, 0, 1] : [0, 0, 1, 1], (y * 4 + x) * 4);
    const out = rotateRaster(raster, size, 90, { width: 2, height: 4 });
    const px = (x: number, y: number) => Array.from(out.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    expect(px(0, 0)).toEqual([1, 0, 0, 1]);
    expect(px(1, 3)).toEqual([0, 0, 1, 1]);
    // Outside the turned mark it is transparent.
    const diag = rotateRaster(raster, size, 45, { width: 5, height: 5 });
    expect(diag[3]).toBe(0);
  });

  it('repeats in a brick pattern that covers the photo to its edges without overlapping', () => {
    const tile = { width: 100, height: 40 };
    const rects = patternRects(IMAGE, tile, { spacing: 50 });
    expect(rects.length).toBeGreaterThan(20);
    const rows = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b);
    expect(rows[0]).toBeLessThanOrEqual(20);
    expect((rows.at(-1) ?? 0) + tile.height).toBeGreaterThanOrEqual(IMAGE.height - 20);
    expect((rows[1] ?? 0) - (rows[0] ?? 0)).toBe(60);
    for (const y of rows) {
      const row = rects.filter((r) => r.y === y).sort((a, b) => a.x - b.x);
      expect(row[0]?.x ?? 1).toBeLessThanOrEqual(0);
      expect((row.at(-1)?.x ?? 0) + tile.width).toBeGreaterThanOrEqual(IMAGE.width);
      for (let i = 1; i < row.length; i++) expect((row[i]?.x ?? 0) - (row[i - 1]?.x ?? 0)).toBe(150);
    }
    // Neighbouring rows are shifted by half a step.
    const firstX = (y: number | undefined) => Math.min(...rects.filter((r) => r.y === y).map((r) => r.x));
    expect(Math.abs(firstX(rows[1]) - firstX(rows[0]))).toBe(75);
    // No spacing: the tiles touch.
    const tight = patternRects(IMAGE, tile, { spacing: 0 });
    const tRow = tight.filter((r) => r.y === tight[0]?.y).sort((a, b) => a.x - b.x);
    expect((tRow[1]?.x ?? 0) - (tRow[0]?.x ?? 0)).toBe(tile.width);
  });

  it('a repeated mark is drawn on every tile, ignoring the margin', () => {
    const logo = solid(LOGO.width, LOGO.height, [255, 255, 255, 255]);
    const image = solid(IMAGE.width, IMAGE.height, [0, 0, 0, 255]);
    const first = applyWatermark(image, logo, { position: 'center', size: 10, inset: 10 }, 1, { spacing: 100 });
    const tiles = patternRects(IMAGE, { width: first.width, height: first.height }, { spacing: 100 });
    let white = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] === 255) white++;
    const inside = tiles.reduce((n, t) => {
      const w = Math.min(IMAGE.width, t.x + t.width) - Math.max(0, t.x);
      const h = Math.min(IMAGE.height, t.y + t.height) - Math.max(0, t.y);
      return n + Math.max(0, w) * Math.max(0, h);
    }, 0);
    expect(white).toBe(inside);
    expect(first.width).toBe(100);
  });
});
