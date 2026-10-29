import { expect, test, type Page } from '@playwright/test';
import { cells, gotoLibrary, gridNames, importViaButton, testFiles } from './utils/library';

const catalog = (page: Page) => page.getByRole('region', { name: 'Collections', exact: true });
const selectionPanel = (page: Page) => page.getByRole('region', { name: 'Collections of the selection' });
const collectionButton = (page: Page, name: string) => catalog(page).getByRole('button', { name: new RegExp(`^${name} \\d+$`) });

async function newCollection(page: Page, name: string, includeSelection = true) {
  await catalog(page).getByRole('button', { name: 'New collection' }).click();
  const include = catalog(page).getByRole('checkbox');
  if ((await include.count()) > 0 && !includeSelection) await include.uncheck();
  await catalog(page).getByLabel('New collection name').fill(name);
  await catalog(page).getByLabel('New collection name').press('Enter');
}

test.describe('Collections', () => {
  test('create, add, view, remove, rename and delete; nothing deletes photos; survives a reload', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(4));
    await expect(catalog(page)).toContainText('Use + to make a collection.');

    // A new collection includes the selected photos and is shown right away.
    await cells(page).nth(0).click();
    await cells(page).nth(1).click({ modifiers: ['Shift'] });
    await newCollection(page, 'Summer trip');
    await expect(collectionButton(page, 'Summer trip')).toHaveAttribute('aria-current', 'page');
    expect(await gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0419.png']);
    await expect(page.getByTestId('status-bar')).toContainText('2 of 4 photos2 selected');

    // An empty one, then add photos to it from the right panel.
    await page.getByRole('button', { name: /^All photographs/ }).click();
    await cells(page).nth(1).click();
    await cells(page).nth(3).click({ modifiers: ['ControlOrMeta'] });
    await newCollection(page, 'Best', false);
    await expect(collectionButton(page, 'Best')).toContainText('0');
    await page.getByRole('button', { name: /^All photographs/ }).click();
    await cells(page).nth(1).click();
    await cells(page).nth(3).click({ modifiers: ['ControlOrMeta'] });
    await selectionPanel(page).getByLabel('Add to collection').selectOption({ label: 'Best' });
    await expect(collectionButton(page, 'Best')).toContainText('2');
    // IMG_0419 is in both; IMG_0421 only in Best.
    await expect(selectionPanel(page).getByRole('listitem')).toHaveText(['Best', 'Summer trip 1']);
    await page.screenshot({ path: 'test-results/screenshots/m12-collections.png' });

    // Names are kept unique.
    await newCollection(page, 'best', false);
    await expect(collectionButton(page, 'best 2')).toBeVisible();

    // Reload: collections and membership persist.
    await page.reload();
    await expect(cells(page)).toHaveCount(4);
    await collectionButton(page, 'Summer trip').click();
    expect(await gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0419.png']);

    // Remove one photo from the collection: it leaves the collection, not the catalog.
    await cells(page).nth(0).click();
    await selectionPanel(page).getByRole('button', { name: 'Remove from collection Summer trip' }).click();
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0419.png']);
    await expect(page.getByRole('button', { name: /^All photographs/ })).toContainText('4');

    // Rename.
    await collectionButton(page, 'Summer trip').hover();
    await catalog(page).getByRole('button', { name: 'Rename collection Summer trip' }).click();
    await catalog(page).getByLabel('Rename collection Summer trip').fill('Trip 2023');
    await catalog(page).getByLabel('Rename collection Summer trip').press('Enter');
    await expect(collectionButton(page, 'Trip 2023')).toBeVisible();

    // Delete: asks first; the view falls back to all photographs; all 4 photos remain.
    await collectionButton(page, 'Trip 2023').hover();
    await catalog(page).getByRole('button', { name: 'Delete collection Trip 2023' }).click();
    const confirm = catalog(page).getByRole('alertdialog');
    await expect(confirm).toContainText('Its photos stay in the catalog.');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(collectionButton(page, 'Trip 2023')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^All photographs/ })).toHaveAttribute('aria-current', 'page');
    await expect(cells(page)).toHaveCount(4);
  });

  test('the filmstrip in Develop shows the open collection', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await cells(page).nth(2).click();
    await newCollection(page, 'One');
    await page.getByRole('tab', { name: 'Develop' }).click();
    await expect(page.getByTestId('filmstrip')).toContainText('1 photo');
  });

  test('dragging photos from the grid onto a collection adds them (the whole selection if dragged from it)', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(4));
    await cells(page).nth(0).click();
    await newCollection(page, 'Drop here', false);
    await page.getByRole('button', { name: /^All photographs/ }).click();
    await cells(page).nth(1).click();
    await cells(page).nth(2).click({ modifiers: ['ControlOrMeta'] });
    await cells(page).nth(2).dragTo(collectionButton(page, 'Drop here'));
    await expect(collectionButton(page, 'Drop here')).toContainText('2');
    // An unselected photo is dragged on its own.
    await cells(page).nth(3).dragTo(collectionButton(page, 'Drop here'));
    await expect(collectionButton(page, 'Drop here')).toContainText('3');
    await collectionButton(page, 'Drop here').click();
    expect(await gridNames(page)).toEqual(['IMG_0419.png', 'IMG_0420.png', 'IMG_0421.png']);
  });
});
