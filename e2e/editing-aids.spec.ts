import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, typeSliderValue, waitForFullRender } from './utils/develop';
import { encodePng, imageStats, makeTestPhoto, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;
const history = (page: Page) => page.getByTestId('history');

async function openPhoto(page: Page, photo: RgbaPixels, name = 'aids.png') {
  await gotoDevelop(page);
  await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'image/png', buffer: encodePng(photo) });
  await waitForFullRender(page);
}

/** The test photo with its left third a warm gray card (a color cast to remove). */
function photoWithGrayCard(): RgbaPixels {
  const photo = makeTestPhoto(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W / 3; x++) photo.data.set([196, 172, 150], (y * W + x) * 4);
  }
  return photo;
}

/** RGB of the pixel at fractional position (fx, fy) of an image. */
function at(img: RgbaPixels, fx: number, fy: number): number[] {
  const i = (Math.floor(fy * img.height) * img.width + Math.floor(fx * img.width)) * 4;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
}

function count(img: RgbaPixels, rgb: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2]) n++;
  return n;
}

const spread = (c: number[]) => Math.max(...c) - Math.min(...c);

test.describe('White balance eyedropper', () => {
  test('clicking a gray card makes it neutral in one undoable step', async ({ page }) => {
    await openPhoto(page, photoWithGrayCard());
    expect(spread(at(await canvasPixels(page), 1 / 6, 0.5))).toBeGreaterThan(30);

    const picker = page.getByRole('button', { name: 'White balance picker' });
    await picker.click();
    await expect(picker).toHaveAttribute('aria-pressed', 'true');
    const canvas = page.getByTestId('photo-canvas');
    await expect(canvas).toHaveCSS('cursor', 'crosshair');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await page.screenshot({ path: 'test-results/screenshots/m20-eyedropper-active.png' });
    await page.mouse.click(box.x + box.width / 6, box.y + box.height / 2);

    await expect(picker).toHaveAttribute('aria-pressed', 'false');
    await expect(history(page).getByRole('button', { name: /White balance/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('value-temp')).not.toHaveText('0');
    await waitForFullRender(page);
    const card = at(await canvasPixels(page), 1 / 6, 0.5);
    console.log('gray card after eyedropper', card);
    expect(spread(card)).toBeLessThanOrEqual(3);
    await page.screenshot({ path: 'test-results/screenshots/m20-eyedropper-done.png' });

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('value-temp')).toHaveText('0');
    await expect(page.getByTestId('value-tint')).toHaveText('0');
  });

  test('W toggles the picker and Escape cancels it', async ({ page }) => {
    await openPhoto(page, photoWithGrayCard());
    const picker = page.getByRole('button', { name: 'White balance picker' });
    await page.keyboard.press('w');
    await expect(picker).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(picker).toHaveAttribute('aria-pressed', 'false');
    await expect(history(page)).toContainText('1 step');
  });
});

test.describe('Auto tone', () => {
  test('brightens a dark photo in one undoable step (button and Ctrl/Cmd+U)', async ({ page }) => {
    const dark = makeTestPhoto(W, H);
    for (let i = 0; i < dark.data.length; i += 4) for (let c = 0; c < 3; c++) dark.data[i + c] = Math.round((dark.data[i + c] ?? 0) * 0.3);
    await openPhoto(page, dark, 'dark.png');
    const before = imageStats(await canvasPixels(page)).mean;

    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await expect(history(page).getByRole('button', { name: /Auto tone/ })).toHaveAttribute('aria-current', 'step');
    await expect(history(page)).toContainText('2 steps');
    await waitForFullRender(page);
    const exposure = Number((await page.getByTestId('value-exposure').textContent())?.replace('+', ''));
    expect(exposure).toBeGreaterThan(0.5);
    const after = imageStats(await canvasPixels(page)).mean;
    console.log(`auto tone: mean ${before.toFixed(1)} → ${after.toFixed(1)}, exposure ${exposure}`);
    expect(after).toBeGreaterThan(before + 30);
    await page.screenshot({ path: 'test-results/screenshots/m20-auto-tone.png' });

    // Running it again on the same photo changes nothing (no new history step).
    await page.keyboard.press('ControlOrMeta+u');
    await expect(history(page)).toContainText('2 steps');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('value-exposure')).toHaveText('0.00');
  });
});

test.describe('Clipping warnings', () => {
  test('paint blown highlights red and crushed shadows blue, on screen only', async ({ page }) => {
    await openPhoto(page, makeTestPhoto(W, H));
    const histogram = () => page.getByTestId('histogram').locator('path[data-channel="r"]').getAttribute('d');
    const highlights = page.getByRole('button', { name: 'Show highlight clipping' });
    const shadows = page.getByRole('button', { name: 'Show shadow clipping' });
    await expect(highlights).toHaveAttribute('data-clipping', 'no');

    await typeSliderValue(page, 'exposure', '4');
    await waitForFullRender(page);
    await expect(highlights).toHaveAttribute('data-clipping', 'yes'); // the triangle lights up
    const plain = await canvasPixels(page);
    const histogramBefore = await histogram();
    await highlights.click();
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-clipping', 'highlights');
    const warned = await canvasPixels(page);
    const red = count(warned, [255, 40, 40]);
    expect(red).toBeGreaterThan(1000);
    expect(red).toBe(count(plain, [255, 255, 255])); // exactly the pure white pixels
    expect(await histogram()).toBe(histogramBefore); // the histogram is of the photo, not the overlay
    await page.screenshot({ path: 'test-results/screenshots/m20-clipping-highlights.png' });

    await typeSliderValue(page, 'exposure', '-3');
    await typeSliderValue(page, 'blacks', '-100');
    await waitForFullRender(page);
    await shadows.click();
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-clipping', 'shadows highlights');
    const blue = count(await canvasPixels(page), [30, 110, 255]);
    expect(blue).toBeGreaterThan(1000);
    await page.screenshot({ path: 'test-results/screenshots/m20-clipping-shadows.png' });

    // J turns both off.
    await page.keyboard.press('j');
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-clipping', 'off');
    expect(count(await canvasPixels(page), [30, 110, 255])).toBe(0);
  });
});

test.describe('Split Before / After', () => {
  test('shows the original left of a draggable divider', async ({ page }) => {
    await openPhoto(page, makeTestPhoto(W, H));
    await typeSliderValue(page, 'exposure', '1.5');
    await typeSliderValue(page, 'temp', '60');
    await waitForFullRender(page);
    const after = await canvasPixels(page);
    await page.keyboard.press('\\');
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-view', 'before');
    const before = await canvasPixels(page);
    await page.keyboard.press('\\');

    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-view', 'split');
    let split = await canvasPixels(page);
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= 2);
    expect(near(at(split, 0.25, 0.5), at(before, 0.25, 0.5))).toBe(true);
    expect(near(at(split, 0.75, 0.5), at(after, 0.75, 0.5))).toBe(true);
    await expect(page.getByTestId('split-before-badge')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m20-split.png' });

    // Drag the divider to a quarter of the width.
    const divider = page.getByTestId('split-divider');
    const box = await page.getByTestId('photo-canvas').boundingBox();
    const handle = await divider.boundingBox();
    if (!box || !handle) throw new Error('no layout');
    await page.mouse.move(handle.x + handle.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(divider).toHaveAttribute('aria-valuenow', '25');
    split = await canvasPixels(page);
    expect(near(at(split, 0.375, 0.5), at(after, 0.375, 0.5))).toBe(true);
    expect(near(at(split, 0.125, 0.5), at(before, 0.125, 0.5))).toBe(true);
    await expect(page.getByTestId('photo-stage')).toHaveAttribute('data-zoom', 'fit'); // the drag didn't zoom

    // The arrow keys move a focused divider; Y turns the split off.
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '27');
    await page.keyboard.press('y');
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-view', 'after');
    expect(near(at(await canvasPixels(page), 0.125, 0.5), at(after, 0.125, 0.5))).toBe(true);
  });
});
