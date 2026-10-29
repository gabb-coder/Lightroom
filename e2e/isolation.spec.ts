import { expect, test } from '@playwright/test';

test('production build is cross-origin isolated', async ({ page }) => {
  const response = await page.goto('/');
  if (!response) throw new Error('No response for /');
  const headers = response.headers();
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');

  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  expect(isolated).toBe(true);
});

test('self-hosted Inter loads under COEP', async ({ page }) => {
  const failed: string[] = [];
  page.on('requestfailed', (req) => failed.push(req.url()));
  await page.goto('/');
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 12px Inter`)));
    return ['400', '500', '600'].map((w) => document.fonts.check(`${w} 12px Inter`));
  });
  expect(loaded).toEqual([true, true, true]);
  expect(failed).toEqual([]);
});
