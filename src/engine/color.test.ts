import { describe, expect, it } from 'vitest';
import { linearToSrgb, luminance, srgbToLinear } from './color';

describe('sRGB transfer functions', () => {
  it('matches known reference values', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041, 6);
    expect(linearToSrgb(0.18)).toBeCloseTo(0.461356, 6);
  });

  // The IEC constants leave a ~3e-8 jump at the breakpoint; far below 1/255.
  it('is continuous at the linear/power breakpoint', () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(srgbToLinear(0.0404500001), 6);
    expect(linearToSrgb(0.0031308)).toBeCloseTo(linearToSrgb(0.0031308001), 6);
  });

  it('round-trips every 8-bit value exactly', () => {
    for (let v = 0; v <= 255; v++) {
      expect(Math.round(linearToSrgb(srgbToLinear(v / 255)) * 255)).toBe(v);
    }
  });
});

describe('luminance', () => {
  it('weights sum to 1 so gray stays gray', () => {
    expect(luminance([0.4, 0.4, 0.4])).toBeCloseTo(0.4, 12);
  });
});
