import { expect, test } from '@playwright/test';
import type { BasicSettings, Geometry } from '../src/model/editSettings';
import { BASIC_SLIDERS } from '../src/model/sliders';
import type { GpuHarness } from './harness/types';
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
