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

/** Paints a stroke through the given points (fractions of the canvas box); `alt` erases. */
async function paint(page: Page, points: [number, number][], alt = false) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  const [sx, sy] = at(points[0] ?? [0, 0]);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    const [x, y] = at(p);
    await page.mouse.move(x, y, { steps: 8 });
  }
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

/** Largest per-channel difference inside a box (fractions of the image). */
function maxDiffIn(a: RgbaPixels, b: RgbaPixels, x0: number, y0: number, x1: number, y1: number): number {
  let max = 0;
  for (let y = Math.floor(y0 * a.height); y < Math.floor(y1 * a.height); y++) {
    for (let x = Math.floor(x0 * a.width); x < Math.floor(x1 * a.width); x++) {
      const i = (y * a.width + x) * 4;
      for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0)));
    }
  }
  return max;
}

test.describe('Brush masks (M21)', () => {
  test('painting changes only painted areas; each stroke is one undoable step; Alt erases', async ({ page }) => {
    test.slow();
    await setup(page);
    const original = await canvasPixels(page);
    await page.keyboard.press('k');
    await expect(page.getByRole('button', { name: 'Brush', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Brush options' })).toBeVisible();

    // A horizontal stroke across the middle (brush size 25 = radius 5% of the long edge).
    await paint(page, [
      [0.15, 0.5],
      [0.85, 0.5],
    ]);
    await expect(history(page).getByRole('button', { name: /^Brush/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('list', { name: 'Masks' }).getByRole('button', { name: 'Brush 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await typeSliderValue(page, 'mask-exposure', '2');
    await waitForFullRender(page);
    const oneStroke = await canvasPixels(page);
    // Far from the stroke nothing changed at all; along it, the photo is brighter.
    expect(maxDiffIn(oneStroke, original, 0, 0, 1, 0.3)).toBe(0);
    expect(maxDiffIn(oneStroke, original, 0, 0.7, 1, 1)).toBe(0);
    expect(mean(oneStroke, 0.3, 0.47, 0.7, 0.53)).toBeGreaterThan(mean(original, 0.3, 0.47, 0.7, 0.53) + 20);
    await page.screenshot({ path: 'test-results/screenshots/m21-brush-stroke.png' });

    // A second, vertical stroke is its own history step.
    await paint(page, [
      [0.5, 0.1],
      [0.5, 0.35],
    ]);
    await waitForFullRender(page);
    const twoStrokes = await canvasPixels(page);
    expect(mean(twoStrokes, 0.47, 0.12, 0.53, 0.3)).toBeGreaterThan(mean(oneStroke, 0.47, 0.12, 0.53, 0.3) + 20);
    await page.keyboard.press('Escape'); // stop painting before undo
    await page.keyboard.press('ControlOrMeta+z');
    await waitForFullRender(page);
    expect(maxDiffIn(await canvasPixels(page), oneStroke, 0, 0, 1, 1)).toBe(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await waitForFullRender(page);

    // Alt-drag erases part of the first stroke.
    await page.keyboard.press('k');
    await paint(
      page,
      [
        [0.65, 0.5],
        [0.9, 0.5],
      ],
      true,
    );
    await expect(history(page).getByRole('button', { name: /^Erase/ })).toHaveAttribute('aria-current', 'step');
    await waitForFullRender(page);
    const erased = await canvasPixels(page);
    // Fully erased along the eraser's core (its feathered rim leaves a little of the soft paint).
    expect(maxDiffIn(erased, original, 0.75, 0.49, 0.82, 0.51)).toBeLessThanOrEqual(1);
    expect(mean(erased, 0.3, 0.47, 0.55, 0.53)).toBeGreaterThan(mean(original, 0.3, 0.47, 0.55, 0.53) + 20);
    await page.screenshot({ path: 'test-results/screenshots/m21-brush-erased.png' });

    // Export runs the same rasterization: matches the CPU reference.
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    const settings = await savedSettings(page);
    expect(settings.masks[0]).toMatchObject({ kind: 'brush', adjust: { exposure: 2 } });
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    const reference = renderRgba8(makeTestPhoto(600, 360).data, { width: 600, height: 360 }, pipelineParams(settings));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((reference.data[i] ?? 0) - (exported.data[i] ?? 0)));
    console.log(`brush mask export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  test('the overlay shows the selected mask in red, on screen only (O)', async ({ page }) => {
    test.slow();
    await setup(page);
    await page.getByRole('button', { name: 'Brush', exact: true }).click();
    await paint(page, [
      [0.2, 0.5],
      [0.8, 0.5],
    ]);
    await waitForFullRender(page);
    const plain = await canvasPixels(page); // a neutral mask: nothing changes yet
    await page.keyboard.press('Escape');
    await page.keyboard.press('o');
    await expect(page.getByRole('checkbox', { name: 'Show overlay' })).toBeChecked();
    await waitForFullRender(page);
    const shown = await canvasPixels(page);
    expect(maxDiffIn(shown, plain, 0, 0, 1, 0.3)).toBe(0);
    // Redder along the stroke.
    const redShare = (img: RgbaPixels) => {
      let r = 0;
      let gb = 0;
      for (let y = Math.floor(0.47 * img.height); y < Math.floor(0.53 * img.height); y++) {
        for (let x = Math.floor(0.3 * img.width); x < Math.floor(0.7 * img.width); x++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i] ?? 0;
          gb += ((img.data[i + 1] ?? 0) + (img.data[i + 2] ?? 0)) / 2;
        }
      }
      return r / Math.max(1, gb);
    };
    expect(redShare(shown)).toBeGreaterThan(redShare(plain) * 1.3);
    await page.screenshot({ path: 'test-results/screenshots/m21-mask-overlay.png' });
    await page.keyboard.press('o');
    await waitForFullRender(page);
    expect(maxDiffIn(await canvasPixels(page), plain, 0, 0, 1, 1)).toBe(0);
  });

  test('a radial gradient rotates with its handle and the Angle slider', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('Shift+M');
    await dragOnCanvas(page, [0.5, 0.5], [0.7, 0.5]);
    const handle = page.locator('[data-handle="rotate"]');
    await expect(handle).toBeVisible();
    await expect(page.getByTestId('value-mask-angle')).toHaveText('0.0°');
    // Drag the handle (above the center) to the right of the center: a quarter turn clockwise.
    const box = await canvas(page).boundingBox();
    const knob = await handle.boundingBox();
    if (!box || !knob) throw new Error('no layout');
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('value-mask-angle')).toHaveText(/^\+(89|90|91)\.0°$/);
    await expect(history(page).getByRole('button', { name: /Rotate mask/ })).toHaveAttribute('aria-current', 'step');
    await page.screenshot({ path: 'test-results/screenshots/m21-radial-rotated.png' });
    // The slider sets it exactly; the handle follows.
    await typeSliderValue(page, 'mask-angle', '-45');
    const knob2 = await handle.boundingBox();
    if (!knob2) throw new Error('no handle');
    expect(knob2.x + knob2.width / 2).toBeLessThan(box.x + box.width * 0.5); // up and to the left now
  });
});
