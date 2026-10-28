import { describe, expect, it } from 'vitest';
import {
  applyTone,
  BLACKS_STRENGTH,
  blacksCurve,
  HIGHLIGHTS_STRENGTH,
  SHADOWS_STRENGTH,
  WHITES_STRENGTH,
  highlightsCurve,
  shadowsCurve,
  toneCurve,
  toneParams,
  TONE_GAMMA,
  whitesCurve,
  type ToneParams,
} from './tone';

const zero = { contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
const params = (s: Partial<typeof zero>): ToneParams => toneParams({ ...zero, ...s });
/** Linear value whose perceptual value is q. */
const lin = (q: number) => Math.pow(q, TONE_GAMMA);

describe('tone stage', () => {
  it('is exactly identity at defaults', () => {
    expect(applyTone([0.01, 0.3, 1.7], params({}))).toEqual([0.01, 0.3, 1.7]);
  });

  it('shadows lift or deepen the lower tones most and leave white alone', () => {
    const up = params({ shadows: 100 });
    const down = params({ shadows: -100 });
    expect(toneCurve(1 / 3, up) - 1 / 3).toBeCloseTo(0.14, 6);
    expect(toneCurve(1 / 3, down) - 1 / 3).toBeCloseTo(-0.14, 6);
    expect(Math.abs(toneCurve(0.9, up) - 0.9)).toBeLessThan(toneCurve(1 / 3, up) - 1 / 3);
    expect(toneCurve(1, up)).toBe(1);
    expect(toneCurve(0, up)).toBe(0);
  });

  it('highlights brighten or darken the upper tones most and leave black alone', () => {
    const up = params({ highlights: 100 });
    expect(toneCurve(2 / 3, up) - 2 / 3).toBeCloseTo(0.14, 6);
    expect(toneCurve(2 / 3, params({ highlights: -100 })) - 2 / 3).toBeCloseTo(-0.14, 6);
    expect(Math.abs(toneCurve(0.1, up) - 0.1)).toBeLessThan(0.02);
    expect(toneCurve(0, up)).toBe(0);
  });

  it('whites move the white end and recover over-exposed values when negative', () => {
    expect(toneCurve(1, params({ whites: 100 }))).toBeCloseTo(1.25, 12);
    expect(toneCurve(1, params({ whites: -100 }))).toBeCloseTo(0.75, 12);
    // Over-exposed (q up to 2) maps back to at most white.
    expect(toneCurve(2, params({ whites: -100 }))).toBeCloseTo(1, 12);
    expect(toneCurve(0, params({ whites: 100 }))).toBe(0);
  });

  it('blacks move the black end and leave white alone', () => {
    expect(toneCurve(0, params({ blacks: 100 }))).toBeCloseTo(0.15, 12);
    expect(toneCurve(0, params({ blacks: -100 }))).toBeCloseTo(-0.15, 12);
    expect(toneCurve(1, params({ blacks: 100 }))).toBe(1);
    // Crushed blacks clip to 0 instead of going negative.
    expect(applyTone([lin(0.05), 0, 0], params({ blacks: -100 }))).toEqual([0, 0, 0]);
  });

  it('every sub-curve is monotonic at its slider extremes', () => {
    const curves = [
      [highlightsCurve, HIGHLIGHTS_STRENGTH],
      [shadowsCurve, SHADOWS_STRENGTH],
      [whitesCurve, WHITES_STRENGTH],
      [blacksCurve, BLACKS_STRENGTH],
    ] as const;
    for (const [curve, strength] of curves) {
      for (const amount of [-strength, strength]) {
        let prev = -Infinity;
        for (let i = 0; i <= 2000; i++) {
          const y = curve(i / 1000, amount);
          expect(y).toBeGreaterThanOrEqual(prev);
          prev = y;
        }
      }
    }
  });

  it('the combined curve stays monotonic with every slider at an extreme', () => {
    const extremes = [-100, 100];
    for (const contrast of extremes)
      for (const highlights of extremes)
        for (const shadows of extremes)
          for (const whites of extremes)
            for (const blacks of extremes) {
              const p = params({ contrast, highlights, shadows, whites, blacks });
              let prev = -Infinity;
              for (let i = 0; i <= 400; i++) {
                const y = toneCurve(i / 200, p);
                expect(y).toBeGreaterThanOrEqual(prev);
                prev = y;
              }
            }
  });
});
