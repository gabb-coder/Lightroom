import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openTestPhoto, slider, smallPhotoPng, waitForFullRender } from './utils/develop';
import { countDifferentPixels, meanAbsDiff, type RgbaPixels } from './utils/png';
import { storedOriginalHash } from './utils/idb';

const canvas = (page: Page) => page.getByTestId('photo-canvas');
const geometryPanel = (page: Page) => page.getByRole('region', { name: 'Crop and geometry' });

async function canvasSize(page: Page) {
  return canvas(page).evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
}

/** Waits for the next full render after an action. */
async function rendered(page: Page) {
  await waitForFullRender(page);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
}

async function handleCenter(page: Page, handle: string) {
  const box = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!box) throw new Error(`no ${handle} handle`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function mirror(img: RgbaPixels): RgbaPixels {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (y * img.width + (img.width - 1 - x)) * 4);
  return { ...img, data: out };
}

test.describe('Crop and geometry', () => {
  test('crop with handles; the crop is stored, re-editable, persists and never touches the original', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // 600 × 360
    const originalHash = createHash('sha256').update(smallPhotoPng).digest('hex');
    expect(await storedOriginalHash(page)).toBe(originalHash);

    // R opens the crop tool and the geometry panel; the whole image is shown.
    await page.keyboard.press('r');
    await expect(page.getByTestId('crop-overlay')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crop and geometry' })).toHaveAttribute('aria-expanded', 'true');
    // The geometry controls are visible, not hidden behind the sticky footer.
    const done = await geometryPanel(page).getByRole('button', { name: 'Done cropping' }).boundingBox();
    const footer = await page.getByRole('button', { name: 'Reset all' }).boundingBox();
    expect((done?.y ?? 0) + (done?.height ?? 0)).toBeLessThanOrEqual((footer?.y ?? 0) - 10);
    await expect(page.getByTestId('toolbar').getByRole('button', { name: 'Crop', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/screenshots/m6-crop-tool.png' });

    // Free aspect: drag the bottom-right corner up-left.
    await page.getByLabel('Aspect').selectOption('custom');
    const frame = await page.getByTestId('crop-overlay').boundingBox();
    if (!frame) throw new Error('no overlay');
    await dragBy(page, await handleCenter(page, 'se'), -frame.width * 0.25, -frame.height * 0.5);
    await dragBy(page, await handleCenter(page, 'nw'), frame.width * 0.1, 0);
    await expect(page.getByTestId('history').getByRole('listitem').first()).toHaveText('Crop');
    // Still the whole image while cropping.
    expect(await canvasSize(page)).toEqual({ width: 600, height: 360 });

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 390, height: 180 });
    await expect(page.getByTestId('output-size')).toHaveText('Output 390 × 180');
    const cropped = await canvasPixels(page);
    await page.screenshot({ path: 'test-results/screenshots/m6-cropped.png' });

    // Re-edit: the overlay comes back exactly where the crop was.
    await page.getByTestId('toolbar').getByRole('button', { name: 'Crop', exact: true }).click();
    const box = await page.getByTestId('crop-box').boundingBox();
    const overlay = await page.getByTestId('crop-overlay').boundingBox();
    if (!box || !overlay) throw new Error('no crop box');
    expect((box.x - overlay.x) / overlay.width).toBeCloseTo(0.1, 2);
    expect(box.width / overlay.width).toBeCloseTo(0.65, 2);
    expect(box.height / overlay.height).toBeCloseTo(0.5, 2);
    // Arrow keys nudge the crop (and don't switch photos).
    await page.getByTestId('crop-box').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 390, height: 180 });
    expect(countDifferentPixels(await canvasPixels(page), cropped)).toBeGreaterThan(0);

    // The crop persists and the stored original is byte-identical.
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 390, height: 180 });
    expect(await storedOriginalHash(page)).toBe(originalHash);
  });

  test('aspect presets, straighten, rotate 90° and flip horizontal', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);

    await page.getByRole('button', { name: 'Crop and geometry' }).click();
    await page.getByLabel('Aspect').selectOption('1:1');
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 360, height: 360 });
    await page.getByLabel('Aspect').selectOption('16:9');
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 600, height: 338 });
    await page.getByLabel('Aspect').selectOption('original');
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 600, height: 360 });

    // Straighten shrinks the crop (no empty corners); double-click restores it.
    await slider(page, 'Straighten').focus();
    for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowRight');
    await rendered(page);
    await expect(page.getByTestId('value-angle')).toHaveText('+5.0°');
    const straight = await canvasSize(page);
    expect(straight.width).toBeLessThan(600);
    expect(straight.width / straight.height).toBeCloseTo(600 / 360, 1);
    const pixels = await canvasPixels(page);
    // No transparent (empty) corners: every pixel is opaque.
    expect(pixels.data.filter((_, i) => i % 4 === 3 && pixels.data[i] !== 255).length).toBe(0);
    await page.screenshot({ path: 'test-results/screenshots/m6-straighten.png' });
    await page.getByTestId('slider-angle').locator('label').dblclick();
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 600, height: 360 });

    // Rotate 90° turns the output.
    await geometryPanel(page).getByRole('button', { name: 'Rotate 90°' }).click();
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 360, height: 600 });
    await geometryPanel(page).getByRole('button', { name: 'Rotate 90°' }).click();
    await geometryPanel(page).getByRole('button', { name: 'Rotate 90°' }).click();
    await geometryPanel(page).getByRole('button', { name: 'Rotate 90°' }).click();
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 600, height: 360 });

    // Flip horizontal mirrors the photo. Screenshots are scaled to the display
    // size, and that browser resampling isn't exactly mirror-symmetric, so
    // compare averages; exactness is covered by the unit and GPU tests.
    const before = await canvasPixels(page);
    await geometryPanel(page).getByRole('button', { name: 'Flip horizontal' }).click();
    await expect(geometryPanel(page).getByRole('button', { name: 'Flip horizontal' })).toHaveAttribute('aria-pressed', 'true');
    await rendered(page);
    const flipped = await canvasPixels(page);
    const vsMirror = meanAbsDiff(flipped, mirror(before));
    const vsBefore = meanAbsDiff(flipped, before);
    expect(vsMirror).toBeLessThan(1);
    expect(vsBefore).toBeGreaterThan(10);
    await expect(page.getByRole('button', { name: 'Crop and geometry' }).getByRole('img', { name: 'Edited' })).toBeVisible();
    await expect(page.getByTestId('history').getByRole('listitem').first()).toHaveText('Flip horizontal');
  });

  test('Before shows the uncropped original; Reset all removes the crop', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = await canvasPixels(page);
    await page.getByRole('button', { name: 'Crop and geometry' }).click();
    await page.getByLabel('Aspect').selectOption('1:1');
    await rendered(page);
    await page.getByRole('button', { name: 'Before / After' }).click();
    await rendered(page);
    expect(await canvasSize(page)).toEqual({ width: 600, height: 360 });
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);
    await page.getByRole('button', { name: 'Before / After' }).click();
    await page.getByRole('button', { name: 'Reset all' }).click();
    await rendered(page);
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);
  });
});
