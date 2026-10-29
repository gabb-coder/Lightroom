import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { applyWatermark, watermarkRect } from '../src/engine/watermark';
import { defaultEditSettings } from '../src/model/editSettings';
import { gotoDevelop, openTestPhoto, smallPhotoPng } from './utils/develop';
import { storeCount } from './utils/idb';
import { gotoLibrary, importViaButton, testFiles } from './utils/library';
import { decodePng, encodePng, makeTestPhoto, type RgbaPixels } from './utils/png';

const dialog = (page: Page) => page.getByRole('dialog');

/**
 * A 120 × 60 logo on a transparent background: an opaque white bar with a
 * dark square, and a half-transparent orange strip (tests alpha blending).
 */
function makeLogo(): RgbaPixels {
  const width = 120;
  const height = 60;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (y >= 10 && y < 35 && x >= 5 && x < 115) data.set(x >= 15 && x < 35 && y >= 15 && y < 30 ? [20, 20, 30, 255] : [255, 255, 255, 255], i);
      else if (y >= 42 && y < 52) data.set([255, 140, 0, 128], i);
    }
  }
  return { width, height, data };
}

async function addLogo(page: Page, logo: RgbaPixels, name = 'studio-logo.png') {
  await page.getByTestId('logo-input').setInputFiles({ name, mimeType: 'image/png', buffer: encodePng(logo) });
  await expect(dialog(page).getByLabel('Logo', { exact: true })).toHaveValue(/.+/);
}

test.describe('Logo watermark (M23)', () => {
  test('the export carries the logo where the preview shows it; matches the CPU reference', async ({ page }) => {
    test.slow();
    const logo = makeLogo();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();

    const enabled = dialog(page).getByLabel('Add a logo');
    await expect(enabled).not.toBeChecked();
    await addLogo(page, logo);
    await expect(enabled).toBeChecked(); // adding a logo switches it on
    await dialog(page).getByRole('radio', { name: 'Top left' }).click();
    await expect(dialog(page).getByRole('radio', { name: 'Top left' })).toHaveAttribute('aria-checked', 'true');
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('30');
    await dialog(page).getByRole('slider', { name: 'Opacity', exact: true }).fill('70');
    await dialog(page).getByRole('slider', { name: 'Margin', exact: true }).fill('5');
    const preview = page.getByTestId('watermark-preview-logo');
    await expect(preview).toBeVisible();
    await page.getByTestId('watermark-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/m23-watermark-dialog.png' });

    // The preview puts the logo where the export will.
    const frame = await page.getByTestId('watermark-preview').locator('img').first().boundingBox();
    const shown = await preview.boundingBox();
    if (!frame || !shown) throw new Error('no preview');
    const expected = watermarkRect({ width: 600, height: 360 }, logo, { position: 'top-left', size: 30, inset: 5 });
    expect(Math.abs((shown.x - frame.x) / frame.width - expected.x / 600)).toBeLessThan(0.01);
    expect(Math.abs(shown.width / frame.width - expected.width / 600)).toBeLessThan(0.01);

    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await readFile(await (await download).path());
    await writeFile('test-results/screenshots/m23-exported.png', file);
    const exported = decodePng(file);

    const source = makeTestPhoto(600, 360);
    const photo = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
    const reference = { width: photo.width, height: photo.height, data: new Uint8ClampedArray(photo.data) };
    const rect = applyWatermark(reference, logo, { position: 'top-left', size: 30, inset: 5 }, 0.7);
    expect(rect).toEqual(expected);
    let maxDiff = 0;
    let outside = 0;
    let changed = 0;
    for (let y = 0; y < 360; y++) {
      for (let x = 0; x < 600; x++) {
        const inside = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
        for (let c = 0; c < 3; c++) {
          const i = (y * 600 + x) * 4 + c;
          const d = Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0));
          maxDiff = Math.max(maxDiff, d);
          if (!inside) outside = Math.max(outside, d);
          if (inside && Math.abs((exported.data[i] ?? 0) - (photo.data[i] ?? 0)) > 10) changed++;
        }
      }
    }
    console.log(`watermarked export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
    expect(outside).toBe(0); // nothing changes away from the logo
    expect(changed).toBeGreaterThan(1000); // the logo is really there
  });

  test('logos are kept in the catalog, can be removed, survive a reload and come back from a backup', async ({ page, browser }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(1));
    await page.getByRole('tab', { name: 'Export' }).click();
    await addLogo(page, makeLogo());
    await dialog(page).getByRole('button', { name: 'Full size JPEG' }).click();
    // A preset is a look: the logo stays on.
    await expect(dialog(page).getByLabel('Add a logo')).toBeChecked();

    // A file that can't be a logo gets a clear message.
    await page.getByTestId('logo-input').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(dialog(page).getByRole('alert')).toHaveText("logo.svg can't be used as a logo. Choose a PNG, JPEG or WebP file.");

    await page.reload();
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(dialog(page).getByLabel('Add a logo')).toBeChecked();
    await expect(dialog(page).getByLabel('Logo', { exact: true }).locator('option:checked')).toHaveText('studio-logo.png');
    await page.keyboard.press('Escape');

    // Back up, restore into an empty profile: the logo comes along.
    await page.getByRole('tab', { name: 'Library' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('region', { name: 'Backup' }).getByRole('button', { name: 'Back up catalog' }).click();
    const path = await (await download).path();
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await gotoLibrary(fresh);
    await fresh.getByTestId('restore-input').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: await readFile(path) });
    await expect.poll(() => storeCount(fresh, 'logos')).toBe(1);
    await context.close();

    // Removing the logo leaves the watermark with nothing to place.
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'Remove logo studio-logo.png' }).click();
    await expect(dialog(page).getByLabel('Logo', { exact: true })).toHaveText('No logo yet');
    expect(await storeCount(page, 'logos')).toBe(0);
  });
});
