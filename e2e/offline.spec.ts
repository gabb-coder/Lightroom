import { expect, test } from '@playwright/test';
import { canvasPixels, openTestPhoto, smallPhotoPng } from './utils/develop';

test.describe('Install as an app, works offline (M33)', () => {
  test('the manifest and icons load; after one visit the app starts, edits and exports offline', async ({ page, context }) => {
    test.slow();
    await page.goto('/');
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      const res = await fetch(link?.href ?? '');
      return res.json() as Promise<{ name: string; display: string; icons: { src: string; sizes: string }[] }>;
    });
    expect(manifest).toMatchObject({ name: 'Darkroom', display: 'standalone' });
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).headers()['content-type']).toBe('image/png');

    // The service worker installs (precaching every built file) and takes over the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Library' })).toBeVisible();
    // Still cross-origin isolated: the cached page kept its headers.
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

    // Import (thumbnail worker), edit (WebGL) and export (export worker), all from the cache.
    await page.getByRole('tab', { name: 'Develop' }).click();
    await openTestPhoto(page, smallPhotoPng);
    expect((await canvasPixels(page)).width).toBeGreaterThan(100);
    await page.getByRole('tab', { name: 'Export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Export 1 photo' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
    await context.setOffline(false);
    await page.screenshot({ path: 'test-results/screenshots/m33-offline.png' });
  });
});
