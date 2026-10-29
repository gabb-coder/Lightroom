import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { defaultEditSettings } from '../src/model/editSettings';
import { openPanel, typeSliderValue, waitForFullRender } from './utils/develop';
import { storedEditsByName } from './utils/idb';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';
import { decodePng } from './utils/png';

const dialog = (page: Page) => page.getByRole('dialog');
const history = (page: Page) => page.getByTestId('history');
const NAMES = ['IMG_0418.png', 'IMG_0419.png', 'IMG_0420.png', 'IMG_0421.png'];

async function openInDevelop(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Develop' }).click();
  const filmstrip = page.getByTestId('filmstrip');
  const item = filmstrip.getByRole('button', { name, exact: true });
  if ((await item.getAttribute('aria-current')) !== 'true') await item.click();
  await expect(page.getByTestId('develop-view')).toContainText(name);
  await waitForFullRender(page);
}

async function edit(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

/** Selects every photo in the grid with the given one focused (the sync source). */
async function selectAllFocusing(page: Page, first: number, last: number) {
  await cells(page).nth(last).click();
  await cells(page).nth(first).click({ modifiers: ['Shift'] });
}

const saved = async (page: Page) => {
  await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
  return storedEditsByName(page);
};

test.describe('Copy and paste settings', () => {
  test('copy chosen panels in Develop and paste them onto another photo as one undoable step', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    await openInDevelop(page, NAMES[0] ?? '');
    await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeDisabled();
    await edit(page, 'exposure', '1.5');
    await openPanel(page, 'Effects');
    await edit(page, 'vignette', '-40');

    await page.getByRole('button', { name: 'Copy settings…' }).click();
    await expect(dialog(page)).toContainText('Copy settings');
    await expect(dialog(page)).toContainText('Choose what to copy from IMG_0418.png.');
    const boxes = dialog(page).getByRole('checkbox');
    await expect(boxes).toHaveCount(6);
    // Default: everything except crop and geometry.
    await expect(dialog(page).getByRole('checkbox', { name: 'Crop and geometry' })).not.toBeChecked();
    await expect(dialog(page).getByRole('checkbox', { name: 'Basic' })).toBeChecked();
    await dialog(page).getByRole('checkbox', { name: 'Effects' }).uncheck();
    await page.screenshot({ path: 'test-results/screenshots/m10-copy-dialog.png' });
    await dialog(page).getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('develop-view')).toContainText(NAMES[1] ?? '');
    await waitForFullRender(page);
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await waitForFullRender(page);
    await expect(page.getByTestId('value-exposure')).toHaveText('+1.50');
    await expect(page.getByTestId('value-vignette')).toHaveText('0'); // Effects was not copied
    await expect(history(page)).toContainText('2 steps');
    await expect(history(page).getByRole('button').first()).toContainText('Paste settings');

    // One step: a single undo restores the photo.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('value-exposure')).toHaveText('0.00');

    // Keyboard: Ctrl/Cmd+Shift+C opens the dialog, Ctrl/Cmd+Shift+V pastes.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('develop-view')).toContainText(NAMES[0] ?? '');
    await page.keyboard.press('ControlOrMeta+Shift+c');
    await dialog(page).getByRole('checkbox', { name: 'Effects' }).check();
    await dialog(page).getByRole('button', { name: 'Copy', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('develop-view')).toContainText(NAMES[1] ?? '');
    await waitForFullRender(page);
    await page.keyboard.press('ControlOrMeta+Shift+v');
    await expect(page.getByTestId('value-vignette')).toHaveText('−40');
    await expect(page.getByTestId('value-exposure')).toHaveText('+1.50');
  });

  test('Previous pastes the last photo’s settings, except crop', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    await openInDevelop(page, NAMES[0] ?? '');
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await edit(page, 'contrast', '35');
    await openPanel(page, 'Crop and geometry');
    await page.getByLabel('Aspect').selectOption('1:1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('develop-view')).toContainText(NAMES[1] ?? '');
    await waitForFullRender(page);
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByTestId('value-contrast')).toHaveText('+35');
    await expect(history(page).getByRole('button').first()).toContainText('Paste from previous');
    const size = await page.getByTestId('photo-canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
    expect(size).toEqual({ w: 240, h: 160 }); // crop not pasted
  });
});

test.describe('Sync settings', () => {
  test('syncs the focused photo to every other selected photo: one undo step per photo', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(4));
    await openInDevelop(page, NAMES[0] ?? '');
    await edit(page, 'exposure', '1');
    await edit(page, 'contrast', '30');
    await openPanel(page, 'Effects');
    await edit(page, 'grain', '20');
    await openPanel(page, 'Crop and geometry');
    await page.getByLabel('Aspect').selectOption('1:1');
    await page.keyboard.press('Escape');
    await waitForFullRender(page);

    await page.getByRole('tab', { name: 'Library' }).click();
    await expect(page.getByRole('button', { name: 'Sync settings…' })).toBeDisabled();
    await selectAllFocusing(page, 0, 3);
    await expect(page.getByTestId('status-bar')).toContainText('4 selected');
    await page.getByRole('button', { name: 'Sync settings…' }).click();
    await expect(dialog(page)).toContainText('Synchronize settings');
    await expect(dialog(page)).toContainText('From IMG_0418.png to 3 other selected photos.');
    await dialog(page).getByRole('checkbox', { name: 'Crop and geometry' }).check();
    await page.screenshot({ path: 'test-results/screenshots/m10-sync-dialog.png' });
    await dialog(page).getByRole('button', { name: 'Synchronize' }).click();
    await expect(page.getByTestId('settings-message')).toHaveText('Synchronized settings to 3 photos');

    const after = await saved(page);
    const source = after[NAMES[0] ?? '']?.settings;
    expect(source?.basic.exposure).toBe(1);
    for (const name of NAMES.slice(1)) {
      const photo = after[name];
      // Exactly one new step per photo.
      expect(photo?.labels, name).toEqual(['Import', 'Sync settings']);
      expect(photo?.cursor).toBe(1);
      expect(photo?.settings).toEqual(source);
      expect(photo?.edited).toBe(true);
    }
    // Edited thumbnails are rendered for the synced photos in the background.
    await expect.poll(async () => Object.values(await storedEditsByName(page)).filter((p) => p.hasEditedThumbnail).length, { timeout: 30_000 }).toBe(4);
    await expect(page.getByTestId('grid-cell').getByRole('img', { name: 'Edited' })).toHaveCount(4);
    await page.screenshot({ path: 'test-results/screenshots/m10-library-synced.png' });

    // Undo in Develop takes back just that photo's sync.
    await openInDevelop(page, NAMES[2] ?? '');
    await expect(history(page)).toContainText('2 steps');
    await expect(page.getByTestId('value-exposure')).toHaveText('+1.00');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('value-exposure')).toHaveText('0.00');
    const undone = await saved(page);
    expect(undone[NAMES[2] ?? '']?.settings).toEqual(defaultEditSettings());
    expect(undone[NAMES[3] ?? '']?.settings).toEqual(source);
  });

  test('in Develop, Ctrl/Cmd-click in the filmstrip turns Previous into Sync…', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await openInDevelop(page, NAMES[0] ?? '');
    await edit(page, 'saturation', '-60');
    const filmstrip = page.getByTestId('filmstrip');
    await filmstrip.getByRole('button', { name: NAMES[2], exact: true }).click({ modifiers: ['ControlOrMeta'] });
    await filmstrip.getByRole('button', { name: NAMES[0], exact: true }).click({ modifiers: ['ControlOrMeta'] });
    await filmstrip.getByRole('button', { name: NAMES[0], exact: true }).click({ modifiers: ['ControlOrMeta'] });
    await expect(filmstrip).toContainText('2 selected');
    await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sync…' }).click();
    await expect(dialog(page)).toContainText('to 1 other selected photo.');
    await dialog(page).getByRole('button', { name: 'Synchronize' }).click();
    await expect.poll(async () => (await saved(page))[NAMES[2] ?? '']?.settings?.basic.saturation).toBe(-60);
    expect((await saved(page))[NAMES[1] ?? '']?.labels ?? []).toEqual([]);
  });
});

test.describe('Batch export', () => {
  test('exports every selected photo with its own edits; files match the CPU reference', async ({ page }) => {
    test.slow();
    const files = testFiles(3);
    await gotoLibrary(page);
    await importViaButton(page, files);
    await openInDevelop(page, NAMES[0] ?? '');
    await edit(page, 'exposure', '0.8');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('develop-view')).toContainText(NAMES[1] ?? '');
    await waitForFullRender(page);
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    await openPanel(page, 'Effects');
    await edit(page, 'vignette', '-50');
    await page.getByRole('tab', { name: 'Library' }).click();
    await selectAllFocusing(page, 0, 2);

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Export 3 photos');
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await dialog(page).getByRole('button', { name: 'Export 3 photos' }).click();
    await expect(page.getByTestId('export-toast')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(page.getByTestId('export-toast')).toContainText('3 photos');
    await page.screenshot({ path: 'test-results/screenshots/m10-batch-export-done.png' });
    expect(downloads.map((d) => d.suggestedFilename())).toEqual(['IMG_0418.png', 'IMG_0419.png', 'IMG_0420.png']);

    const stored = await saved(page);
    for (const [i, download] of downloads.entries()) {
      const name = NAMES[i] ?? '';
      const path = await download.path();
      const exported = decodePng(await readFile(path));
      const source = decodePng(files[i]?.buffer ?? Buffer.alloc(0));
      const settings = stored[name]?.settings ?? defaultEditSettings();
      const reference = renderRgba8(source.data, source, pipelineParams(settings));
      expect({ w: exported.width, h: exported.height }).toEqual({ w: reference.width, h: reference.height });
      let maxDiff = 0;
      for (let k = 0; k < reference.data.length; k++) maxDiff = Math.max(maxDiff, Math.abs((reference.data[k] ?? 0) - (exported.data[k] ?? 0)));
      console.log(`batch export ${name}: max diff ${maxDiff}/255`);
      expect(maxDiff, name).toBeLessThanOrEqual(2);
    }
    // The three files really differ (each photo's own edits).
    expect(stored[NAMES[1] ?? '']?.settings?.basic.treatment).toBe('bw');
    expect(stored[NAMES[2] ?? '']?.labels ?? []).toEqual([]);

    // Custom names get a sequence number per photo.
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByLabel('Rename to').selectOption('custom');
    await page.getByLabel('Custom name').fill('Trip');
    downloads.length = 0;
    await dialog(page).getByRole('button', { name: 'Export 3 photos' }).click();
    await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(3);
    expect(downloads.map((d) => d.suggestedFilename())).toEqual(['Trip-1.png', 'Trip-2.png', 'Trip-3.png']);
  });

  test('the toast counts photos while a batch runs, and Cancel stops the batch', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(6, 1600, 1200));
    await selectAllFocusing(page, 0, 5);
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'Full size JPEG' }).click();
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await dialog(page).getByRole('button', { name: 'Export 6 photos' }).click();
    await expect(page.getByTestId('export-toast')).toContainText(/Exporting [123] of 6/);
    await page.screenshot({ path: 'test-results/screenshots/m10-batch-export-progress.png' });
    await page.getByTestId('export-toast').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('export-toast')).toHaveAttribute('data-status', 'cancelled');
    expect(downloads.length).toBeLessThan(6);
  });
});
