import { describe, expect, it } from 'vitest';
import { nudgeWheel, pointFromWheel, wheelFromPoint } from './colorWheel';

describe('color wheel', () => {
  it('maps points to hue (counter-clockwise from the right) and saturation (distance)', () => {
    expect(wheelFromPoint(50, 0, 50)).toEqual({ hue: 0, sat: 100 });
    expect(wheelFromPoint(0, -25, 50)).toEqual({ hue: 90, sat: 50 }); // straight up
    expect(wheelFromPoint(-50, 0, 50)).toEqual({ hue: 180, sat: 100 });
    expect(wheelFromPoint(0, 80, 50)).toEqual({ hue: 270, sat: 100 }); // outside the rim clamps
    expect(wheelFromPoint(0, 0, 50)).toEqual({ hue: 0, sat: 0 });
  });

  it('round-trips with the puck position', () => {
    for (const [hue, sat] of [[0, 30], [45, 100], [200, 60], [359, 10]] as const) {
      const p = pointFromWheel(hue, sat, 70);
      expect(wheelFromPoint(p.x, p.y, 70)).toEqual({ hue, sat });
    }
  });

  it('arrow keys turn the hue (wrapping) and change saturation (clamped)', () => {
    expect(nudgeWheel({ hue: 359, sat: 50 }, 'ArrowLeft', false)).toEqual({ hue: 0, sat: 50 });
    expect(nudgeWheel({ hue: 5, sat: 50 }, 'ArrowRight', true)).toEqual({ hue: 355, sat: 50 });
    expect(nudgeWheel({ hue: 0, sat: 95 }, 'ArrowUp', true)).toEqual({ hue: 0, sat: 100 });
    expect(nudgeWheel({ hue: 0, sat: 0 }, 'ArrowDown', false)).toEqual({ hue: 0, sat: 0 });
    expect(nudgeWheel({ hue: 0, sat: 0 }, 'Enter', false)).toBeNull();
  });
});
