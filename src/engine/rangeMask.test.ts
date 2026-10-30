import { describe, expect, it } from 'vitest';
import { defaultEditSettings, defaultMaskAdjust, defaultMaskRange, type Mask } from '../model/editSettings';
import { parseEditSettings } from '../model/validate';
import { hueOf, maskShape, rangeOf, rangeWeight } from './masks';
import { pipelineParams, processRgba8 } from './pipeline';

const lum = (lo: number, hi: number, smooth: number) => rangeOf({ ...defaultMaskRange(), kind: 'luminance', lo, hi, smooth });
const color = (hue: number, width: number) => rangeOf({ ...defaultMaskRange(), kind: 'color', hue, width });
const gray = (v: number): [number, number, number] => [v, v, v];

describe('range masks (M30)', () => {
  it('hue follows HSV, wrapping at red', () => {
    expect(hueOf(1, 0, 0)).toBe(0);
    expect(hueOf(1, 1, 0)).toBe(60);
    expect(hueOf(0, 0, 1)).toBe(240);
    expect(hueOf(1, 0, 0.5)).toBeCloseTo(330, 9);
    expect(hueOf(0.4, 0.4, 0.4)).toBe(0);
  });

  it('luminance: full inside the band, soft edges outside, hard with smoothness 0', () => {
    const r = lum(40, 70, 20); // soft edge 0.1
    expect(rangeWeight(r, gray(0.5))).toBe(1);
    expect(rangeWeight(r, gray(0.35))).toBeCloseTo(0.5, 9);
    expect(rangeWeight(r, gray(0.75))).toBeCloseTo(0.5, 9);
    expect(rangeWeight(r, gray(0.2))).toBe(0);
    expect(rangeWeight(lum(40, 70, 0), gray(0.39))).toBe(0);
    expect(rangeWeight(rangeOf(undefined), gray(0.9))).toBe(1);
  });

  it('color: the chosen hue, softly wider, never grays or black', () => {
    const blue = color(220, 40); // full within ±20°, gone by ±40°
    expect(rangeWeight(blue, [0.1, 0.3, 0.9])).toBe(1); // hue 225
    expect(rangeWeight(blue, [0.9, 0.2, 0.1])).toBe(0); // orange
    expect(rangeWeight(blue, [0.5, 0.5, 0.5])).toBe(0);
    expect(rangeWeight(blue, [0, 0, 0.02])).toBe(0); // nearly black
    // Red wraps around 0/360.
    expect(rangeWeight(color(355, 30), [0.9, 0.05, 0.1])).toBe(1);
  });

  it('a mask with a color range only changes that color', () => {
    const mask: Mask = { id: 'm', kind: 'linear', x0: 0, y0: -1, x1: 0, y1: -0.5, adjust: { ...defaultMaskAdjust(), exposure: 1.5 }, range: { ...defaultMaskRange(), kind: 'color', hue: 220, width: 40 } };
    // Linear mask whose full-effect side covers the whole image.
    expect(maskShape(mask).range[0]).toBe(2);
    const s = defaultEditSettings();
    s.masks = [{ ...mask, x0: 0.5, y0: 2, x1: 0.5, y1: 3 }];
    const px = new Uint8ClampedArray([30, 80, 230, 255, 230, 60, 30, 255, 128, 128, 128, 255]);
    const out = processRgba8(px, pipelineParams(s), 3);
    expect(out[2]).toBeGreaterThan(240); // the blue got brighter
    expect(Array.from(out.slice(4, 12))).toEqual(Array.from(px.slice(4, 12))); // orange and gray untouched
  });

  it('validates stored ranges', () => {
    const parsed = parseEditSettings({ masks: [{ id: 'a', kind: 'linear', x0: 0, y0: 0, x1: 1, y1: 1, adjust: {}, range: { kind: 'luminance', lo: 80, hi: 20, smooth: 500 } }, { id: 'b', kind: 'linear', x0: 0, y0: 0, x1: 1, y1: 1, adjust: {}, range: { kind: 'nope' } }] });
    expect(parsed.masks[0]?.range).toEqual({ kind: 'luminance', lo: 80, hi: 80, smooth: 100, hue: 30, width: 60 });
    expect(parsed.masks[1]?.range).toBeUndefined();
  });
});
