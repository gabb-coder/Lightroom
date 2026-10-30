import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { applyOutputSharpen, outputSharpenParams } from '../src/engine/outputSharpen';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { DEFAULT_SHEET_OPTIONS, sheetLayout } from '../src/model/contactSheet';
import { defaultEditSettings } from '../src/model/editSettings';
import { gotoDevelop, openTestPhoto, smallPhotoPng } from './utils/develop';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';
import { decodePng, makeTestPhoto } from './utils/png';

test.describe('Output sharpening and contact sheets (M34)', () => {
  test('output sharpening for matte paper: the export matches the CPU reference', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    await expect(dialog.getByLabel('Amount')).toBeDisabled();
    await dialog.getByLabel('Sharpen for').selectOption('matte');
    await dialog.getByLabel('Amount').selectOption('high');
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));

    const source = makeTestPhoto(600, 360);
    const rendered = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
    const reference = { width: rendered.width, height: rendered.height, data: new Uint8ClampedArray(rendered.data) };
    const p = outputSharpenParams('matte', 'high');
    if (!p) throw new Error('expected params');
    applyOutputSharpen(reference, p);
    let maxDiff = 0;
    let changed = 0;
    for (let i = 0; i < reference.data.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
      if (reference.data[i] !== rendered.data[i]) changed++;
    }
    console.log(`output sharpening export vs CPU reference: max diff ${maxDiff}/255, ${changed} values sharpened`);
    expect(changed).toBeGreaterThan(1000);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  test('a contact sheet of three photos: the grid, the photos and their names', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3, 480, 320));
    await cells(page).nth(0).click();
    await cells(page).nth(2).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Contact sheet' }).click();
    const dialog = page.getByTestId('contact-sheet-dialog');
    await expect(dialog).toContainText('3 photos on 1 page');
    await dialog.getByLabel('Columns').selectOption('2');
    await dialog.getByLabel('Format').selectOption('png');
    await page.screenshot({ path: 'test-results/screenshots/m34-contact-dialog.png' });
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Make contact sheet' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('contact-sheet.png');
    const sheet = decodePng(await readFile(await file.path()));
    const layout = sheetLayout(3, { ...DEFAULT_SHEET_OPTIONS, columns: 2, format: 'png' });
    expect([sheet.width, sheet.height]).toEqual([layout.width, layout.height]);
    const px = (x: number, y: number) => Array.from(sheet.data.slice((Math.floor(y) * sheet.width + Math.floor(x)) * 4, (Math.floor(y) * sheet.width + Math.floor(x)) * 4 + 3));
    const sheetCells = layout.pages[0] ?? [];
    expect(sheetCells).toHaveLength(3);
    for (const c of sheetCells) {
      // The photo (a colorful gradient) fills its 3:2 area inside the 4:3 box: the center is not paper-white.
      const center = px(c.box.x + c.box.width / 2, c.box.y + c.box.height / 2);
      expect(center.some((v) => v < 230), `photo ${c.index}`).toBe(true);
      // Its name: dark text pixels on the caption line.
      let dark = 0;
      for (let x = c.box.x; x < c.box.x + c.box.width; x++) if ((px(x, c.captionY)[0] ?? 255) < 120) dark++;
      expect(dark, `caption ${c.index}`).toBeGreaterThan(5);
    }
    // The empty fourth cell and the margins stay white.
    expect(px(5, 5)).toEqual([255, 255, 255]);
    const empty = sheetCells[1];
    if (!empty) throw new Error('no cell');
    expect(px(empty.box.x + empty.box.width / 2, empty.box.y + empty.box.height * 1.6 + 1.5 * (empty.captionY - empty.box.y))).toEqual([255, 255, 255]);
    await readFile(await file.path()).then((b) => import('node:fs/promises').then((fs) => fs.writeFile('test-results/screenshots/m34-contact-sheet.png', b)));
  });
});
