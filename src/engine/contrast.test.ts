import { describe, expect, it } from 'vitest';
import { contrastAmount, contrastCurve } from './contrast';

describe('contrast curve', () => {
  it('is identity at 0', () => {
    for (const q of [0, 0.2, 0.5, 0.9, 1.4]) expect(contrastCurve(q, contrastAmount(0))).toBe(q);
  });

  it('keeps black, the pivot and white fixed', () => {
    for (const c of [-100, -40, 40, 100]) {
      const a = contrastAmount(c);
      expect(contrastCurve(0, a)).toBeCloseTo(0, 12);
      expect(contrastCurve(0.5, a)).toBeCloseTo(0.5, 12);
      expect(contrastCurve(1, a)).toBeCloseTo(1, 12);
    }
  });

  it('positive contrast darkens below the pivot and brightens above it; negative does the opposite', () => {
    expect(contrastCurve(0.25, contrastAmount(60))).toBeLessThan(0.25);
    expect(contrastCurve(0.75, contrastAmount(60))).toBeGreaterThan(0.75);
    expect(contrastCurve(0.25, contrastAmount(-60))).toBeGreaterThan(0.25);
    expect(contrastCurve(0.75, contrastAmount(-60))).toBeLessThan(0.75);
  });

  it('is monotonic and continuous across [0, 2] at both slider extremes', () => {
    for (const c of [-100, 100]) {
      const a = contrastAmount(c);
      let prev = -1;
      for (let i = 0; i <= 2000; i++) {
        const y = contrastCurve(i / 1000, a);
        expect(y).toBeGreaterThan(prev);
        prev = y;
      }
      expect(contrastCurve(1 - 1e-9, a)).toBeCloseTo(contrastCurve(1, a), 6);
    }
  });
});
