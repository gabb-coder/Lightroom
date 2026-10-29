import { describe, expect, it } from 'vitest';
import { luminance } from './color';
import { applyWhiteBalance, whiteBalanceGains } from './whiteBalance';

describe('white balance', () => {
  it('is exactly identity at 0 / 0', () => {
    expect(whiteBalanceGains(0, 0)).toEqual([1, 1, 1]);
  });

  it('warms with positive Temp and cools with negative Temp', () => {
    const warm = applyWhiteBalance([0.5, 0.5, 0.5], whiteBalanceGains(100, 0));
    const cool = applyWhiteBalance([0.5, 0.5, 0.5], whiteBalanceGains(-100, 0));
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
  });

  it('adds magenta with positive Tint and green with negative Tint', () => {
    const magenta = whiteBalanceGains(0, 100);
    const green = whiteBalanceGains(0, -100);
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(green[1]).toBeGreaterThan(green[0]);
  });

  it('keeps the luminance of neutral gray', () => {
    for (const [t, k] of [
      [100, 0],
      [-60, 40],
      [30, -100],
    ] as const) {
      expect(luminance(applyWhiteBalance([0.3, 0.3, 0.3], whiteBalanceGains(t, k)))).toBeCloseTo(0.3, 12);
    }
  });
});
