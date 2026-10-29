import { describe, expect, it } from 'vitest';
import { linearToSrgb, srgbToLinear, type Rgb } from './color';
import { applyHsl, HSL_CENTER_LIST, hslParams, hsvToRgb, hueWeights, rgbToHsv } from './hsl';
import { defaultEditSettings, HSL_COLORS, type HslColor } from '../model/editSettings';

/** Linear-light color with the given HSV (sRGB-encoded) hue/saturation/value. */
const colorAt = (h: number, s = 0.8, v = 0.8): Rgb => {
  const [r, g, b] = hsvToRgb(h, s, v);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
};
const maxDiff8 = (a: Rgb, b: Rgb) => Math.max(...[0, 1, 2].map((k) => Math.abs(Math.round(linearToSrgb(a[k] ?? 0) * 255) - Math.round(linearToSrgb(b[k] ?? 0) * 255))));

function paramsFor(color: HslColor, prop: 'hue' | 'sat' | 'lum', value: number) {
  const hsl = defaultEditSettings().hsl;
  hsl[color] = { ...hsl[color], [prop]: value };
  return hslParams(hsl);
}

describe('HSV conversion', () => {
  it('round-trips', () => {
    for (const c of [[0.9, 0.2, 0.1], [0.1, 0.5, 0.9], [0.4, 0.4, 0.4], [0, 0, 0]] as Rgb[]) {
      const [h, s, v] = rgbToHsv(c);
      const back = hsvToRgb(h, s, v);
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(c[k] ?? 0, 12);
    }
  });
});

describe('hue weights', () => {
  it('give each range full weight at its center and sum to 1 everywhere', () => {
    HSL_CENTER_LIST.forEach((c, k) => expect(hueWeights(c)[k]).toBeCloseTo(1, 12));
    for (let h = 0; h < 360; h += 0.5) expect(hueWeights(h).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('cross-fade smoothly between neighbors', () => {
    expect(hueWeights(15)[0]).toBeCloseTo(0.5, 12); // halfway red → orange
    expect(hueWeights(150)[3]).toBeCloseTo(0.5, 12); // halfway green → aqua
    expect(hueWeights(330)[7]).toBeCloseTo(0.5, 12); // magenta → red wraps
  });
});

describe('color mixer', () => {
  it('is identity at defaults', () => {
    expect(hslParams(defaultEditSettings().hsl)).toBeNull();
    expect(applyHsl([0.5, 0.2, 0.1], null)).toEqual([0.5, 0.2, 0.1]);
  });

  it('each range changes its own center strongly', () => {
    HSL_COLORS.forEach((color, k) => {
      const c = colorAt(HSL_CENTER_LIST[k] ?? 0);
      for (const prop of ['hue', 'sat', 'lum'] as const) {
        expect(maxDiff8(applyHsl(c, paramsFor(color, prop, 100)), c), `${color} ${prop}`).toBeGreaterThan(15);
      }
    });
  });

  it('each range barely affects colors outside its range: zero change at and beyond the neighbors', () => {
    HSL_COLORS.forEach((color, k) => {
      const n = HSL_CENTER_LIST.length;
      const prev = HSL_CENTER_LIST[(k + n - 1) % n] ?? 0;
      const next = HSL_CENTER_LIST[(k + 1) % n] ?? 0;
      for (let h = 0; h < 360; h += 1) {
        // Hues outside the open interval (previous center, next center), going around the circle.
        const wraps = next <= prev; // red and magenta span 0°/360°
        const inside = wraps ? h > prev || h < next : h > prev && h < next;
        if (inside) continue;
        const c = colorAt(h);
        for (const prop of ['hue', 'sat', 'lum'] as const) {
          for (const value of [-100, 100]) {
            expect(maxDiff8(applyHsl(c, paramsFor(color, prop, value)), c), `${color} ${prop} ${value} at ${h}°`).toBe(0);
          }
        }
      }
    });
  });

  it('leaves grays untouched', () => {
    const params = hslParams({ ...defaultEditSettings().hsl, red: { hue: 100, sat: 100, lum: 100 }, blue: { hue: -100, sat: -100, lum: -100 } });
    for (const g of [0, 0.05, 0.3, 0.9]) expect(maxDiff8(applyHsl([g, g, g], params), [g, g, g])).toBe(0);
  });

  it('saturation -100 on a range makes its center gray; hue +100 shifts toward the next range', () => {
    const red = colorAt(0);
    const [, s] = rgbToHsv(applyHsl(red, paramsFor('red', 'sat', -100)).map(linearToSrgb) as unknown as Rgb);
    expect(s).toBeCloseTo(0, 6);
    const [h] = rgbToHsv(applyHsl(colorAt(120), paramsFor('green', 'hue', 100)).map(linearToSrgb) as unknown as Rgb);
    expect(h).toBeGreaterThan(120);
  });
});
