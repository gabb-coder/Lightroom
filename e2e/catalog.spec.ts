import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { typeSliderValue, waitForFullRender } from './utils/develop';
import { catalogDump, storeCount } from './utils/idb';
import { cells, gotoLibrary, gridNames, importViaButton, testFiles } from './utils/library';

const catalog = (page: Page) => page.getByRole('region', { name: 'Collections', exact: true });
const backup = (page: Page) => page.getByRole('region', { name: 'Backup' });

async function openInDevelop(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Develop' }).click();
  const item = page.getByTestId('filmstrip').getByRole('button', { name, exact: true });
  if ((await item.getAttribute('aria-current')) !== 'true') await item.click();
  await expect(page.getByTestId('develop-view')).toContainText(name);
  await waitForFullRender(page);
}

test.describe('Catalog backup and restore', () => {
  test('a backup restored into an empty catalog reproduces it exactly; restoring again adds nothing', async ({ page, browser }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await expect(backup(page).getByTestId('storage-usage')).toContainText('Using');

    // Edits, a snapshot and a user preset on the first photo.
    await openInDevelop(page, 'IMG_0418.png');
    await typeSliderValue(page, 'exposure', '0.8');
    await page.getByRole('button', { name: 'Create snapshot' }).click();
    await page.getByLabel('Snapshot name').press('Enter');
    await page.getByRole('button', { name: 'Save settings as preset' }).click();
    await page.getByLabel('Preset name').fill('Mine');
    await page.getByLabel('Preset name').press('Enter');
    // A virtual copy of the second, a keyword and rating on the third, a collection.
    await page.getByRole('tab', { name: 'Library' }).click();
    await cells(page).nth(1).click();
    await page.getByRole('button', { name: 'Create virtual copy' }).click();
    await expect(cells(page)).toHaveCount(4);
    await cells(page).nth(3).click();
    await page.keyboard.press('4');
    await page.getByLabel('Add keywords').fill('beach');
    await page.getByLabel('Add keywords').press('Enter');
    await cells(page).nth(0).click();
    await cells(page).nth(2).click({ modifiers: ['ControlOrMeta'] });
    await catalog(page).getByRole('button', { name: 'New collection' }).click();
    await catalog(page).getByLabel('New collection name').fill('Trip');
    await catalog(page).getByLabel('New collection name').press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    const before = await catalogDump(page);

    const download = page.waitForEvent('download');
    await backup(page).getByRole('button', { name: 'Back up catalog' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^darkroom-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    const path = await file.path();
    await expect(backup(page).getByTestId('backup-message')).toHaveText('Backup saved to your downloads.');
    await page.screenshot({ path: 'test-results/screenshots/m17-backup.png' });

    // A fresh browser profile: empty catalog.
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await gotoLibrary(fresh);
    await fresh.getByTestId('restore-input').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: await readFile(path) });
    await expect(backup(fresh).getByTestId('backup-message')).toHaveText('Restored 4 photos, 1 collection, 1 preset.');
    await expect(cells(fresh)).toHaveCount(4);
    expect(await catalogDump(fresh)).toEqual(before);
    await page.getByRole('button', { name: /^All photographs/ }).click();
    expect(await gridNames(fresh)).toEqual(await gridNames(page));

    // Restoring again changes nothing.
    await fresh.getByTestId('restore-input').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: await readFile(path) });
    await expect(backup(fresh).getByTestId('backup-message')).toHaveText('Restored 0 photos. 4 already in the catalog.');
    expect(await catalogDump(fresh)).toEqual(before);
    await context.close();
  });

  test('a file that is not a backup is refused with a clear message', async ({ page }) => {
    await gotoLibrary(page);
    await page.getByTestId('restore-input').setInputFiles({ name: 'nope.zip', mimeType: 'application/zip', buffer: Buffer.from('definitely not a zip') });
    await expect(backup(page).getByTestId('backup-message')).toHaveText('Not a ZIP file');
  });
});

test.describe('Removing photos', () => {
  test('asks first; removes the photo, its virtual copies and every stored trace, and nothing else', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await cells(page).nth(0).click();
    await page.getByRole('button', { name: 'Create virtual copy' }).click();
    await expect(cells(page)).toHaveCount(4);
    // Collection with the first photo and the third.
    await cells(page).nth(0).click();
    await cells(page).nth(3).click({ modifiers: ['ControlOrMeta'] });
    await catalog(page).getByRole('button', { name: 'New collection' }).click();
    await catalog(page).getByLabel('New collection name').fill('Keep');
    await catalog(page).getByLabel('New collection name').press('Enter');
    await page.getByRole('button', { name: /^All photographs/ }).click();

    // Delete key, then Escape: nothing happens.
    await cells(page).nth(0).click();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Remove 1 photo from the catalog?');
    await expect(dialog).toContainText('Its virtual copy goes too.');
    await page.screenshot({ path: 'test-results/screenshots/m17-remove-dialog.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cells(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Remove photo from catalog…' }).click();
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(cells(page)).toHaveCount(2);
    expect(await gridNames(page)).toEqual(['IMG_0419.png', 'IMG_0420.png']);
    await expect(cells(page).nth(0)).toHaveAttribute('aria-pressed', 'true'); // the next photo is selected
    expect(await storeCount(page, 'originals')).toBe(2);
    expect(await storeCount(page, 'thumbnails')).toBe(2);
    await expect(catalog(page).getByRole('button', { name: /^Keep/ })).toContainText('1');
  });

  test('removing the photo open in Develop shows the next one', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    await openInDevelop(page, 'IMG_0418.png');
    await page.keyboard.press('Delete');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('develop-view')).toContainText('IMG_0419.png');
    await expect(page.getByTestId('filmstrip')).toContainText('1 photo');
  });
});
