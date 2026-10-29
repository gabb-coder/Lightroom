import { describe, expect, it } from 'vitest';
import { clipIndicatorColor, clipOverlay, clipShares, displayRgba8, HIGHLIGHT_CLIP_RGB, isPlainDisplay, NO_DISPLAY, SHADOW_CLIP_RGB, showsBefore } from './display';
import { computeHistogram } from './histogram';

const px = (...rgb: number[][]) => new Uint8Array(rgb.flatMap((c) => [...c, 255]));

describe('clipping overlay', () => {
  it('paints only pure white and pure black, and only when asked', () => {
    const both = { shadows: true, highlights: true };
    expect(clipOverlay(255, 255, 255, both)).toEqual(HIGHLIGHT_CLIP_RGB);
    expect(clipOverlay(0, 0, 0, both)).toEqual(SHADOW_CLIP_RGB);
    expect(clipOverlay(255, 255, 254, both)).toBeNull();
    expect(clipOverlay(255, 0, 0, both)).toBeNull(); // saturated red is not clipped to white or black
    expect(clipOverlay(1, 0, 0, both)).toBeNull();
    expect(clipOverlay(255, 255, 255, { shadows: true, highlights: false })).toBeNull();
    expect(clipOverlay(0, 0, 0, { shadows: false, highlights: true })).toBeNull();
  });

  it('skips transparent padding', () => {
    const img = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]);
    expect(Array.from(displayRgba8(img, null, 2, { shadows: true, highlights: true, split: null }))).toEqual([0, 0, 0, 0, ...SHADOW_CLIP_RGB, 255]);
  });

  it('leaves the image alone with no options', () => {
    const img = px([0, 0, 0], [255, 255, 255], [10, 20, 30]);
    expect(isPlainDisplay(NO_DISPLAY)).toBe(true);
    expect(Array.from(displayRgba8(img, null, 3, NO_DISPLAY))).toEqual(Array.from(img));
  });
});

describe('split view', () => {
  it('uses pixel centers: columns left of the split show Before', () => {
    expect([0, 1, 2, 3].map((x) => showsBefore(x, 4, 0.5))).toEqual([true, true, false, false]);
    expect([0, 1, 2, 3].map((x) => showsBefore(x, 4, 0.3))).toEqual([true, false, false, false]);
    expect(showsBefore(0, 4, null)).toBe(false);
    expect(showsBefore(3, 4, 1)).toBe(true);
  });

  it('composes Before and After, then the clipping overlay on both halves', () => {
    const after = px([255, 255, 255], [9, 9, 9], [255, 255, 255], [9, 9, 9]);
    const before = px([1, 2, 3], [0, 0, 0], [4, 5, 6], [7, 8, 9]);
    const out = displayRgba8(after, before, 4, { shadows: true, highlights: true, split: 0.5 });
    expect(Array.from(out)).toEqual(Array.from(px([1, 2, 3], [...SHADOW_CLIP_RGB], [...HIGHLIGHT_CLIP_RGB], [9, 9, 9])));
  });
});

describe('histogram clipping indicators', () => {
  it('mixes the colors of the channels that clip', () => {
    const h = computeHistogram(px([255, 255, 0], [255, 10, 0], [20, 30, 40], [0, 0, 0]));
    const hi = clipShares(h, 'highlights');
    expect(hi).toEqual({ r: 0.5, g: 0.25, b: 0 });
    expect(clipIndicatorColor(hi)).toBe('rgb(255, 255, 0)');
    expect(clipIndicatorColor(clipShares(h, 'shadows'))).toBe('rgb(255, 255, 255)');
    expect(clipIndicatorColor({ r: 0, g: 0, b: 0 })).toBeNull();
    expect(clipIndicatorColor({ r: 0.0005, g: 0, b: 0 })).toBeNull(); // below the threshold
  });
});
