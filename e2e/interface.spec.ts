import { expect, test, type Page } from '@playwright/test';
import { keyLabel, SHORTCUT_GROUPS } from '../src/shortcuts/shortcutList';
import { typeSliderValue, waitForFullRender } from './utils/develop';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';

const shortcutsDialog = (page: Page) => page.getByTestId('shortcuts-dialog');

test.describe('Keyboard shortcuts help (M22)', () => {
  test('lists every shortcut; opens from the top bar or ?, closes with Esc', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    const dialog = shortcutsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    // Every action with its keys (headless Chromium on Linux: Ctrl).
    for (const group of SHORTCUT_GROUPS) {
      await expect(dialog.getByRole('heading', { name: group.title })).toBeVisible();
      for (const s of group.shortcuts) {
        const term = dialog.locator('dt', { hasText: s.action }).first();
        await expect(term).toBeVisible();
        const keys = await term.locator('xpath=following-sibling::dd[1]').locator('kbd').allTextContents();
        expect(keys, s.action).toEqual([s.keys, ...(s.alternatives ?? [])].flat().map((k) => keyLabel(k, false)));
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/m22-shortcuts.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.keyboard.press('?');
    await expect(dialog).toBeVisible();
    // Shortcuts don't fire behind the dialog.
    await page.keyboard.press('g');
    await expect(page.getByRole('tab', { name: 'Develop' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('Collapsible Library panels (M22)', () => {
  test('sections collapse and stay collapsed after a reload', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    const metadata = page.getByRole('region', { name: 'Metadata' });
    const toggle = metadata.getByRole('button', { name: /Metadata/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(metadata.getByText('File name')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(metadata.getByText('File name')).toBeHidden();

    const backup = page.getByRole('region', { name: 'Backup' });
    await backup.getByRole('button', { name: 'Backup' }).click();
    await expect(backup.getByRole('button', { name: 'Back up catalog' })).toBeHidden();
    // The collections "+" stays usable outside the toggle.
    await expect(page.getByRole('button', { name: 'New collection' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m22-collapsed.png' });

    await page.reload();
    await expect(page.getByTestId('library-view')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Metadata' }).getByRole('button', { name: /Metadata/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Backup' }).getByRole('button', { name: 'Back up catalog' })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Keywords' }).getByRole('button', { name: 'Keywords' })).toHaveAttribute('aria-expanded', 'true');

    await page.getByRole('region', { name: 'Metadata' }).getByRole('button', { name: /Metadata/ }).click();
    await expect(page.getByRole('region', { name: 'Metadata' }).getByText('File name')).toBeVisible();
  });
});

/** Elements that stick out past the right edge of the viewport (none means no horizontal scrolling). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const wide: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > window.innerWidth + 0.5 && getComputedStyle(el).visibility !== 'hidden') wide.push(`${el.tagName} ${el.className}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, wide: wide.slice(0, 5) };
  });
}

test.describe('Phone layout at 390 px (M22)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every module fits the width and works by touch', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await importViaButton(page, testFiles(3));
    expect(await overflow(page)).toEqual({ scrollWidth: 390, innerWidth: 390, wide: [] });
    await cells(page).nth(1).tap();
    await expect(cells(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/screenshots/m22-phone-library.png' });

    await page.getByRole('tab', { name: 'Develop' }).tap();
    await waitForFullRender(page);
    expect(await overflow(page)).toEqual({ scrollWidth: 390, innerWidth: 390, wide: [] });
    // Sliders are finger-sized; a value can be typed in.
    const row = page.getByTestId('value-exposure').locator('xpath=..');
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(36);
    await typeSliderValue(page, 'exposure', '0.5');
    await expect(page.getByTestId('value-exposure')).toHaveText('+0.50');
    await page.getByRole('button', { name: 'Before / After' }).tap();
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-view', 'before');
    await page.getByRole('button', { name: 'Before / After' }).tap();
    // A fitted photo lets a vertical swipe scroll the page.
    expect(await page.locator('[data-testid="photo-canvas"]').evaluate((c) => getComputedStyle(c.parentElement as HTMLElement).touchAction)).toBe('pan-y');
    await page.screenshot({ path: 'test-results/screenshots/m22-phone-develop.png' });

    await page.getByRole('tab', { name: 'Export' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await overflow(page)).toEqual({ scrollWidth: 390, innerWidth: 390, wide: [] });
    // Labels sit above their controls, so the menus get the full width.
    const select = dialog.getByLabel('Export to');
    expect((await select.boundingBox())?.width).toBeGreaterThan(200);
    await page.screenshot({ path: 'test-results/screenshots/m22-phone-export.png' });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).tap();
    expect((await download).suggestedFilename()).toBe('IMG_0419.jpg');
  });
});
