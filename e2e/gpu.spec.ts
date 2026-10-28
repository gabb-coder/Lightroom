import { expect, test } from '@playwright/test';
import type { BasicSettings } from '../src/model/editSettings';
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
