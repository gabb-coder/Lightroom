import { expect, test } from '@playwright/test';

test.describe('Browser support check', () => {
  test('a modern browser sees no banner', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('develop-view')).toBeVisible();
    await expect(page.getByTestId('support-banner')).toHaveCount(0);
  });

  test('without WebGL 2 the app says so plainly', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // Pretend this browser has no WebGL 2.
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2') return null;
        return (original as (this: HTMLCanvasElement, ...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/');
    const banner = page.getByTestId('support-banner');
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toContainText('Darkroom can’t run in this browser.');
    await expect(banner).toContainText('WebGL 2');
    await page.screenshot({ path: 'test-results/screenshots/m18-support-banner.png' });
  });
});
