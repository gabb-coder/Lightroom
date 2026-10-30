import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { defaultEditSettings } from '../src/model/editSettings';
import { canvasPixels, gotoDevelop, openPanel, openTestPhoto, typeSliderValue, waitForFullRender } from './utils/develop';
import { decodePng, encodePng, makeTestPhoto, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;

/** The gradient test photo with grain and color blotches, like a high-ISO shot. */
function noisyPhoto(): RgbaPixels {
  const photo = makeTestPhoto(W, H);
  let seed = 99;
  const normal = () => {
    const u = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return ((seed >>> 8) + 1) / 16777218;
    };
    return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  };
  // Color noise in 3 × 3 blotches.
  const blotches = Array.from({ length: Math.ceil(W / 3) * Math.ceil(H / 3) }, (): [number, number] => [normal() * 10, normal() * 10]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const grain = normal() * 9;
      const [cr, cb] = blotches[Math.floor(y / 3) * Math.ceil(W / 3) + Math.floor(x / 3)] ?? [0, 0];
      const add = [grain + cr, grain - (cr * 0.2126 + cb * 0.0722) / 0.7152, grain + cb];
      for (let c = 0; c < 3; c++) photo.data[i + c] = Math.max(0, Math.min(255, Math.round((photo.data[i + c] ?? 0) + (add[c] ?? 0))));
    }
  }
  return photo;
}

const noisy = noisyPhoto();

/** Mean |value − mean of its 5 × 5 neighbourhood| for luminance and for R − B: local noise. */
function localNoise(img: RgbaPixels): { luma: number; color: number } {
  const lum = (i: number) => 0.2126 * (img.data[i] ?? 0) + 0.7152 * (img.data[i + 1] ?? 0) + 0.0722 * (img.data[i + 2] ?? 0);
  const chroma = (i: number) => (img.data[i] ?? 0) - (img.data[i + 2] ?? 0);
  let luma = 0;
  let color = 0;
  let n = 0;
  for (let y = 4; y < img.height - 4; y += 3) {
    for (let x = 4; x < img.width - 4; x += 3) {
      let sl = 0;
      let sc = 0;
      for (let j = -2; j <= 2; j++) {
        for (let k = -2; k <= 2; k++) {
          const i = ((y + j) * img.width + x + k) * 4;
          sl += lum(i);
          sc += chroma(i);
        }
      }
      const i = (y * img.width + x) * 4;
      luma += Math.abs(lum(i) - sl / 25);
      color += Math.abs(chroma(i) - sc / 25);
      n++;
    }
  }
  return { luma: luma / n, color: color / n };
}

async function setDetail(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

test.describe('Noise reduction (M27)', () => {
  test('Luminance smooths grain, Color removes color blotches, 0 restores the pixels; the export matches the CPU reference', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(noisy));
    await openPanel(page, 'Detail');
    const group = page.getByRole('group', { name: 'Noise reduction' });
    await expect(group.getByRole('slider', { name: 'Luminance noise reduction' })).toBeVisible();
    await expect(group.getByRole('slider', { name: 'Color noise reduction' })).toBeVisible();
    // Look at real pixels: 1:1.
    await page.getByRole('button', { name: '1:1' }).first().click();
    await waitForFullRender(page);
    const original = await canvasPixels(page);
    const before = localNoise(original);
    await page.screenshot({ path: 'test-results/screenshots/m27-before.png' });

    await setDetail(page, 'nrLuma', '80');
    const luma = localNoise(await canvasPixels(page));
    expect(luma.luma).toBeLessThan(before.luma * 0.6);

    await setDetail(page, 'nrColor', '80');
    const both = localNoise(await canvasPixels(page));
    expect(both.color).toBeLessThan(luma.color * 0.75);
    await page.screenshot({ path: 'test-results/screenshots/m27-after.png' });

    await setDetail(page, 'nrLuma', '0');
    await setDetail(page, 'nrColor', '0');
    const reset = await canvasPixels(page);
    expect(reset.data.every((v, i) => v === original.data[i])).toBe(true);

    // Export with both on (and a little sharpening, which runs after noise reduction).
    await setDetail(page, 'nrLuma', '60');
    await setDetail(page, 'nrColor', '70');
    await setDetail(page, 'sharpAmount', '40');
    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    const settings = defaultEditSettings();
    Object.assign(settings.detail, { nrLuma: 60, nrColor: 70, sharpAmount: 40 });
    const reference = renderRgba8(noisy.data, noisy, pipelineParams(settings));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`noise reduction export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
});
