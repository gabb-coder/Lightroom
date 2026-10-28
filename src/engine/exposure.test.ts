import { describe, expect, it } from 'vitest';
import { applyExposure, exposureGain } from './exposure';

describe('exposure', () => {
  it('is identity at 0 EV', () => {
    expect(applyExposure([0.1, 0.5, 0.9], exposureGain(0))).toEqual([0.1, 0.5, 0.9]);
  });

  it('doubles linear light per stop and halves per negative stop', () => {
    const up = applyExposure([0.1, 0.2, 0.3], exposureGain(1));
    expect(up[0]).toBeCloseTo(0.2, 12);
    expect(up[2]).toBeCloseTo(0.6, 12);
    expect(applyExposure([0.4, 0.4, 0.4], exposureGain(-2))[1]).toBeCloseTo(0.1, 12);
  });

  it('covers the slider range of ±5 EV', () => {
    expect(exposureGain(5)).toBe(32);
    expect(exposureGain(-5)).toBe(1 / 32);
  });
});
