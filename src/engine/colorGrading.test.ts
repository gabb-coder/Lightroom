import { describe, expect, it } from 'vitest';
import { linearToSrgb, srgbToLinear, type Rgb } from './color';
import { applyColorGrading, colorGradingParams, GRADE_LUM_STRENGTH, gradeWeights } from './colorGrading';
import { pipelineParams, processPixel } from './pipeline';
import { defaultColorGrading, defaultEditSettings, type ColorGradingSettings } from '../model/editSettings';

const grading = (patch: (g: ColorGradingSettings) => void) => {
  const g = defaultColorGrading();
  patch(g);
  return g;
};
const gray = (v: number): Rgb => [srgbToLinear(v), srgbToLinear(v), srgbToLinear(v)];
const encoded = (c: Rgb) => c.map(linearToSrgb);
const luma = (e: number[]) => 0.2126 * (e[0] ?? 0) + 0.7152 * (e[1] ?? 0) + 0.0722 * (e[2] ?? 0);

describe('color grading', () => {
  it('is skipped when every wheel is neutral (blending/balance alone change nothing)', () => {
    expect(colorGradingParams(defaultColorGrading())).toBeNull();
    expect(colorGradingParams(grading((g) => ((g.blending = 0), (g.balance = 80))))).toBeNull();
    const c: Rgb = [0.2, 0.4, 0.6];
    expect(applyColorGrading(c, null)).toBe(c);
  });

  it('weights: shadows at black, highlights at white, split at the balance point', () => {
    const p = colorGradingParams(grading((g) => (g.global.sat = 10)));
    if (!p) throw new Error('expected params');
    expect(gradeWeights(0, p)).toEqual([1, 0, 0]);
    const [s1, , h1] = gradeWeights(1, p);
    expect([s1, h1]).toEqual([0, 1]);
    const [sMid, mMid, hMid] = gradeWeights(p.pivot, p);
    expect(sMid).toBeCloseTo(0.5, 9);
    expect(hMid).toBeCloseTo(0.5, 9);
    expect(mMid).toBe(1);
    // Positive balance moves the split down (more of the image counts as highlights).
    const bright = colorGradingParams(grading((g) => ((g.global.sat = 10), (g.balance = 100))));
    expect(bright?.pivot).toBeLessThan(p.pivot);
  });

  it('blending widens the overlap between shadows and highlights', () => {
    const at = (blending: number) => {
      const p = colorGradingParams(grading((g) => ((g.global.sat = 10), (g.blending = blending))));
      if (!p) throw new Error('expected params');
      return gradeWeights(p.pivot - 0.2, p)[2];
    };
    expect(at(0)).toBe(0);
    expect(at(100)).toBeGreaterThan(0.2);
  });

  it('tints toward the wheel hue without changing luma (before clipping)', () => {
    for (const [hue, channel] of [[0, 0], [120, 1], [240, 2]] as const) {
      const p = colorGradingParams(grading((g) => (g.global = { hue, sat: 60, lum: 0 })));
      const before = encoded(gray(0.5));
      const after = encoded(applyColorGrading(gray(0.5), p));
      expect(luma(after)).toBeCloseTo(luma(before), 9);
      expect(after[channel]).toBeGreaterThan((before[channel] ?? 0) + 0.02);
    }
  });

  it('shadows tint dark pixels, highlights tint bright ones', () => {
    const p = colorGradingParams(grading((g) => ((g.shadows = { hue: 220, sat: 80, lum: 0 }), (g.highlights = { hue: 40, sat: 80, lum: 0 }))));
    const dark = encoded(applyColorGrading(gray(0.15), p));
    const light = encoded(applyColorGrading(gray(0.9), p));
    expect((dark[2] ?? 0) - (dark[0] ?? 0)).toBeGreaterThan(0.08); // blue-ish shadows
    expect((light[0] ?? 0) - (light[2] ?? 0)).toBeGreaterThan(0.08); // warm highlights
  });

  it('luminance offsets brighten or darken each range', () => {
    const p = colorGradingParams(grading((g) => (g.global.lum = 100)));
    expect(encoded(applyColorGrading(gray(0.4), p))[0]).toBeCloseTo(0.4 + GRADE_LUM_STRENGTH, 9);
    const shadowsDown = colorGradingParams(grading((g) => (g.shadows.lum = -100)));
    expect(encoded(applyColorGrading(gray(0.1), shadowsDown))[0]).toBeLessThan(0.02);
    expect(encoded(applyColorGrading(gray(0.95), shadowsDown))[0]).toBeCloseTo(0.95, 2);
  });

  it('runs after B&W, so it split-tones monochrome photos', () => {
    const s = defaultEditSettings();
    s.basic.treatment = 'bw';
    s.colorGrading.shadows = { hue: 220, sat: 60, lum: 0 };
    const out = processPixel([0.3, 0.2, 0.25], pipelineParams(s));
    expect(out[2] - out[0]).toBeGreaterThan(0.03);
  });
});
