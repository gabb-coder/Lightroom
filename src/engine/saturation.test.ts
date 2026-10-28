import { describe, expect, it } from 'vitest';
import { luminance } from './color';
import { applySaturation, saturationScale } from './saturation';

describe('saturation', () => {
  it('is identity at 0', () => {
    expect(applySaturation([0.2, 0.5, 0.1], saturationScale(0))).toEqual([0.2, 0.5, 0.1]);
  });

  it('turns colors into gray of equal luminance at -100', () => {
    const c = [0.8, 0.2, 0.05] as const;
    const [r, g, b] = applySaturation(c, saturationScale(-100));
    expect(r).toBeCloseTo(g, 12);
    expect(g).toBeCloseTo(b, 12);
    expect(r).toBeCloseTo(luminance(c), 12);
  });

  it('increases channel spread at +100 and preserves luminance when nothing clips', () => {
    const c = [0.4, 0.3, 0.25] as const;
    const out = applySaturation(c, saturationScale(100));
    expect(out[0] - out[2]).toBeCloseTo(2 * (c[0] - c[2]), 12);
    expect(luminance(out)).toBeCloseTo(luminance(c), 12);
  });

  it('leaves grays untouched and never goes negative', () => {
    expect(applySaturation([0.3, 0.3, 0.3], saturationScale(100))).toEqual([0.3, 0.3, 0.3]);
    expect(Math.min(...applySaturation([0.9, 0.01, 0.01], saturationScale(100)))).toBeGreaterThanOrEqual(0);
  });
});
