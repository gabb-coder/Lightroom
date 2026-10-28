import { describe, expect, it } from 'vitest';
import { luminance } from './color';
import { applyTreatment } from './treatment';

describe('treatment', () => {
  it('leaves color untouched', () => {
    expect(applyTreatment([0.1, 0.5, 0.9], false)).toEqual([0.1, 0.5, 0.9]);
  });

  it('B&W outputs the linear luminance on all channels', () => {
    const c = [0.1, 0.5, 0.9] as const;
    const y = luminance(c);
    expect(applyTreatment(c, true)).toEqual([y, y, y]);
  });
});
