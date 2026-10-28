import { describe, expect, it } from 'vitest';
import { applyContrast, contrastAmount, contrastCurve, CONTRAST_GAMMA } from './contrast';

const pivot = Math.pow(0.5, CONTRAST_GAMMA);

describe('contrast', () => {
  it('is identity at 0', () => {
    expect(applyContrast([0.05, 0.3, 0.9], contrastAmount(0))).toEqual([0.05, 0.3, 0.9]);
  });

  it('keeps black, the pivot and white fixed', () => {
    for (const c of [-100, -40, 40, 100]) {
      const a = contrastAmount(c);
      const [black, mid, white] = [0, pivot, 1].map((x) => applyContrast([x, x, x], a)[0]);
      expect(black).toBeCloseTo(0, 12);
      expect(mid).toBeCloseTo(pivot, 12);
      expect(white).toBeCloseTo(1, 12);
    }
  });

  it('positive contrast darkens below the pivot and brightens above it', () => {
    const a = contrastAmount(60);
    expect(applyContrast([0.05, 0.05, 0.05], a)[0]).toBeLessThan(0.05);
    expect(applyContrast([0.6, 0.6, 0.6], a)[0]).toBeGreaterThan(0.6);
  });

  it('negative contrast does the opposite', () => {
    const a = contrastAmount(-60);
    expect(applyContrast([0.05, 0.05, 0.05], a)[0]).toBeGreaterThan(0.05);
    expect(applyContrast([0.6, 0.6, 0.6], a)[0]).toBeLessThan(0.6);
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
