import { expect, test } from '@playwright/test';
import type { BasicSettings } from '../src/model/editSettings';
import type { GpuHarness } from './harness/types';
import { DEV_PORT } from '../playwright.config';

/** Shader output must match the CPU reference within ±2/255 per channel. */
const TOLERANCE = 2;

const CASES: Record<string, Partial<BasicSettings>> = {
  'defaults (identity)': {},
  'exposure +1.35': { exposure: 1.35 },
  'exposure -2': { exposure: -2 },
  'exposure max +5': { exposure: 5 },
  'exposure min -5': { exposure: -5 },
  'contrast +100': { contrast: 100 },
  'contrast -100': { contrast: -100 },
  'contrast +37': { contrast: 37 },
  'saturation +100': { saturation: 100 },
  'saturation -100': { saturation: -100 },
  'saturation -45': { saturation: -45 },
  'all three combined': { exposure: 0.8, contrast: 45, saturation: 60 },
  'combined, over-exposed': { exposure: 3, contrast: -70, saturation: -30 },
};

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
        expect(result.maxChangeFromSource).toBeGreaterThan(TOLERANCE);
      }
    });
  }
});
