import { describe, expect, it } from 'vitest';
import { containSize } from './fitSize';

describe('containSize', () => {
  it('fits by width when the box is taller than the image', () => {
    expect(containSize({ width: 600, height: 900 }, 1.5)).toEqual({ width: 600, height: 400 });
  });

  it('fits by height when the box is wider than the image', () => {
    expect(containSize({ width: 1200, height: 400 }, 1.5)).toEqual({ width: 600, height: 400 });
  });

  it('returns zero for an empty box', () => {
    expect(containSize({ width: 0, height: 300 }, 1.5)).toEqual({ width: 0, height: 0 });
  });
});
