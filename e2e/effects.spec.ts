import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openPanel, openTestPhoto, panelHeader, smallPhotoPng, typeSliderValue, waitForFullRender } from './utils/develop';
import { countDifferentPixels, encodePng, type RgbaPixels } from './utils/png';

const W = 600;
const H = 360;

/** Vertical gray bars, 40px wide, alternating two levels: sharp edges and flat areas. */
function barsPhoto(dark: number, bright: number): Buffer {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.floor(x / 40) % 2 === 0 ? dark : bright;
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return encodePng({ width: W, height: H, data });
}

/** Mean luminance over a rectangle given in fractions of the image. */
function regionMean(img: RgbaPixels, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0 * img.height); y < Math.floor(y1 * img.height); y++) {
    for (let x = Math.floor(x0 * img.width); x < Math.floor(x1 * img.width); x++) {
      const i = (y * img.width + x) * 4;
      sum += 0.2126 * (img.data[i] ?? 0) + 0.7152 * (img.data[i + 1] ?? 0) + 0.0722 * (img.data[i + 2] ?? 0);
      n++;
    }
  }
  return sum / n;
}

/** Pixels whose red channel lies outside [lo, hi]: sharpening overshoot past the original levels. */
function countOutside(img: RgbaPixels, lo: number, hi: number): number {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] ?? 0;
    if (v < lo || v > hi) n++;
  }
  return n;
}

/** Standard deviation of the red channel, skipping a 4px border (the scaled canvas edge blends with the background). */
function stdDev(img: RgbaPixels): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 4; y < img.height - 4; y++) {
    for (let x = 4; x < img.width - 4; x++) {
      const v = img.data[(y * img.width + x) * 4] ?? 0;
      sum += v;
      sq += v * v;
      n++;
    }
  }
  return Math.sqrt(sq / n - (sum / n) ** 2);
}

async function setSlider(page: Page, id: string, value: string) {
  await typeSliderValue(page, id, value);
  await waitForFullRender(page);
}

const historyRows = (page: Page) => page.getByTestId('history');

test.describe('Detail: sharpening', () => {
  test('sharpening adds overshoot at edges, leaves flat areas, and resets to the original', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, barsPhoto(80, 170));
    const original = await canvasPixels(page);
    // The screenshot is scaled for display; allow a little resampling slack.
    const baseline = countOutside(original, 78, 172);
    await openPanel(page, 'Detail');
    await setSlider(page, 'sharpAmount', '150');
    await setSlider(page, 'sharpRadius', '2.5');
    const sharp = await canvasPixels(page);
    expect(countOutside(sharp, 78, 172)).toBeGreaterThan(baseline + 0.05 * W * H);
    // The middle of a bar (flat) is untouched.
    expect(Math.abs(regionMean(sharp, 0.025, 0.4, 0.04, 0.6) - regionMean(original, 0.025, 0.4, 0.04, 0.6))).toBeLessThan(1);
    await expect(panelHeader(page, 'Detail').getByRole('img', { name: 'Edited' })).toBeVisible();
    await expect(historyRows(page)).toContainText('Sharpening');
    await expect(historyRows(page)).toContainText('Sharpen radius');
    await page.screenshot({ path: 'test-results/screenshots/m9-sharpen.png' });

    await setSlider(page, 'sharpAmount', '0');
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);
  });
});

test.describe('Effects: vignette', () => {
  test('negative darkens and positive lightens the corners; the center is unchanged; it follows the crop', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = await canvasPixels(page);
    const corner = (img: RgbaPixels) => regionMean(img, 0, 0, 0.06, 0.06);
    const center = (img: RgbaPixels) => regionMean(img, 0.45, 0.45, 0.55, 0.55);
    await openPanel(page, 'Effects');

    await setSlider(page, 'vignette', '-100');
    const dark = await canvasPixels(page);
    expect(corner(dark)).toBeLessThan(corner(original) * 0.45);
    expect(Math.abs(center(dark) - center(original))).toBeLessThan(1);
    await page.screenshot({ path: 'test-results/screenshots/m9-vignette.png' });

    await setSlider(page, 'vignette', '100');
    const light = await canvasPixels(page);
    expect(corner(light)).toBeGreaterThan(corner(original) + 0.5 * (255 - corner(original)));
    expect(Math.abs(center(light) - center(original))).toBeLessThan(1);

    // After a 1:1 crop the vignette is drawn on the cropped frame's corners.
    await setSlider(page, 'vignette', '-100');
    await openPanel(page, 'Crop and geometry');
    await page.getByLabel('Aspect').selectOption('1:1');
    await page.keyboard.press('Escape');
    await waitForFullRender(page);
    const cropped = await canvasPixels(page);
    expect(Math.abs(cropped.width - cropped.height)).toBeLessThanOrEqual(2);
    expect(corner(cropped)).toBeLessThan(0.5 * regionMean(cropped, 0.47, 0.03, 0.53, 0.06) + 10);
    await page.screenshot({ path: 'test-results/screenshots/m9-vignette-crop.png' });
  });
});

test.describe('Effects: grain', () => {
  test('grain adds noise to flat areas, grows with Amount and Size, and is identical on every render', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, barsPhoto(128, 128));
    const original = await canvasPixels(page);
    expect(stdDev(original)).toBeLessThan(0.5);
    await openPanel(page, 'Effects');

    await setSlider(page, 'grain', '30');
    const light = await canvasPixels(page);
    await setSlider(page, 'grain', '90');
    const heavy = await canvasPixels(page);
    expect(stdDev(light)).toBeGreaterThan(2);
    expect(stdDev(heavy)).toBeGreaterThan(stdDev(light) * 2);
    await expect(panelHeader(page, 'Effects').getByRole('img', { name: 'Edited' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m9-grain.png' });

    // Seeded: changing another setting and back, or reloading, gives the same pixels.
    await setSlider(page, 'grainSize', '80');
    expect(countDifferentPixels(await canvasPixels(page), heavy)).toBeGreaterThan(0);
    await setSlider(page, 'grainSize', '25');
    expect(countDifferentPixels(await canvasPixels(page), heavy)).toBe(0);
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), heavy)).toBe(0);
  });

  test('the Warm film preset applies grain and vignette', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('button', { name: 'Warm film', exact: true }).click();
    await waitForFullRender(page);
    await expect(panelHeader(page, 'Effects').getByRole('img', { name: 'Edited' })).toBeVisible();
    await openPanel(page, 'Effects');
    await expect(page.getByTestId('value-grain')).toHaveText('30');
    await expect(page.getByTestId('value-vignette')).toHaveText('−22');
  });
});
