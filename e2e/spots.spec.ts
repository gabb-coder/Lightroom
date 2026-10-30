import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { applyAffine, geometryMatrix, invertAffine } from '../src/engine/geometry';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import type { Geometry } from '../src/model/editSettings';
import { canvasPixels, gotoDevelop, openTestPhoto, typeSliderValue, waitForFullRender } from './utils/develop';
import { savedSettings } from './utils/idb';
import { decodePng, encodePng, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;
const BLEMISH = { x: 200, y: 150, r: 9 };

/** A rippled, warm background with one dark blemish. */
function blemishedPhoto(): RgbaPixels {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ripple = 14 * Math.sin(x / 3.1) * Math.cos(y / 4.3);
      const base = 150 + 50 * (x / W) + ripple;
      const inBlemish = Math.hypot(x + 0.5 - BLEMISH.x, y + 0.5 - BLEMISH.y) < BLEMISH.r;
      data.set(inBlemish ? [45, 30, 25, 255] : [base, base * 0.85, base * 0.7, 255].map(Math.round), (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

const photo = blemishedPhoto();

/** Mean red inside a disc (photo px scaled to the image given) minus the mean in the ring around it. */
function blemishContrast(img: RgbaPixels, cx = BLEMISH.x, cy = BLEMISH.y): number {
  const s = img.width / W;
  let inside = 0;
  let ni = 0;
  let ring = 0;
  let nr = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const d = Math.hypot((x + 0.5) / s - cx, (y + 0.5) / s - cy);
      const v = img.data[(y * img.width + x) * 4] ?? 0;
      if (d < BLEMISH.r * 0.7) {
        inside += v;
        ni++;
      } else if (d > BLEMISH.r * 1.6 && d < BLEMISH.r * 2.6) {
        ring += v;
        nr++;
      }
    }
  }
  return Math.abs(inside / ni - ring / nr);
}

/** Clicks the photo at a photo pixel (fitted view, no crop). */
async function clickPhoto(page: Page, x: number, y: number) {
  const box = await page.getByTestId('photo-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + (x / W) * box.width, box.y + (y / H) * box.height);
}

const history = (page: Page) => page.getByTestId('history');

test.describe('Spot removal (M28)', () => {
  test('Q opens the tool, a click heals the blemish; undo, move the source, delete, Esc', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(photo));
    expect(blemishContrast(await canvasPixels(page))).toBeGreaterThan(60);

    await page.keyboard.press('q');
    await expect(page.getByTestId('spot-overlay')).toBeVisible();
    // Big enough to cover the 9 px blemish with its feathered edge (about 14 px here).
    await typeSliderValue(page, 'spot-size', '55');
    await expect(page.getByRole('group', { name: 'Spot mode' }).getByRole('button', { name: 'Heal' })).toHaveAttribute('aria-pressed', 'true');
    await clickPhoto(page, BLEMISH.x, BLEMISH.y);
    await expect(page.getByTestId('spot')).toHaveCount(1);
    await expect(history(page).getByText('Heal spot')).toBeVisible();
    await waitForFullRender(page);
    expect(blemishContrast(await canvasPixels(page))).toBeLessThan(15);
    // The source (dashed) sits away from the spot.
    await expect(page.getByTestId('spot-source')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m28-healed.png' });

    // Undo brings the blemish back; redo heals it again.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('spot')).toHaveCount(0);
    expect(blemishContrast(await canvasPixels(page))).toBeGreaterThan(60);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.getByTestId('spot')).toHaveCount(1);

    // Drag the source somewhere else: one history step.
    await page.getByTestId('spot').click();
    const src = await page.getByTestId('spot-source').boundingBox();
    if (!src) throw new Error('no source circle');
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + src.width / 2 + 40, src.y + src.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    await expect(history(page).getByText('Move spot source')).toHaveCount(1);
    await waitForFullRender(page);
    expect(blemishContrast(await canvasPixels(page))).toBeLessThan(15);

    // Clone copies the source as it is.
    await page.getByRole('group', { name: 'Spot mode' }).getByRole('button', { name: 'Clone' }).click();
    await expect(history(page).getByText('Clone spot')).toBeVisible();

    // Delete removes it; Esc deselects, then closes the tool.
    await page.getByTestId('spot').focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('spot')).toHaveCount(0);
    expect(blemishContrast(await canvasPixels(page))).toBeGreaterThan(60);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('spot')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('spot-overlay')).toHaveCount(0);
  });

  test('spots stay on the blemish after a rotation, and the export matches the CPU reference', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, encodePng(photo));
    await page.getByRole('button', { name: /Spot removal/ }).click();
    await typeSliderValue(page, 'spot-size', '55');
    await clickPhoto(page, BLEMISH.x, BLEMISH.y);
    await expect(page.getByTestId('spot')).toHaveCount(1);
    await page.getByRole('button', { name: /Crop and geometry/ }).click();
    await page.getByRole('button', { name: 'Rotate 90°' }).click();
    await page.keyboard.press('Escape');
    await waitForFullRender(page);

    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'PNG, lossless' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const exported = decodePng(await readFile(await (await download).path()));
    expect([exported.width, exported.height]).toEqual([H, W]);

    await expect.poll(async () => (await savedSettings(page)).spots.length).toBe(1);
    const settings = await savedSettings(page);
    expect(settings.geometry.rotation).toBe(1);
    const reference = renderRgba8(photo.data, photo, pipelineParams(settings));
    let maxDiff = 0;
    for (let i = 0; i < reference.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs((exported.data[i] ?? 0) - (reference.data[i] ?? 0)));
    console.log(`spot removal export vs CPU reference: max diff ${maxDiff}/255`);
    expect(maxDiff).toBeLessThanOrEqual(2);
    // Back in the photo's own layout (through the same geometry matrix), the blemish is gone.
    expect(blemishContrast({ width: W, height: H, data: unrotate(exported, settings.geometry) })).toBeLessThan(15);
  });
});

/** The exported image laid back out as the W × H photo, through the geometry's output → source matrix. */
function unrotate(img: RgbaPixels, geometry: Geometry): Uint8Array {
  const toOutput = invertAffine(geometryMatrix(photo, geometry, img));
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [ox, oy] = applyAffine(toOutput, x + 0.5, y + 0.5);
      const i = (Math.floor(oy) * img.width + Math.floor(ox)) * 4;
      out.set(img.data.slice(i, i + 4), (y * W + x) * 4);
    }
  }
  return out;
}
