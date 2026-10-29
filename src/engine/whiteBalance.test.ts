import { describe, expect, it } from 'vitest';
import { luminance, srgbToLinear } from './color';
import { applyWhiteBalance, averageLinear, neutralizingWhiteBalance, whiteBalanceGains } from './whiteBalance';

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

describe('neutralizingWhiteBalance (eyedropper)', () => {
  const spread = (c: readonly number[]) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);

  it('makes a tinted gray neutral', () => {
    for (const color of [
      [0.3, 0.25, 0.18],
      [0.12, 0.15, 0.2],
      [0.5, 0.42, 0.5],
      [0.2, 0.24, 0.21],
    ] as const) {
      const wb = neutralizingWhiteBalance(color);
      expect(wb).not.toBeNull();
      const out = applyWhiteBalance(color, whiteBalanceGains(wb?.temp ?? 0, wb?.tint ?? 0));
      // Rounding to whole slider steps leaves well under 1% of cast.
      expect(spread(out), color.join(',')).toBeLessThan(0.01);
    }
  });

  it('leaves a neutral gray at 0 / 0 and clamps impossible casts', () => {
    expect(neutralizingWhiteBalance([0.4, 0.4, 0.4])).toEqual({ temp: 0, tint: 0 });
    expect(neutralizingWhiteBalance([0.9, 0.5, 0.01])).toEqual({ temp: -100, tint: expect.any(Number) as number }); // orange: as cool as it goes
    expect(neutralizingWhiteBalance([0, 0, 0])).toBeNull();
  });
});

describe('averageLinear', () => {
  it('averages in linear light, then the eyedropper neutralizes the sampled patch', () => {
    // A warm gray patch with a little noise, as 8-bit sRGB.
    const patch = new Uint8Array([190, 176, 160, 255, 194, 174, 158, 255, 188, 178, 162, 255, 192, 176, 160, 255]);
    const avg = averageLinear(patch);
    expect(avg?.[0]).toBeCloseTo(srgbToLinear(191 / 255), 2);
    const wb = neutralizingWhiteBalance(avg ?? [0, 0, 0]);
    const out = applyWhiteBalance(avg ?? [0, 0, 0], whiteBalanceGains(wb?.temp ?? 0, wb?.tint ?? 0));
    expect((Math.max(...out) - Math.min(...out)) / Math.max(...out)).toBeLessThan(0.01);
    expect(wb?.temp).toBeLessThan(0); // warm cast → cooler
    expect(averageLinear(new Uint8Array(0))).toBeNull();
  });
});
