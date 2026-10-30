import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { applyWatermark, watermarkGeometry, watermarkRect } from '../src/engine/watermark';
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

    const enabled = dialog(page).getByLabel('Add a watermark');
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

  test('clicking the preview enlarges it with a sharper render; Esc or a click closes only the enlarged view', async ({ page }) => {
    test.slow();
    const logo = makeLogo();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    await page.getByRole('tab', { name: 'Export' }).click();
    await addLogo(page, logo);
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('25');
    const small = await page.getByTestId('watermark-preview').locator('img').first().boundingBox();
    if (!small) throw new Error('no preview');

    await page.getByRole('button', { name: 'Enlarge the watermark preview' }).click();
    const zoom = page.getByTestId('watermark-zoom');
    await expect(zoom).toBeVisible();
    await expect(zoom).toHaveAttribute('data-sharp', 'true', { timeout: 30_000 });
    await expect(zoom.getByRole('button', { name: 'Close preview' })).toBeFocused();
    // The sharp render is the photo itself (600 × 360 is below the screen-size cap), shown much larger.
    const photo = zoom.locator('img').first();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([600, 360]);
    const big = await photo.boundingBox();
    const mark = await page.getByTestId('watermark-zoom-logo').boundingBox();
    if (!big || !mark) throw new Error('no enlarged preview');
    expect(big.width).toBeGreaterThan(small.width * 2);
    // Same placement as the export.
    const expected = watermarkRect({ width: 600, height: 360 }, logo, { position: 'bottom-right', size: 25, inset: 3 });
    expect(Math.abs((mark.x - big.x) / big.width - expected.x / 600)).toBeLessThan(0.01);
    expect(Math.abs((mark.y - big.y) / big.height - expected.y / 360)).toBeLessThan(0.01);
    expect(Math.abs(mark.width / big.width - expected.width / 600)).toBeLessThan(0.01);
    await page.screenshot({ path: 'test-results/screenshots/m25-watermark-zoom.png' });

    // Esc closes the enlarged view, not the Export dialog.
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enlarge the watermark preview' })).toBeFocused();

    // Reopening is instant (the render is kept); a click anywhere closes it.
    await page.getByRole('button', { name: 'Enlarge the watermark preview' }).click();
    await expect(zoom).toHaveAttribute('data-sharp', 'true');
    await page.mouse.click(10, 10);
    await expect(zoom).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });

  test('dragging the watermark in the enlarged preview moves it on the export; it snaps to the grid', async ({ page }) => {
    test.slow();
    const logo = makeLogo();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    await addLogo(page, logo);
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('25');
    await dialog(page).getByRole('slider', { name: 'Opacity', exact: true }).fill('100');
    await page.getByRole('button', { name: 'Enlarge the watermark preview' }).click();
    const zoom = page.getByTestId('watermark-zoom');
    await expect(zoom).toHaveAttribute('data-sharp', 'true', { timeout: 30_000 });
    const photo = zoom.locator('img').first();
    const mark = page.getByTestId('watermark-zoom-logo');
    const stored = () => page.evaluate(() => (JSON.parse(localStorage.getItem('photo-editor:ui') ?? '{}') as { exportOptions: { watermark: { position: string; x: number; y: number } } }).exportOptions.watermark);

    /** Drags the mark so its top-left corner goes to (fx, fy) of the photo. */
    const dragTo = async (fx: number, fy: number) => {
      const big = await photo.boundingBox();
      const box = await mark.boundingBox();
      if (!big || !box) throw new Error('no enlarged preview');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(big.x + fx * big.width + box.width / 2, big.y + fy * big.height + box.height / 2, { steps: 8 });
      await page.mouse.up();
    };

    // Past the corner: kept inside the margin and snapped to "Top left".
    await dragTo(-0.5, -0.5);
    await expect(zoom).toBeVisible(); // a drag doesn't close the view
    expect(await stored()).toMatchObject({ position: 'top-left', x: 0, y: 0 });

    // Somewhere off the grid: a custom spot.
    await dragTo(0.3, 0.4);
    const placed = await stored();
    expect(placed.position).toBe('custom');
    const expected = watermarkRect({ width: 600, height: 360 }, logo, { position: 'custom', size: 25, inset: 3, x: placed.x, y: placed.y });
    expect(Math.abs(expected.x / 600 - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(expected.y / 360 - 0.4)).toBeLessThan(0.02);
    // Arrow keys nudge it by 2% of the room.
    await mark.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await stored()).x).toBeCloseTo(placed.x + 0.02, 6);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await stored()).x).toBeCloseTo(placed.x, 6);
    const big = await photo.boundingBox();
    const shown = await mark.boundingBox();
    if (!big || !shown) throw new Error('no enlarged preview');
    expect(Math.abs((shown.x - big.x) / big.width - expected.x / 600)).toBeLessThan(0.01);
    expect(Math.abs((shown.y - big.y) / big.height - expected.y / 360)).toBeLessThan(0.01);
    await page.mouse.move(shown.x + shown.width / 2, shown.y + shown.height / 2);
    await page.screenshot({ path: 'test-results/screenshots/m25-watermark-drag.png' });

    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await expect(dialog(page).locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
    await expect(dialog(page).getByText('Custom spot, dragged in the enlarged preview.')).toBeVisible();
    await page.getByTestId('watermark-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/m25-watermark-custom.png' });

    // The export puts it exactly there.
    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    const source = makeTestPhoto(600, 360);
    const rendered = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
    const reference = { width: 600, height: 360, data: new Uint8ClampedArray(rendered.data) };
    expect(applyWatermark(reference, logo, { position: 'custom', size: 25, inset: 3, x: placed.x, y: placed.y }, 1)).toEqual(expected);
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) if (i % 4 !== 3) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`dragged watermark export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);

    // A grid square puts it back.
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('radio', { name: 'Bottom right' }).click();
    expect(await stored()).toMatchObject({ position: 'bottom-right', x: 1, y: 1 });
  });

  test('logos are kept in the catalog, can be removed, survive a reload and come back from a backup', async ({ page, browser }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(1));
    await page.getByRole('tab', { name: 'Export' }).click();
    await addLogo(page, makeLogo());
    await dialog(page).getByRole('button', { name: 'Full size JPEG' }).click();
    // A preset is a look: the logo stays on.
    await expect(dialog(page).getByLabel('Add a watermark')).toBeChecked();

    // A file that can't be a logo gets a clear message.
    await page.getByTestId('logo-input').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(dialog(page).getByRole('alert')).toHaveText("logo.svg can't be used as a logo. Choose a PNG, JPEG or WebP file.");

    await page.reload();
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(dialog(page).getByLabel('Add a watermark')).toBeChecked();
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

  test('a text watermark: typed text, color and shadow, placed like a logo; kept after a reload', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    await dialog(page).getByLabel('Add a watermark').check();
    await dialog(page).getByRole('group', { name: 'Watermark type' }).getByRole('button', { name: 'Text' }).click();
    await expect(dialog(page).getByText('Type the text to put on your photos')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Export 1 photo' })).toBeEnabled();
    await dialog(page).getByLabel('Text', { exact: true }).fill('© Darkroom Studio');
    await dialog(page).getByLabel('Color', { exact: true }).fill('#ffd400');
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('40');
    await dialog(page).getByRole('slider', { name: 'Opacity', exact: true }).fill('100');
    await dialog(page).getByRole('slider', { name: 'Margin', exact: true }).fill('4');
    await expect(page.getByTestId('watermark-preview-logo')).toBeVisible();
    await page.getByTestId('watermark-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/m24-text-watermark-dialog.png' });

    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await readFile(await (await download).path());
    await writeFile('test-results/screenshots/m24-text-exported.png', file);
    const exported = decodePng(file);

    // Compare with the photo without a watermark: only the bottom-right text box changes.
    const source = makeTestPhoto(600, 360);
    const plain = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
    const inset = Math.round(360 * 0.04);
    let box = { x0: 600, y0: 360, x1: -1, y1: -1 };
    let yellow = 0;
    for (let y = 0; y < 360; y++) {
      for (let x = 0; x < 600; x++) {
        const i = (y * 600 + x) * 4;
        const d = Math.max(...[0, 1, 2].map((c) => Math.abs((exported.data[i + c] ?? 0) - (plain.data[i + c] ?? 0))));
        if (d > 2) box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
        // Pure text color (#ffd400) where the letters are solid.
        if (Math.abs((exported.data[i] ?? 0) - 255) <= 2 && Math.abs((exported.data[i + 1] ?? 0) - 212) <= 2 && (exported.data[i + 2] ?? 0) <= 2) yellow++;
      }
    }
    console.log('text watermark changed box', box, 'solid yellow pixels', yellow);
    // Inside the margins, at the bottom right, and about 40% of the width wide.
    expect(box.x1).toBeLessThan(600 - inset);
    expect(box.y1).toBeLessThan(360 - inset);
    expect(box.x0).toBeGreaterThan(600 - inset - 0.4 * 600 - 1);
    expect(box.x1 - box.x0).toBeGreaterThan(0.4 * 600 * 0.8);
    expect(box.y0).toBeGreaterThan(180); // lower half
    expect(yellow).toBeGreaterThan(300);

    await page.reload();
    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(dialog(page).getByLabel('Text', { exact: true })).toHaveValue('© Darkroom Studio');
    await expect(dialog(page).getByRole('group', { name: 'Watermark type' }).getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('two watermarks, one turned and one repeated across the photo: the export matches the CPU reference (M35)', async ({ page }) => {
    test.slow();
    const logo = makeLogo();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    const marks = dialog(page).getByRole('group', { name: 'Which watermark' });
    await expect(marks.getByRole('button', { name: 'Watermark 1' })).toHaveAttribute('aria-pressed', 'true');

    // Watermark 1: the logo, turned 30° clockwise, bottom right.
    await addLogo(page, logo);
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('30');
    await dialog(page).getByRole('slider', { name: 'Opacity', exact: true }).fill('80');
    await dialog(page).getByRole('slider', { name: 'Margin', exact: true }).fill('4');
    await dialog(page).getByRole('slider', { name: 'Rotation', exact: true }).fill('30');
    await expect(dialog(page).locator('output[for="ex-wm-rotation"]')).toHaveText('30°');

    // Watermark 2: its own logo, repeated across the photo at −20°.
    await marks.getByRole('button', { name: 'Watermark 2' }).click();
    const second = dialog(page).getByLabel('Add a second watermark');
    await expect(second).not.toBeChecked();
    await addLogo(page, logo, 'pattern-logo.png');
    await expect(second).toBeChecked(); // the new logo went to this mark, and switched it on
    await expect(dialog(page).getByLabel('Logo', { exact: true }).locator('option:checked')).toHaveText('pattern-logo.png');
    await dialog(page).getByLabel('Repeat across the photo').check();
    await expect(dialog(page).getByRole('radiogroup', { name: 'Watermark position' })).toHaveCount(0);
    await expect(dialog(page).getByRole('slider', { name: 'Margin', exact: true })).toHaveCount(0);
    await dialog(page).getByRole('slider', { name: 'Size', exact: true }).fill('15');
    await dialog(page).getByRole('slider', { name: 'Opacity', exact: true }).fill('40');
    await dialog(page).getByRole('slider', { name: 'Spacing', exact: true }).fill('80');
    await dialog(page).getByRole('slider', { name: 'Rotation', exact: true }).fill('-20');

    // The preview shows both: many tiles plus the turned mark, each where the export puts it.
    const preview = page.getByTestId('watermark-preview');
    await page.getByTestId('watermark-preview').scrollIntoViewIfNeeded();
    await expect.poll(() => preview.locator('img[alt=""]').count()).toBeGreaterThan(12);
    await expect(preview.locator('img[alt=""][style*="rotate(30deg)"]')).toHaveCount(1);
    await expect(preview.locator('img[alt=""][style*="rotate(-20deg)"]').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m35-two-watermarks-dialog.png' });
    await marks.getByRole('button', { name: 'Watermark 1' }).click();
    await expect(dialog(page).getByLabel('Logo', { exact: true }).locator('option:checked')).toHaveText('studio-logo.png');
    const frame = await preview.locator('img').first().boundingBox();
    const shown = await page.getByTestId('watermark-preview-logo').boundingBox();
    if (!frame || !shown) throw new Error('no preview');
    const first = { position: 'bottom-right' as const, size: 30, inset: 4, rotation: 30 };
    const g = watermarkGeometry({ width: 600, height: 360 }, logo, first);
    expect(Math.abs((shown.x - frame.x) / frame.width - g.rect.x / 600)).toBeLessThan(0.01);
    expect(Math.abs(shown.width / frame.width - g.rect.width / 600)).toBeLessThan(0.01);
    expect(Math.abs(shown.height / frame.height - g.rect.height / 360)).toBeLessThan(0.01);

    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await readFile(await (await download).path());
    await writeFile('test-results/screenshots/m35-exported.png', file);
    const exported = decodePng(file);

    const source = makeTestPhoto(600, 360);
    const photo = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
    const reference = { width: photo.width, height: photo.height, data: new Uint8ClampedArray(photo.data) };
    applyWatermark(reference, logo, first, 0.8);
    applyWatermark(reference, logo, { position: 'bottom-right', size: 15, inset: 3, rotation: -20 }, 0.4, { spacing: 80 });
    let maxDiff = 0;
    let changed = 0;
    for (let i = 0; i < reference.data.length; i++) {
      if (i % 4 === 3) continue;
      maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
      if (Math.abs((exported.data[i] ?? 0) - (photo.data[i] ?? 0)) > 10) changed++;
    }
    console.log(`two watermarks vs CPU reference: max diff ${maxDiff}/255, ${changed} channel values changed`);
    expect(maxDiff).toBeLessThanOrEqual(2);
    // The pattern really covers the photo: marks in all four quarters.
    const quarter = (qx: number, qy: number) => {
      let n = 0;
      for (let y = qy * 180; y < qy * 180 + 180; y++) {
        for (let x = qx * 300; x < qx * 300 + 300; x++) {
          const i = (y * 600 + x) * 4;
          if (Math.abs((exported.data[i] ?? 0) - (photo.data[i] ?? 0)) > 10) n++;
        }
      }
      return n;
    };
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) expect(quarter(qx, qy)).toBeGreaterThan(300);

    // Both are kept settings: still there after a reload.
    await page.reload();
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('group', { name: 'Which watermark' }).getByRole('button', { name: 'Watermark 2' }).click();
    await expect(dialog(page).getByLabel('Add a second watermark')).toBeChecked();
    await expect(dialog(page).getByLabel('Repeat across the photo')).toBeChecked();
    await expect(dialog(page).locator('output[for="ex-wm-spacing"]')).toHaveText('80%');
  });

  test('text watermarks can use another font and a regular weight (M35)', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByLabel('Add a watermark').check();
    await dialog(page).getByRole('group', { name: 'Watermark type' }).getByRole('button', { name: 'Text' }).click();
    await dialog(page).getByLabel('Text', { exact: true }).fill('Darkroom Mmm');
    const mark = page.getByTestId('watermark-preview-logo').locator('img');
    const aspect = () => mark.evaluate((el: HTMLImageElement) => (el.complete && el.naturalHeight ? el.naturalWidth / el.naturalHeight : 0));
    await expect.poll(aspect).toBeGreaterThan(0);
    const sansBold = await aspect();
    const font = dialog(page).getByLabel('Font', { exact: true });
    await expect(font).toHaveValue('sans');
    await expect(dialog(page).getByLabel('Bold')).toBeChecked();
    await font.selectOption('mono');
    await expect.poll(aspect).not.toBeCloseTo(sansBold, 2);
    const monoBold = await aspect();
    await dialog(page).getByLabel('Bold').uncheck();
    await expect.poll(aspect).not.toBeCloseTo(monoBold, 3);
    await page.getByTestId('watermark-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/m35-text-font.png' });
  });
});
