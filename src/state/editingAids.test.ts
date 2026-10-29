import { describe, expect, it } from 'vitest';
import { sampleRadius, sampleRegion } from './editingAids';

describe('eyedropper sample region', () => {
  it('is a small square around the point, more pixels on big photos', () => {
    expect(sampleRadius({ width: 600, height: 400 })).toBe(1);
    expect(sampleRadius({ width: 6000, height: 4000 })).toBe(8);
    expect(sampleRegion({ width: 600, height: 400 }, 0.5, 0.5)).toEqual({ x: 299, y: 199, w: 3, h: 3 });
  });

  it('is clipped to the photo at its edges', () => {
    expect(sampleRegion({ width: 600, height: 400 }, 0, 0)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(sampleRegion({ width: 600, height: 400 }, 1, 1)).toEqual({ x: 598, y: 398, w: 2, h: 2 });
  });
});
