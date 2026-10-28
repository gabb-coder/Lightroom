import { expect, test, type Locator } from '@playwright/test';

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Element is not visible');
  return b;
}

test.describe('app shell', () => {
  test('Develop layout matches the design dimensions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('develop-view')).toBeVisible();

    expect((await box(page.getByTestId('top-bar'))).height).toBe(44);
    expect((await box(page.getByTestId('left-panel'))).width).toBe(248);
    expect((await box(page.getByTestId('right-panel'))).width).toBe(300);
    expect((await box(page.getByTestId('filmstrip'))).height).toBe(112);

    const info = await box(page.getByTestId('info-strip'));
    const canvas = await box(page.getByTestId('canvas'));
    const toolbar = await box(page.getByTestId('toolbar'));
    expect(info.y).toBeLessThan(canvas.y);
    expect(toolbar.y).toBeGreaterThan(canvas.y);

    await expect(page.getByTestId('canvas')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

    await page.screenshot({ path: 'test-results/screenshots/m0-develop.png' });
  });

  test('tabs switch modules and mark the active tab', async ({ page }) => {
    await page.goto('/');
    const library = page.getByRole('tab', { name: 'Library' });
    const develop = page.getByRole('tab', { name: 'Develop' });
    const exportTab = page.getByRole('tab', { name: 'Export' });

    await expect(develop).toHaveAttribute('aria-selected', 'true');

    await library.click();
    await expect(library).toHaveAttribute('aria-selected', 'true');
    await expect(develop).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('library-view')).toBeVisible();
    await expect(page.getByTestId('develop-view')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/screenshots/m0-library.png' });

    await exportTab.click();
    await expect(page.getByTestId('export-view')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m0-export.png' });
  });

  test('G and D shortcuts switch modules', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('develop-view')).toBeVisible();
    await page.keyboard.press('g');
    await expect(page.getByTestId('library-view')).toBeVisible();
    await page.keyboard.press('d');
    await expect(page.getByTestId('develop-view')).toBeVisible();
  });
});
