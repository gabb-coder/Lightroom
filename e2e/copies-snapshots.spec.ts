import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, openPanel, typeSliderValue, waitForFullRender } from './utils/develop';
import { storedEditsByName, storeCount } from './utils/idb';
import { cells, gotoLibrary, gridNames, importViaButton, testFiles } from './utils/library';
import { countDifferentPixels } from './utils/png';

const history = (page: Page) => page.getByTestId('history');
const snapshots = (page: Page) => page.getByRole('region', { name: 'Snapshots' });

async function edit(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

async function openInDevelop(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Develop' }).click();
  const item = page.getByTestId('filmstrip').getByRole('button', { name, exact: true });
  if ((await item.getAttribute('aria-current')) !== 'true') await item.click();
  await expect(page.getByTestId('develop-view')).toContainText(name);
  await waitForFullRender(page);
}

test.describe('Virtual copies', () => {
  test('a copy shares the original, edits independently, and can be removed', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(1));
    await openInDevelop(page, 'IMG_0418.png');
    await edit(page, 'contrast', '20');
    await page.getByRole('tab', { name: 'Library' }).click();

    await cells(page).nth(0).click();
    await page.getByRole('button', { name: 'Create virtual copy' }).click();
    await expect(cells(page)).toHaveCount(2);
    expect(await gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0418.png (Copy 1)']);
    await expect(cells(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Metadata' })).toContainText('Copy 1');
    expect(await storeCount(page, 'originals')).toBe(1); // no second original
    await page.screenshot({ path: 'test-results/screenshots/m13-virtual-copy.png' });

    // The copy starts from the master's settings and then goes its own way.
    await openInDevelop(page, 'IMG_0418.png (Copy 1)');
    await expect(page.getByTestId('value-contrast')).toHaveText('+20');
    await expect(history(page).getByRole('button')).toHaveText([/^Virtual copy/]);
    await edit(page, 'exposure', '1');
    const copyPixels = await canvasPixels(page);
    await openInDevelop(page, 'IMG_0418.png');
    await expect(page.getByTestId('value-exposure')).toHaveText('0.00');
    expect(countDifferentPixels(await canvasPixels(page), copyPixels)).toBeGreaterThan(1000);

    // Ctrl/Cmd+' copies the open photo (here the master again) and opens the copy.
    await page.keyboard.press("ControlOrMeta+'");
    await expect(page.getByTestId('develop-view')).toContainText('IMG_0418.png (Copy 2)');
    await expect(page.getByTestId('filmstrip')).toContainText('3 photos');

    const stored = await storedEditsByName(page);
    expect(Object.keys(stored)).toEqual(['IMG_0418.png']); // keyed by file name: all three share it
    expect(await storeCount(page, 'originals')).toBe(1);
    expect(await storeCount(page, 'photos')).toBe(3);

    // Removing a copy leaves the master and the shared original.
    await page.getByRole('tab', { name: 'Library' }).click();
    await cells(page).and(page.getByRole('button', { name: 'IMG_0418.png (Copy 1)', exact: true })).click();
    await page.getByRole('button', { name: 'Remove copy' }).click();
    await expect(cells(page)).toHaveCount(2);
    expect(await gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0418.png (Copy 2)']);
    expect(await storeCount(page, 'originals')).toBe(1);
    expect(await storeCount(page, 'edits')).toBe(2);
    // The master can't be removed this way.
    await cells(page).nth(0).click();
    await expect(page.getByRole('button', { name: 'Remove copy' })).toHaveCount(0);
  });
});

test.describe('Snapshots', () => {
  test('a snapshot restores exactly its pixels in one undoable step and survives a reload', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(1));
    await openInDevelop(page, 'IMG_0418.png');
    const original = await canvasPixels(page);
    await edit(page, 'exposure', '0.7');
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    await openPanel(page, 'Effects');
    await edit(page, 'vignette', '-50');
    const moody = await canvasPixels(page);

    await snapshots(page).getByRole('button', { name: 'Create snapshot' }).click();
    await expect(snapshots(page).getByLabel('Snapshot name')).toHaveValue('Snapshot 1');
    await snapshots(page).getByLabel('Snapshot name').fill('Moody');
    await snapshots(page).getByLabel('Snapshot name').press('Enter');
    await expect(snapshots(page).getByRole('listitem')).toHaveText(['Moody']);
    await page.screenshot({ path: 'test-results/screenshots/m13-snapshots.png' });

    await page.getByRole('button', { name: 'Reset all' }).click();
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);

    await snapshots(page).getByRole('button', { name: 'Moody', exact: true }).click();
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), moody)).toBe(0);
    await expect(history(page).getByRole('button').first()).toContainText('Snapshot: Moody');
    await page.keyboard.press('ControlOrMeta+z');
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);

    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await waitForFullRender(page);
    await openPanel(page, 'Snapshots');
    await expect(snapshots(page).getByRole('listitem')).toHaveText(['Moody']);
    await snapshots(page).getByRole('listitem').hover();
    await snapshots(page).getByRole('button', { name: 'Delete snapshot Moody' }).click();
    await expect(snapshots(page).getByRole('listitem')).toHaveCount(0);
  });
});
