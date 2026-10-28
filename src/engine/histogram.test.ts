import { describe, expect, it } from 'vitest';
import { computeHistogram, histogramPath, histogramPeak } from './histogram';

describe('histogram', () => {
  const pixels = new Uint8Array([
    0, 128, 255, 255, //
    0, 128, 10, 255, //
    7, 128, 10, 0,
  ]);

  it('counts each channel into 256 bins', () => {
    const h = computeHistogram(pixels);
    expect(h.r[0]).toBe(2);
    expect(h.r[7]).toBe(1);
    expect(h.g[128]).toBe(3);
    expect(h.b[10]).toBe(2);
    expect(h.b[255]).toBe(1);
    expect(h.r.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('ignores the clipped end bins when finding the display peak', () => {
    const h = computeHistogram(pixels);
    expect(histogramPeak(h)).toBe(3); // green at 128, not the r[0] spike
  });

  it('builds a closed path spanning the box', () => {
    const h = computeHistogram(pixels);
    const path = histogramPath(h.g, histogramPeak(h), 268, 84);
    expect(path.startsWith('M0 84')).toBe(true);
    expect(path.endsWith('L268 84Z')).toBe(true);
    expect(path).toContain('L134.53 0.00'); // bin 128 at full height
  });
});
