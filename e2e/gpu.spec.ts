import { expect, test } from '@playwright/test';
import { HSL_COLORS, type BasicSettings, type EditSettings, type Geometry } from '../src/model/editSettings';
import { BASIC_SLIDERS } from '../src/model/sliders';
import type { GpuExtra, GpuHarness } from './harness/types';
import { DEV_PORT } from '../playwright.config';

/** Shader output must match the CPU reference within ±2/255 per channel. */
const TOLERANCE = 2;

const CASES: Record<string, Partial<BasicSettings>> = {
  'defaults (identity)': {},
  'exposure +1.35': { exposure: 1.35 },
  'contrast +37': { contrast: 37 },
  'saturation -45': { saturation: -45 },
  'B&W': { treatment: 'bw' },
  'B&W with tone': { treatment: 'bw', contrast: 40, shadows: 60, blacks: -30 },
  'warm + magenta, vivid': { temp: 70, tint: 35, vibrance: 80 },
  'recover over-exposure': { exposure: 2.5, highlights: -100, whites: -100 },
  'matte': { contrast: -40, blacks: 100, highlights: -50, saturation: -30 },
  'everything at max': { temp: 100, tint: 100, exposure: 5, contrast: 100, highlights: 100, shadows: 100, whites: 100, blacks: 100, vibrance: 100, saturation: 100 },
  'everything at min': { temp: -100, tint: -100, exposure: -5, contrast: -100, highlights: -100, shadows: -100, whites: -100, blacks: -100, vibrance: -100, saturation: -100 },
};
for (const [key, def] of Object.entries(BASIC_SLIDERS)) {
  CASES[`${key} min ${def.min}`] = { [key]: def.min };
  CASES[`${key} max ${def.max}`] = { [key]: def.max };
}

/** Geometry cases (64×48 test image), alone and combined with color edits. */
const GEOMETRY_CASES: Record<string, [Partial<BasicSettings>, Partial<Geometry>]> = {
  'flip horizontal': [{}, { flipH: true }],
  'flip vertical': [{}, { flipV: true }],
  'rotate 90': [{}, { rotation: 1 }],
  'rotate 180': [{}, { rotation: 2 }],
  'rotate 270 + flip': [{}, { rotation: 3, flipH: true }],
  'crop': [{}, { cropRect: { x: 0.2, y: 0.25, w: 0.5, h: 0.5 } }],
  'odd crop (fractional pixels)': [{}, { cropRect: { x: 0.123, y: 0.071, w: 0.611, h: 0.733 } }],
  'straighten +7.3°': [{}, { angle: 7.3, cropRect: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } }],
  'straighten -45°': [{}, { angle: -45, cropRect: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } }],
  'straighten, uncropped (transparent corners)': [{}, { angle: 20 }],
  'everything + color': [
    { exposure: 0.6, contrast: 30, saturation: 40, treatment: 'color' },
    { rotation: 1, flipH: true, angle: -3.5, cropRect: { x: 0.1, y: 0.12, w: 0.75, h: 0.7 } },
  ],
};

type Extra = Partial<Pick<EditSettings, 'curve' | 'hsl'>>;
const S_CURVE = [
  { x: 0, y: 0 },
  { x: 0.25, y: 0.18 },
  { x: 0.75, y: 0.85 },
  { x: 1, y: 1 },
];
const EXTRA_CASES: Record<string, [Partial<BasicSettings>, Extra]> = {
  'curve: RGB S-curve': [{}, { curve: { rgb: S_CURVE, r: S_CURVE.slice(0, 2).concat([{ x: 1, y: 1 }]), g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }],
  'curve: per channel': [
    {},
    {
      curve: {
        rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        r: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.65 }, { x: 1, y: 1 }],
        g: [{ x: 0, y: 0 }, { x: 1, y: 0.85 }],
        b: [{ x: 0, y: 0.2 }, { x: 0.4, y: 0.3 }, { x: 0.6, y: 0.8 }, { x: 1, y: 0.9 }],
      },
    },
  ],
  'curve: non-monotone (inverted midtones)': [{}, { curve: { rgb: [{ x: 0, y: 0 }, { x: 0.5, y: 0.9 }, { x: 0.7, y: 0.2 }, { x: 1, y: 1 }], r: [{ x: 0, y: 0 }, { x: 1, y: 1 }], g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }],
  'curve + tone + B&W': [{ contrast: 30, treatment: 'bw' }, { curve: { rgb: S_CURVE, r: [{ x: 0, y: 0 }, { x: 1, y: 1 }], g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }],
  'HSL: everything at once': [
    { vibrance: 30 },
    {
      hsl: {
        red: { hue: 40, sat: -60, lum: 20 },
        orange: { hue: -100, sat: 100, lum: -100 },
        yellow: { hue: 100, sat: -100, lum: 100 },
        green: { hue: -30, sat: 50, lum: -50 },
        aqua: { hue: 70, sat: 30, lum: 10 },
        blue: { hue: -100, sat: -40, lum: 60 },
        purple: { hue: 100, sat: 100, lum: -20 },
        magenta: { hue: -60, sat: -100, lum: 100 },
      },
    },
  ],
};
const zeroHsl = () => Object.fromEntries(HSL_COLORS.map((c) => [c, { hue: 0, sat: 0, lum: 0 }])) as EditSettings['hsl'];
for (const color of HSL_COLORS) {
  for (const prop of ['hue', 'sat', 'lum'] as const) {
    for (const value of [-100, 100]) {
      const hsl = zeroHsl();
      hsl[color] = { ...hsl[color], [prop]: value };
      EXTRA_CASES[`HSL: ${color} ${prop} ${value}`] = [{}, { hsl }];
    }
  }
}

/** Detail and effects (M9), alone, combined with color and geometry, and on a proxy. */
const DETAIL_CASES: Record<string, [Partial<BasicSettings>, Partial<Geometry>, GpuExtra]> = {
  'sharpen 40 radius 1': [{}, {}, { detail: { sharpAmount: 40, sharpRadius: 1 } }],
  'sharpen 150 radius 0.5': [{}, {}, { detail: { sharpAmount: 150, sharpRadius: 0.5 } }],
  'sharpen 150 radius 3': [{}, {}, { detail: { sharpAmount: 150, sharpRadius: 3 } }],
  'sharpen 100 radius 1.7 + exposure and contrast': [{ exposure: 0.4, contrast: 25 }, {}, { detail: { sharpAmount: 100, sharpRadius: 1.7 } }],
  'grain 100 size 0': [{}, {}, { effects: { grain: 100, grainSize: 0 } }],
  'grain 30 size 25': [{}, {}, { effects: { grain: 30, grainSize: 25 } }],
  'grain 70 size 100': [{}, {}, { effects: { grain: 70, grainSize: 100 } }],
  'vignette -100': [{}, {}, { effects: { vignette: -100 } }],
  'vignette +100': [{}, {}, { effects: { vignette: 100 } }],
  'vignette -40 after a crop': [{}, { cropRect: { x: 0.1, y: 0.2, w: 0.6, h: 0.7 } }, { effects: { vignette: -40 } }],
  'everything: color, sharpen, grain, vignette, straighten': [
    { exposure: 0.3, saturation: 20 },
    { angle: 4.5, cropRect: { x: 0.12, y: 0.12, w: 0.76, h: 0.76 }, rotation: 1 },
    { detail: { sharpAmount: 80, sharpRadius: 2 }, effects: { grain: 40, grainSize: 50, vignette: -60 } },
  ],
  'proxy: sharpen 150 radius 3 at half size': [{}, {}, { detail: { sharpAmount: 150, sharpRadius: 3 }, proxy: true }],
  'proxy: grain 60 at half size': [{}, {}, { effects: { grain: 60, grainSize: 10 }, proxy: true }],
};

test.describe('WebGL2 detail and effects passes match the CPU reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${DEV_PORT}/e2e/harness/gpu.html`);
    await expect(page.locator('#status')).toHaveText('ready');
  });

  test('all sharpening, grain and vignette cases', async ({ page }) => {
    for (const [name, [basic, geometry, extra]] of Object.entries(DETAIL_CASES)) {
      const result = await page.evaluate(([b, g, e]) => (window as unknown as GpuHarness).runGpuCheck(b, g, e), [basic, geometry, extra] as const);
      if (process.env.LOG_GPU_DIFF) console.log(`${name}: maxDiff=${result.maxDiff}`);
      expect(result.sameSize, name).toBe(true);
      expect(result.maxDiff, `${name}: ${JSON.stringify(result.worst)}`).toBeLessThanOrEqual(TOLERANCE);
      if (Object.keys(geometry).length === 0) expect(result.maxChangeFromSource, `${name} changes the image`).toBeGreaterThan(TOLERANCE);
    }
  });
});

test.describe('WebGL2 tone curve and color mixer match the CPU reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${DEV_PORT}/e2e/harness/gpu.html`);
    await expect(page.locator('#status')).toHaveText('ready');
  });

  test('all curve and color mixer cases', async ({ page }) => {
    // One page, many cases: 48 single-range HSL cases + curves.
    for (const [name, [basic, extra]] of Object.entries(EXTRA_CASES)) {
      const result = await page.evaluate(([b, e]) => (window as unknown as GpuHarness).runGpuCheck(b, {}, e), [basic, extra] as const);
      if (process.env.LOG_GPU_DIFF) console.log(`${name}: maxDiff=${result.maxDiff}`);
      expect(result.maxDiff, `${name}: ${JSON.stringify(result.worst)}`).toBeLessThanOrEqual(TOLERANCE);
      expect(result.maxChangeFromSource, `${name} changes the image`).toBeGreaterThan(TOLERANCE);
    }
  });
});

test.describe('WebGL2 geometry pass matches the CPU reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${DEV_PORT}/e2e/harness/gpu.html`);
    await expect(page.locator('#status')).toHaveText('ready');
  });

  for (const [name, [basic, geometry]] of Object.entries(GEOMETRY_CASES)) {
    test(name, async ({ page }) => {
      const result = await page.evaluate(([b, g]) => (window as unknown as GpuHarness).runGpuCheck(b, g), [basic, geometry] as const);
      if (process.env.LOG_GPU_DIFF) console.log(`${name}: maxDiff=${result.maxDiff} (${result.width}×${result.height})`);
      expect(result.sameSize).toBe(true);
      expect(result.maxDiff, JSON.stringify(result.worst)).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});

test.describe('WebGL2 pipeline matches the CPU reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`http://localhost:${DEV_PORT}/e2e/harness/gpu.html`);
    await expect(page.locator('#status')).toHaveText('ready');
  });

  for (const [name, basic] of Object.entries(CASES)) {
    test(name, async ({ page }) => {
      const result = await page.evaluate((b) => (window as unknown as GpuHarness).runGpuCheck(b), basic);
      if (process.env.LOG_GPU_DIFF) console.log(`${name}: maxDiff=${result.maxDiff}`);
      expect(result.maxDiff, JSON.stringify(result.worst)).toBeLessThanOrEqual(TOLERANCE);
      if (Object.keys(basic).length === 0) {
        // Also proves orientation: a flipped image would differ hugely.
        expect(result.maxChangeFromSource).toBeLessThanOrEqual(1);
      } else {
        // Every non-default case must actually change the test image.
        expect(result.maxChangeFromSource).toBeGreaterThan(TOLERANCE);
      }
    });
  }
});
