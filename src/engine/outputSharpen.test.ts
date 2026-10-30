import { describe, expect, it } from 'vitest';
import { normalizeExportOptions } from '../model/exportOptions';
import { applyOutputSharpen, outputSharpenParams } from './outputSharpen';

const W = 40;
const H = 20;

/** A vertical edge from 80 to 170 at x = 20. */
function edge() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(x < 20 ? [80, 80, 80, 255] : [170, 170, 170, 255], (y * W + x) * 4);
  return { width: W, height: H, data };
}
const at = (img: { data: Uint8ClampedArray }, x: number) => img.data[(10 * W + x) * 4] ?? 0;

describe('output sharpening (M34)', () => {
  it('is off for None; screen is finer than matte paper; more amount, more effect', () => {
    expect(outputSharpenParams('none', 'high')).toBeNull();
    const screen = outputSharpenParams('screen', 'standard');
    const matte = outputSharpenParams('matte', 'standard');
    expect(screen?.radius).toBeLessThan(matte?.radius ?? 0);
    expect(outputSharpenParams('glossy', 'high')?.amount).toBeGreaterThan(outputSharpenParams('glossy', 'low')?.amount ?? 1);
  });

  it('adds contrast at edges and leaves flat areas and alpha alone', () => {
    const img = edge();
    applyOutputSharpen(img, { radius: 1, amount: 1 });
    expect(at(img, 19)).toBeLessThan(80); // dark side gets darker
    expect(at(img, 20)).toBeGreaterThan(170); // bright side brighter
    expect(at(img, 5)).toBe(80);
    expect(at(img, 35)).toBe(170);
    expect(img.data[3]).toBe(255);
    // Wider radius reaches further from the edge.
    const wide = edge();
    applyOutputSharpen(wide, { radius: 1.2, amount: 1 });
    const fine = edge();
    applyOutputSharpen(fine, { radius: 0.6, amount: 1 });
    expect(Math.abs(at(wide, 17) - 80)).toBeGreaterThanOrEqual(Math.abs(at(fine, 17) - 80));
  });

  it('normalizes stored export options', () => {
    expect(normalizeExportOptions({})).toMatchObject({ outputSharpen: 'none', sharpenAmount: 'standard' });
    expect(normalizeExportOptions({ outputSharpen: 'matte', sharpenAmount: 'high' })).toMatchObject({ outputSharpen: 'matte', sharpenAmount: 'high' });
    expect(normalizeExportOptions({ outputSharpen: 'canvas' as never, sharpenAmount: 'max' as never })).toMatchObject({ outputSharpen: 'none', sharpenAmount: 'standard' });
  });
});
