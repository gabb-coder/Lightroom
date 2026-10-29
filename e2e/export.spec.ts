import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { readExifCaptureDate } from '../src/io/exif';
import { gotoDevelop, openTestPhoto, slider, smallPhotoPng, waitForFullRender } from './utils/develop';
import { savedSettings, storedOriginalHash } from './utils/idb';
import { withExifDate } from './utils/jpeg';
import { decodePng, makeTestPhoto } from './utils/png';

const dialog = (page: Page) => page.getByRole('dialog');

async function openExport(page: Page) {
  await page.getByRole('tab', { name: 'Export' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function exportAndDownload(page: Page): Promise<{ download: Download; bytes: Buffer }> {
  const downloadEvent = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: 'Export 1 photo' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error('download failed');
  return { download, bytes: await readFile(path) };
}

/** Width/height of an image file, decoded by the browser. */
async function decodedSize(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ([data, mime]) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: mime }));
      return { width: bitmap.width, height: bitmap.height };
    },
    [Array.from(bytes), type] as const,
  );
}

test.describe('Export', () => {
  test('the dialog matches the design and opens with the tab or Ctrl/Cmd+Shift+E', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await openExport(page);
    await expect(dialog(page)).toContainText('Export 1 photo');
    const presets = dialog(page).getByRole('group', { name: 'Export presets' });
    await expect(presets.getByRole('button')).toHaveText(['For web, 2048 px', 'Full size JPEG', 'Social square, 1080 px', 'PNG, lossless', '+Save as preset']);
    await expect(dialog(page)).toContainText('Originals are never changed. Edits are applied at full resolution.');
    await expect(page.getByTestId('export-example')).toHaveText('Example: test-photo.jpg');
    await page.screenshot({ path: 'test-results/screenshots/m7-export-dialog.png' });

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('develop-view')).toBeVisible(); // back where we came from
    await page.keyboard.press('ControlOrMeta+Shift+e');
    await expect(dialog(page)).toBeVisible();
  });

  test('a full-resolution PNG export matches the CPU reference of the edited photo; the original is untouched', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const originalHash = await storedOriginalHash(page);
    expect(originalHash).toBe(createHash('sha256').update(smallPhotoPng).digest('hex'));

    // Color edits plus geometry, so every stage is exercised.
    for (const [label, key, n] of [
      ['Exposure', 'ArrowRight', 8],
      ['Contrast', 'ArrowRight', 25],
      ['Shadows', 'ArrowRight', 30],
      ['Vibrance', 'ArrowRight', 20],
    ] as const) {
      await slider(page, label).focus();
      for (let i = 0; i < n; i++) await page.keyboard.press(key);
    }
    await page.getByRole('button', { name: 'Crop and geometry' }).click();
    await slider(page, 'Straighten').focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowLeft');
    await page.getByLabel('Aspect').selectOption('4:5');
    await waitForFullRender(page);
    const onScreen = await page.getByTestId('photo-canvas').evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));

    await openExport(page);
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    const { download, bytes } = await exportAndDownload(page);
    expect(download.suggestedFilename()).toBe('test-photo.png');
    await expect(page.getByTestId('export-toast')).toHaveAttribute('data-status', 'done');
    await page.screenshot({ path: 'test-results/screenshots/m7-export-toast.png' });

    const exported = decodePng(bytes);
    expect({ width: exported.width, height: exported.height }).toEqual(onScreen); // full resolution, same crop

    // CPU reference: the original pixels through the saved settings.
    const settings = await savedSettings(page);
    expect(settings.geometry.angle).toBe(-2.5);
    const reference = renderRgba8(makeTestPhoto(600, 360).data, { width: 600, height: 360 }, pipelineParams(settings));
    expect(reference.width).toBe(exported.width);
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((reference.data[i] ?? 0) - (exported.data[i] ?? 0)));
    console.log(`export vs CPU reference: max diff ${maxDiff}/255 at ${exported.width}×${exported.height}`);
    expect(maxDiff).toBeLessThanOrEqual(2);

    expect(await storedOriginalHash(page)).toBe(originalHash);
  });

  test('JPEG export: resize by long edge, quality, custom names', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await openExport(page);
    await page.getByLabel('Long edge in pixels').fill('200');
    await page.getByLabel('Rename to').selectOption('custom');
    await page.getByLabel('Custom name').fill('Trip');
    await expect(page.getByTestId('export-example')).toHaveText('Example: Trip-1.jpg');
    await page.getByLabel('Quality').fill('95');
    const high = await exportAndDownload(page);
    expect(high.download.suggestedFilename()).toBe('Trip-1.jpg');
    expect(await decodedSize(page, high.bytes, 'image/jpeg')).toEqual({ width: 200, height: 120 });

    // Same size, lower quality: a smaller file.
    await openExport(page);
    await page.getByLabel('Quality').fill('20');
    const low = await exportAndDownload(page);
    expect(await decodedSize(page, low.bytes, 'image/jpeg')).toEqual({ width: 200, height: 120 });
    expect(low.bytes.length).toBeLessThan(high.bytes.length * 0.6);
    expect(high.bytes.subarray(0, 2).toString('hex')).toBe('ffd8');

    // Without resizing: full resolution.
    await openExport(page);
    await page.getByLabel('Resize to fit').uncheck();
    const full = await exportAndDownload(page);
    expect(await decodedSize(page, full.bytes, 'image/jpeg')).toEqual({ width: 600, height: 360 });
  });

  test('metadata: EXIF is copied from a JPEG original by policy', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    const jpeg = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(90, 60);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.fillStyle = '#6a8';
      ctx.fillRect(0, 0, 90, 60);
      return Array.from(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer()));
    });
    await page.getByTestId('file-input').setInputFiles({ name: 'dated.jpg', mimeType: 'image/jpeg', buffer: withExifDate(new Uint8Array(jpeg), '2021:07:04 09:15:30') });
    await waitForFullRender(page);

    await openExport(page);
    await dialog(page).getByRole('button', { name: 'Full size JPEG' }).click();
    await page.getByLabel('Include').selectOption('all');
    const withMeta = await exportAndDownload(page);
    const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    expect(readExifCaptureDate(ab(withMeta.bytes))).toBe(new Date(2021, 6, 4, 9, 15, 30).getTime());

    await openExport(page);
    await page.getByLabel('Include').selectOption('none');
    const noMeta = await exportAndDownload(page);
    expect(readExifCaptureDate(ab(noMeta.bytes))).toBeNull();
  });

  test('export presets can be saved and survive a reload', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await openExport(page);
    await page.getByLabel('Long edge in pixels').fill('640');
    await dialog(page).getByRole('button', { name: 'Save as preset' }).click();
    await page.getByLabel('Export preset name').fill('Blog 640');
    await page.getByLabel('Export preset name').press('Enter');
    await expect(dialog(page).getByRole('button', { name: 'Blog 640' })).toHaveAttribute('aria-current', 'true');
    await page.reload();
    await openExport(page);
    await dialog(page).getByRole('button', { name: 'For web, 2048 px' }).click();
    await expect(page.getByLabel('Long edge in pixels')).toHaveValue('2048');
    await dialog(page).getByRole('button', { name: 'Blog 640' }).click();
    await expect(page.getByLabel('Long edge in pixels')).toHaveValue('640');
  });
});
