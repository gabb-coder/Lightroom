import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { canvasPixels, gotoDevelop, openPanel, openTestPhoto, panelHeader, smallPhotoPng, typeSliderValue, waitForFullRender } from './utils/develop';
import { savedSettings } from './utils/idb';
import { decodePng, makeTestPhoto, type RgbaPixels } from './utils/png';

const history = (page: Page) => page.getByTestId('history');
const canvas = (page: Page) => page.getByTestId('photo-canvas');

/** Mean brightness over a box given in fractions of the image. */
function mean(img: RgbaPixels, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0 * img.height); y < Math.floor(y1 * img.height); y++) {
    for (let x = Math.floor(x0 * img.width); x < Math.floor(x1 * img.width); x++) {
      const i = (y * img.width + x) * 4;
      sum += ((img.data[i] ?? 0) + (img.data[i + 1] ?? 0) + (img.data[i + 2] ?? 0)) / 3;
      n++;
    }
  }
  return sum / n;
}

/** Drags on the canvas between two points given in fractions of its box. */
async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + ((from[0] + to[0]) / 2) * box.width, box.y + ((from[1] + to[1]) / 2) * box.height, { steps: 3 });
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 3 });
  await page.mouse.up();
}

async function setup(page: Page) {
  await gotoDevelop(page);
  await openTestPhoto(page, smallPhotoPng); // hue across x, bright at the top, dark at the bottom
  await openPanel(page, 'Masks');
}

test.describe('Gradient masks', () => {
  test('a linear gradient dragged on the canvas changes only its side; one step each; undo', async ({ page }) => {
    test.slow();
    await setup(page);
    const original = await canvasPixels(page);
    await page.getByRole('button', { name: 'Linear gradient' }).click();
    await expect(page.getByTestId('mask-overlay')).toHaveAttribute('data-tool', 'linear');
    // Full effect above 10%, none below 40% of the height. −1.5 EV ≈ 0.62× in sRGB terms.
    await dragOnCanvas(page, [0.5, 0.1], [0.5, 0.4]);
    await expect(page.getByTestId('mask-overlay')).toHaveAttribute('data-tool', 'none');
    await typeSliderValue(page, 'mask-exposure', '-1.5');
    await waitForFullRender(page);
    const masked = await canvasPixels(page);

    expect(mean(masked, 0.05, 0.02, 0.95, 0.08)).toBeLessThan(mean(original, 0.05, 0.02, 0.95, 0.08) * 0.7);
    expect(Math.abs(mean(masked, 0.05, 0.5, 0.95, 0.95) - mean(original, 0.05, 0.5, 0.95, 0.95))).toBeLessThan(0.5);
    await expect(history(page).getByRole('button')).toHaveText([/^Mask exposure/, /^New linear gradient/, /^Import/]);
    await expect(panelHeader(page, 'Masks').getByRole('img', { name: 'Edited' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Masks' }).getByRole('button', { name: 'Linear gradient 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/screenshots/m15-linear.png' });

    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+z');
    await waitForFullRender(page);
    await expect(page.getByRole('list', { name: 'Masks' })).toHaveCount(0);
  });

  test('radial gradient: shortcut, click to place, handles, invert, keyboard, delete', async ({ page }) => {
    test.slow();
    await setup(page);
    const original = await canvasPixels(page);
    await canvas(page).click(); // focus away from inputs
    await page.keyboard.press('Shift+M');
    await expect(page.getByTestId('mask-overlay')).toHaveAttribute('data-tool', 'radial');
    await dragOnCanvas(page, [0.5, 0.5], [0.5, 0.5]); // a click: default size (20% of the short side)
    await typeSliderValue(page, 'mask-exposure', '1');
    await waitForFullRender(page);
    const inside = await canvasPixels(page);
    expect(mean(inside, 0.47, 0.47, 0.53, 0.53)).toBeGreaterThan(mean(original, 0.47, 0.47, 0.53, 0.53) + 20);
    expect(Math.abs(mean(inside, 0, 0, 0.15, 0.15) - mean(original, 0, 0, 0.15, 0.15))).toBeLessThan(0.5);

    // Drag the right handle outward: a wider ellipse reaches further right.
    const handle = page.locator('[data-handle="x+"]');
    const hb = await handle.boundingBox();
    if (!hb) throw new Error('no handle');
    const right = (img: RgbaPixels) => mean(img, 0.7, 0.48, 0.72, 0.52);
    expect(Math.abs(right(inside) - right(original))).toBeLessThan(0.5);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 200, hb.y + hb.height / 2, { steps: 5 });
    await page.mouse.up();
    await waitForFullRender(page);
    expect(right(await canvasPixels(page))).toBeGreaterThan(right(original) + 5);
    await page.screenshot({ path: 'test-results/screenshots/m15-radial.png' });

    // Invert: the outside changes, the center doesn't.
    await page.getByLabel('Invert (adjust outside)').check();
    await waitForFullRender(page);
    const inverted = await canvasPixels(page);
    expect(Math.abs(mean(inverted, 0.47, 0.47, 0.53, 0.53) - mean(original, 0.47, 0.47, 0.53, 0.53))).toBeLessThan(0.5);
    expect(mean(inverted, 0, 0, 0.1, 0.1)).toBeGreaterThan(mean(original, 0, 0, 0.1, 0.1) + 15);

    // Keyboard: the pin moves with arrow keys and Delete removes the mask.
    const pin = page.getByTestId('mask-pin');
    await pin.focus();
    const before = await pin.boundingBox();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => (await pin.boundingBox())?.x).toBeLessThan((before?.x ?? 0) - 10);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('mask-pin')).toHaveCount(0);
    await expect(history(page).getByRole('button').first()).toContainText('Delete mask');
  });

  test('masks stay on the same part of the photo when it is rotated, and persist', async ({ page }) => {
    test.slow();
    await setup(page);
    await page.getByRole('button', { name: 'Linear gradient' }).click();
    await dragOnCanvas(page, [0.5, 0.05], [0.5, 0.3]);
    await typeSliderValue(page, 'mask-exposure', '-2');
    await waitForFullRender(page);
    const upright = await canvasPixels(page);
    await openPanel(page, 'Crop and geometry');
    const rotate = page.getByTestId('right-panel').getByRole('button', { name: 'Rotate 90°' });
    await rotate.click();
    await rotate.click();
    await waitForFullRender(page);
    // Upside down now: the darkened top of the photo is at the bottom of the screen, unchanged.
    const turned = await canvasPixels(page);
    expect(Math.abs(mean(turned, 0.05, 0.9, 0.95, 0.98) - mean(upright, 0.05, 0.02, 0.95, 0.1))).toBeLessThan(1);
    expect(Math.abs(mean(turned, 0.05, 0.02, 0.95, 0.1) - mean(upright, 0.05, 0.9, 0.95, 0.98))).toBeLessThan(1);

    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await waitForFullRender(page);
    await expect(panelHeader(page, 'Masks').getByRole('img', { name: 'Edited' })).toBeVisible();
    const settings = await savedSettings(page);
    expect(settings.masks).toHaveLength(1);
    expect(settings.masks[0]).toMatchObject({ kind: 'linear', adjust: { exposure: -2 } });

    // Export (PNG, full size) matches the CPU reference, masks included.
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await (await download).path();
    const exported = decodePng(await readFile(file));
    const reference = renderRgba8(makeTestPhoto(600, 360).data, { width: 600, height: 360 }, pipelineParams(settings));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((reference.data[i] ?? 0) - (exported.data[i] ?? 0)));
    console.log(`masked export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
});
