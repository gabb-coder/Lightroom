import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_NAME } from '../src/appName';

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Element is not visible');
  return b;
}

/** Side panels use the design's flex-basis layout, so they can grow by a fraction of a pixel. */
async function expectWidth(locator: Locator, width: number) {
  expect(Math.abs((await box(locator)).width - width)).toBeLessThan(1);
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('develop-view')).toBeVisible();
}

test.describe('app shell', () => {
  test('Develop layout matches design/Develop.dc.html', async ({ page }) => {
    await openApp(page);

    const topBar = page.getByTestId('top-bar');
    expect((await box(topBar)).height).toBe(44);
    await expect(topBar).toHaveCSS('background-color', 'rgb(22, 22, 22)');
    await expect(topBar).toContainText(APP_NAME);
    await expect(page).toHaveTitle(APP_NAME);

    await expectWidth(page.getByTestId('left-panel'), 248);
    await expectWidth(page.getByTestId('right-panel'), 300);
    expect((await box(page.getByTestId('filmstrip'))).height).toBe(112);

    const info = await box(page.getByTestId('info-strip'));
    const canvas = await box(page.getByTestId('canvas'));
    const toolbar = await box(page.getByTestId('toolbar'));
    expect(info.height).toBe(32);
    expect(info.y).toBeLessThan(canvas.y);
    expect(toolbar.y).toBeGreaterThan(canvas.y);
    expect(toolbar.height).toBe(44);
    expect((await box(page.getByTestId('histogram'))).height).toBe(84);

    await expect(page.getByRole('main', { name: 'Photo canvas' })).toHaveCSS('background-color', 'rgb(20, 20, 20)');
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

    // Tabs are centered in the top bar's content box (padding is 16px left, 12px right).
    const tabs = await box(page.getByRole('tablist', { name: 'Modules' }));
    expect(Math.abs(tabs.x + tabs.width / 2 - (16 + 1428) / 2)).toBeLessThan(1);

    await page.screenshot({ path: 'test-results/screenshots/m0-develop.png' });
  });

  test('Develop panel headers collapse and expand', async ({ page }) => {
    await openApp(page);
    const basic = page.getByRole('button', { name: 'Basic' });
    const curve = page.getByRole('button', { name: 'Tone curve' });
    await expect(basic).toHaveAttribute('aria-expanded', 'true');
    await expect(curve).toHaveAttribute('aria-expanded', 'false');
    await curve.click();
    await expect(curve).toHaveAttribute('aria-expanded', 'true');
    await basic.click();
    await expect(basic).toHaveAttribute('aria-expanded', 'false');
  });

  test('Library layout matches design/Library.dc.html', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Library' }).click();
    await expect(page.getByTestId('library-view')).toBeVisible();

    await expectWidth(page.getByTestId('left-panel'), 232);
    await expectWidth(page.getByTestId('right-panel'), 280);
    expect((await box(page.getByTestId('status-bar'))).height).toBe(40);
    await expect(page.getByTestId('drop-zone')).toContainText('Drop photos here to import');
    await expect(page.getByTestId('filmstrip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/m0-library.png' });
  });

  test('tabs switch modules and mark the active tab', async ({ page }) => {
    await openApp(page);
    const library = page.getByRole('tab', { name: 'Library' });
    const develop = page.getByRole('tab', { name: 'Develop' });
    const exportTab = page.getByRole('tab', { name: 'Export' });

    await expect(develop).toHaveAttribute('aria-selected', 'true');
    await expect(develop).toHaveCSS('box-shadow', 'rgb(74, 163, 255) 0px -2px 0px 0px inset');

    await library.click();
    await expect(library).toHaveAttribute('aria-selected', 'true');
    await expect(develop).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('develop-view')).toHaveCount(0);

    await exportTab.click();
    await expect(page.getByTestId('export-view')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m0-export.png' });
  });

  test('G and D shortcuts switch modules', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('g');
    await expect(page.getByTestId('library-view')).toBeVisible();
    await page.keyboard.press('d');
    await expect(page.getByTestId('develop-view')).toBeVisible();
  });

  test('narrow viewports wrap the panels without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await openApp(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The left panel moves below the canvas, as in the design's 900px breakpoint.
    const left = await box(page.getByTestId('left-panel'));
    const canvas = await box(page.getByTestId('canvas'));
    expect(left.y).toBeGreaterThan(canvas.y);
  });
});
