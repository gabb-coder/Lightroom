import { describe, expect, it } from 'vitest';
import { srgbToLinear } from './color';
import { applyCurve, buildCurveLut, CURVE_LUT_SIZE, isIdentityCurveSet, monotoneSpline, sampleLut } from './curve';

const ID = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];
const set = (patch: Partial<Record<'rgb' | 'r' | 'g' | 'b', { x: number; y: number }[]>>) => ({ rgb: ID, r: ID, g: ID, b: ID, ...patch });

describe('monotone spline', () => {
  it('passes through every point and is linear for two points', () => {
    const pts = [
      { x: 0, y: 0.1 },
      { x: 0.3, y: 0.2 },
      { x: 0.6, y: 0.75 },
      { x: 1, y: 0.9 },
    ];
    const f = monotoneSpline(pts);
    for (const p of pts) expect(f(p.x)).toBeCloseTo(p.y, 12);
    expect(monotoneSpline(ID)(0.37)).toBeCloseTo(0.37, 12);
  });

  it('never overshoots: monotone data gives a monotone curve within the point range', () => {
    const f = monotoneSpline([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.05 },
      { x: 0.5, y: 0.9 },
      { x: 1, y: 1 },
    ]);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const y = f(i / 1000);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(y).toBeLessThanOrEqual(1 + 1e-12);
      prev = y;
    }
  });

  it('is flat outside the first and last point', () => {
    const f = monotoneSpline([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.6 },
    ]);
    expect(f(0)).toBe(0.3);
    expect(f(1)).toBe(0.6);
  });
});

describe('curve lookup table', () => {
  it('is skipped entirely for identity curves', () => {
    expect(isIdentityCurveSet(set({}))).toBe(true);
    expect(applyCurve([0.2, 2.5, 0.01], null)).toEqual([0.2, 2.5, 0.01]);
  });

  it('composes the RGB curve with each channel curve', () => {
    const lift = [
      { x: 0, y: 0.2 },
      { x: 1, y: 1 },
    ];
    const invert = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    const lut = buildCurveLut(set({ rgb: lift, b: invert }));
    expect(sampleLut(lut, 0, 0)).toBeCloseTo(0.2, 6); // red: rgb only
    expect(sampleLut(lut, 2, 0)).toBeCloseTo(0.8, 6); // blue: invert(0.2)
    expect(sampleLut(lut, 1, 1)).toBeCloseTo(1, 6);
  });

  it('identity table maps values to themselves (within LUT precision)', () => {
    const lut = buildCurveLut(set({ r: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }] }));
    for (let i = 0; i <= 50; i++) expect(sampleLut(lut, 0, i / 50)).toBeCloseTo(i / 50, 6);
    expect(lut.length).toBe(CURVE_LUT_SIZE * 4);
  });

  it('works on sRGB-encoded values: a midpoint lift brightens mid-gray', () => {
    const lut = buildCurveLut(set({ rgb: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] }));
    const mid = srgbToLinear(0.5);
    const [r] = applyCurve([mid, mid, mid], lut);
    expect(r).toBeCloseTo(srgbToLinear(0.7), 4);
  });
});
