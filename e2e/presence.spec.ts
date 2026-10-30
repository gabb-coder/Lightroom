import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { defaultEditSettings } from '../src/model/editSettings';
import { canvasPixels, gotoDevelop, openTestPhoto, typeSliderValue, waitForFullRender } from './utils/develop';
import { decodePng, encodePng, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;

/**
 * A hazy landscape: pale sky, two ridges fading into the haze, a textured
 * foreground meadow. Deterministic, so the CPU reference can render it too.
 */
function hazyLandscape(): RgbaPixels {
  const data = new Uint8Array(W * H * 4);
  let seed = 4242;
  const random = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return ((seed >>> 16) & 0xff) / 255 - 0.5;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const far = 0.42 + 0.06 * Math.sin(u * 7 + 1);
      const near = 0.6 + 0.08 * Math.sin(u * 4.3) + 0.03 * Math.sin(u * 23);
      let rgb: [number, number, number];
      if (v < far) rgb = [150 + 40 * v, 175 + 30 * v, 205];
      else if (v < near) rgb = [120, 135, 150];
      else {
        const grass = 18 * Math.sin(x / 2.3) * Math.cos(y / 1.7) + 26 * random();
        rgb = [70 + grass, 105 + grass + 30 * (1 - v), 55 + grass * 0.5];
      }
      // A light veil over everything: the haze to remove.
      const veil = 0.35;
      data.set([...rgb.map((c) => Math.round(Math.max(0, Math.min(255, c * (1 - veil) + 225 * veil)))), 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

const landscape = hazyLandscape();

/** Mean |pixel − mean of its 7 × 7 neighbourhood| on the red channel, inside a 6 px border: local contrast. */
function localContrast(img: RgbaPixels): number {
  let total = 0;
  let n = 0;
  for (let y = 6; y < img.height - 6; y += 3) {
    for (let x = 6; x < img.width - 6; x += 3) {
      let sum = 0;
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) sum += img.data[((y + j) * img.width + x + i) * 4] ?? 0;
      total += Math.abs((img.data[(y * img.width + x) * 4] ?? 0) - sum / 49);
      n++;
    }
  }
  return total / n;
}

function meanMinChannel(img: RgbaPixels): number {
  let sum = 0;
  for (let i = 0; i < img.data.length; i += 4) sum += Math.min(img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0);
  return sum / (img.data.length / 4);
}

function samePixels(a: RgbaPixels, b: RgbaPixels): boolean {
  return a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
}

async function setBasic(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

test.describe('Presence: Texture, Clarity, Dehaze (M26)', () => {
  test('each slider changes the photo the right way; back to 0 is pixel-exact', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(landscape));
    const presence = page.getByRole('group', { name: 'Presence' });
    for (const label of ['Texture', 'Clarity', 'Dehaze', 'Vibrance', 'Saturation']) await expect(presence.getByText(label, { exact: true })).toBeVisible();
    const original = await canvasPixels(page);
    await page.screenshot({ path: 'test-results/screenshots/m26-before.png' });

    await setBasic(page, 'texture', '100');
    const textured = await canvasPixels(page);
    expect(localContrast(textured)).toBeGreaterThan(localContrast(original) * 1.1);
    await setBasic(page, 'texture', '-100');
    expect(localContrast(await canvasPixels(page))).toBeLessThan(localContrast(original) * 0.9);
    await setBasic(page, 'texture', '0');
    expect(samePixels(await canvasPixels(page), original)).toBe(true);

    await setBasic(page, 'clarity', '100');
    expect(localContrast(await canvasPixels(page))).toBeGreaterThan(localContrast(original));
    await setBasic(page, 'clarity', '0');

    await setBasic(page, 'dehaze', '80');
    const clear = await canvasPixels(page);
    expect(meanMinChannel(clear)).toBeLessThan(meanMinChannel(original) - 20);
    await page.screenshot({ path: 'test-results/screenshots/m26-dehaze.png' });
    await setBasic(page, 'dehaze', '-60');
    expect(meanMinChannel(await canvasPixels(page))).toBeGreaterThan(meanMinChannel(original) + 10);
    await setBasic(page, 'dehaze', '0');
    expect(samePixels(await canvasPixels(page), original)).toBe(true);

    // Each change is one history step, named after the slider.
    await expect(page.getByTestId('history').getByText('Dehaze', { exact: false }).first()).toBeVisible();
  });

  test('an export with all three matches the CPU reference', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(landscape));
    await setBasic(page, 'texture', '40');
    await setBasic(page, 'clarity', '60');
    await setBasic(page, 'dehaze', '50');
    await page.screenshot({ path: 'test-results/screenshots/m26-all.png' });
    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));

    const settings = defaultEditSettings();
    Object.assign(settings.basic, { texture: 40, clarity: 60, dehaze: 50 });
    const reference = renderRgba8(landscape.data, landscape, pipelineParams(settings));
    expect([exported.width, exported.height]).toEqual([W, H]);
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`presence export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
});
