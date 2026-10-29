import { describe, expect, it } from 'vitest';
import { applyWatermark, compositeLogo, resampleWeights, resizeLogo, textShadowColor, watermarkRect, WATERMARK_POSITIONS } from './watermark';

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
