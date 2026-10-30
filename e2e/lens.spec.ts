import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { geometryMap, sourceToOutput } from '../src/engine/geometry';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { canvasPixels, gotoDevelop, openTestPhoto, typeSliderValue, waitForFullRender } from './utils/develop';
import { savedSettings } from './utils/idb';
import { decodePng, encodePng, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;
const DOT = { x: 420, y: 90 };

/** A grid of dark lines on a light, slightly warm background, plus a dark dot to click. */
function gridPhoto(): RgbaPixels {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const line = x % 50 < 3 || y % 50 < 3;
      const dot = Math.hypot(x + 0.5 - DOT.x, y + 0.5 - DOT.y) < 6;
      const v = line || dot ? 40 : 200 + (x / W) * 30;
      data.set([v, v * 0.95, v * 0.85, 255].map(Math.round), (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

const grid = gridPhoto();

async function lens(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

const transparentCorner = (img: RgbaPixels) => img.data[3] === 0 || (img.data[0] ?? 0) < 30;

test.describe('Lens and perspective (M29)', () => {
  test('perspective, distortion, scale and fringe sliders change the photo; the export matches the CPU reference', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(grid));
    await page.getByRole('button', { name: /Crop and geometry/ }).click();
    const panel = page.getByRole('group', { name: 'Perspective' });
    await expect(panel.getByRole('slider', { name: 'Vertical perspective' })).toBeVisible();
    const original = await canvasPixels(page);

    await lens(page, 'vertical', '60');
    await expect(page.getByTestId('history').getByText('Vertical perspective')).toBeVisible();
    const keystoned = await canvasPixels(page);
    expect(keystoned.data.some((v, i) => v !== original.data[i])).toBe(true);
    await lens(page, 'distortion', '-60');
    // Pincushion correction leaves the corners empty; Scale fills them again.
    expect(transparentCorner(await canvasPixels(page))).toBe(true);
    await lens(page, 'scale', '140');
    await lens(page, 'fringeRed', '50');
    await lens(page, 'horizontal', '-20');
    await page.screenshot({ path: 'test-results/screenshots/m29-lens.png' });

    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    await expect.poll(async () => (await savedSettings(page)).geometry.horizontal).toBe(-20);
    const settings = await savedSettings(page);
    expect(settings.geometry).toMatchObject({ vertical: 60, distortion: -60, scale: 140, fringeRed: 50, horizontal: -20 });
    const reference = renderRgba8(grid.data, grid, pipelineParams(settings));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`lens export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  test('tools placed on the photo land on the right spot when perspective bends it', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(grid));
    await page.getByRole('button', { name: /Crop and geometry/ }).click();
    await lens(page, 'vertical', '70');
    await lens(page, 'distortion', '40');
    // Where the dot shows now, through the same mapping the renderer uses.
    const settings = await (async () => {
      await expect.poll(async () => (await savedSettings(page)).geometry.distortion).toBe(40);
      return savedSettings(page);
    })();
    const map = geometryMap(grid, settings.geometry);
    const shown = sourceToOutput(map, DOT.x, DOT.y);
    if (!shown) throw new Error('dot not on screen');
    // Its pixels on the canvas really are dark.
    const box = await page.getByTestId('photo-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    const pixels = await canvasPixels(page);
    const sx = Math.floor((shown[0] / W) * pixels.width);
    const sy = Math.floor((shown[1] / H) * pixels.height);
    expect(pixels.data[(sy * pixels.width + sx) * 4] ?? 255).toBeLessThan(90);

    // A spot clicked there is stored on the dot.
    await page.keyboard.press('q');
    await page.mouse.click(box.x + (shown[0] / W) * box.width, box.y + (shown[1] / H) * box.height);
    await expect(page.getByTestId('spot')).toHaveCount(1);
    await expect.poll(async () => (await savedSettings(page)).spots.length).toBe(1);
    const spot = (await savedSettings(page)).spots[0];
    expect(Math.abs((spot?.x ?? 0) * W - DOT.x)).toBeLessThan(3);
    expect(Math.abs((spot?.y ?? 0) * H - DOT.y)).toBeLessThan(3);
  });
});
