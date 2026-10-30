import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { canvasPixels, gotoDevelop, openPanel, openTestPhoto, typeSliderValue, waitForFullRender } from './utils/develop';
import { savedSettings } from './utils/idb';
import { decodePng, encodePng, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;

/** Left half blue, right half orange; each darker at the top and brighter at the bottom. */
function twoColors(): RgbaPixels {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = 0.35 + 0.6 * (y / H);
    for (let x = 0; x < W; x++) {
      const rgb = x < W / 2 ? [40, 90, 220] : [230, 120, 40];
      data.set([...rgb.map((c) => Math.round(c * t)), 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

const photo = twoColors();

/** Mean of all channels over a rectangle given in fractions of the image. */
function mean(img: RgbaPixels, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0 * img.height); y < Math.floor(y1 * img.height); y++) {
    for (let x = Math.floor(x0 * img.width); x < Math.floor(x1 * img.width); x++) {
      const i = (y * img.width + x) * 4;
      sum += (img.data[i] ?? 0) + (img.data[i + 1] ?? 0) + (img.data[i + 2] ?? 0);
      n += 3;
    }
  }
  return sum / n;
}

/** A linear gradient whose full-effect side covers the whole photo (start near the bottom, end below it). */
async function wholePhotoMask(page: Page) {
  await page.getByRole('button', { name: 'Linear gradient' }).click();
  const box = await page.getByTestId('photo-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height - 8);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height - 1, { steps: 3 });
  await page.mouse.up();
  await typeSliderValue(page, 'mask-exposure', '1.2');
  await waitForFullRender(page);
}

test.describe('Range masks (M30)', () => {
  test('a picked color range changes only that color; a luminance range only that band; the overlay shows it', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(photo));
    const original = await canvasPixels(page);
    await openPanel(page, 'Masks');
    await wholePhotoMask(page);
    const unlimited = await canvasPixels(page);
    expect(mean(unlimited, 0.6, 0.1, 0.9, 0.9)).toBeGreaterThan(mean(original, 0.6, 0.1, 0.9, 0.9) + 15);

    // Color: pick the blue.
    const range = page.getByRole('group', { name: 'Range mask' });
    await range.getByRole('button', { name: 'Color' }).click();
    await page.getByRole('button', { name: 'Pick a color' }).click();
    const box = await page.getByTestId('photo-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await expect(page.getByRole('button', { name: 'Pick a color' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('history').getByText('Mask color range')).toBeVisible();
    await waitForFullRender(page);
    const blues = await canvasPixels(page);
    expect(mean(blues, 0.1, 0.1, 0.4, 0.9)).toBeGreaterThan(mean(original, 0.1, 0.1, 0.4, 0.9) + 15);
    expect(Math.abs(mean(blues, 0.6, 0.1, 0.9, 0.9) - mean(original, 0.6, 0.1, 0.9, 0.9))).toBeLessThan(0.5);

    // The overlay (O) tints just the blue half.
    await page.keyboard.press('o');
    await waitForFullRender(page);
    const tinted = await canvasPixels(page);
    const redness = (img: RgbaPixels, x0: number, x1: number) => {
      let r = 0;
      let n = 0;
      for (let y = 40; y < img.height - 40; y += 4) {
        for (let x = Math.floor(x0 * img.width); x < Math.floor(x1 * img.width); x += 4) {
          const i = (y * img.width + x) * 4;
          r += (img.data[i] ?? 0) - (img.data[i + 2] ?? 0);
          n++;
        }
      }
      return r / n;
    };
    expect(redness(tinted, 0.1, 0.4)).toBeGreaterThan(redness(blues, 0.1, 0.4) + 40);
    expect(Math.abs(redness(tinted, 0.6, 0.9) - redness(blues, 0.6, 0.9))).toBeLessThan(1);
    await page.screenshot({ path: 'test-results/screenshots/m30-color-range-overlay.png' });
    await page.keyboard.press('o');

    // Luminance: only the bright bottom part of both halves.
    await range.getByRole('button', { name: 'Luminance' }).click();
    await typeSliderValue(page, 'range-lo', '45');
    await typeSliderValue(page, 'range-smooth', '0');
    await waitForFullRender(page);
    const bright = await canvasPixels(page);
    expect(Math.abs(mean(bright, 0.6, 0.02, 0.9, 0.2) - mean(original, 0.6, 0.02, 0.9, 0.2))).toBeLessThan(0.5);
    expect(mean(bright, 0.6, 0.85, 0.9, 0.98)).toBeGreaterThan(mean(original, 0.6, 0.85, 0.9, 0.98) + 15);
    await page.screenshot({ path: 'test-results/screenshots/m30-luminance-range.png' });

    // Export matches the CPU reference.
    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    await expect.poll(async () => (await savedSettings(page)).masks[0]?.range?.smooth).toBe(0);
    const reference = renderRgba8(photo.data, photo, pipelineParams(await savedSettings(page)));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`range mask export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
});
