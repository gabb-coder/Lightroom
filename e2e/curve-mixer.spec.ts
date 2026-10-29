import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openTestPhoto, slider, smallPhotoPng, waitForFullRender } from './utils/develop';
import { countDifferentPixels, imageStats, type RgbaPixels } from './utils/png';

const curve = (page: Page) => page.getByTestId('tone-curve');
const points = (page: Page) => page.getByTestId('curve-point');

/** A panel's header button (its accessible name gains "Edited" once edited). */
const panelHeader = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true }).getByRole('button').first();

async function openPanel(page: Page, title: string) {
  const header = panelHeader(page, title);
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}

/** Mean of a channel, and mean channel spread, over a vertical band of the image (fractions of width). */
function band(img: RgbaPixels, from: number, to: number) {
  let r = 0;
  let b = 0;
  let spread = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = Math.floor(from * img.width); x < Math.floor(to * img.width); x++) {
      const i = (y * img.width + x) * 4;
      const pr = img.data[i] ?? 0;
      const pg = img.data[i + 1] ?? 0;
      const pb = img.data[i + 2] ?? 0;
      r += pr;
      b += pb;
      spread += Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
      n++;
    }
  }
  return { r: r / n, b: b / n, spread: spread / n };
}

/** Pixel position of curve coordinates (0..1, y up) on screen. */
async function curvePos(page: Page, x: number, y: number) {
  const box = await curve(page).boundingBox();
  if (!box) throw new Error('no curve');
  return { x: box.x + x * box.width, y: box.y + (1 - y) * box.height };
}

test.describe('Tone curve', () => {
  test('click adds a point, drag reshapes the curve, double-click deletes it', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = await canvasPixels(page);
    await openPanel(page, 'Tone curve');
    await expect(points(page)).toHaveCount(2);

    // Click on the middle of the curve and drag the new point up.
    const start = await curvePos(page, 0.5, 0.5);
    const end = await curvePos(page, 0.5, 0.75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
    await waitForFullRender(page);
    await expect(points(page)).toHaveCount(3);
    await expect(points(page).nth(1)).toHaveAttribute('aria-label', /input 50, output (7[4-6])/);
    expect(imageStats(await canvasPixels(page)).mean).toBeGreaterThan(imageStats(original).mean + 15);
    // Adding and dragging the point is one history step.
    await expect(page.getByTestId('history')).toContainText('2 steps');
    await expect(panelHeader(page, 'Tone curve').getByRole('img', { name: 'Edited' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m8-curve.png' });

    // Double-click deletes it: the curve is identity again, so the pixels are the original's.
    await points(page).nth(1).dblclick();
    await expect(points(page)).toHaveCount(2);
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);
  });

  test('per-channel curves, keyboard editing, and curves persist across a reload', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = band(await canvasPixels(page), 0, 1);
    await openPanel(page, 'Tone curve');

    await page.getByRole('group', { name: 'Curve channel' }).getByRole('button', { name: 'R', exact: true }).click();
    const at = await curvePos(page, 0.5, 0.5);
    await page.mouse.click(at.x, at.y);
    await expect(points(page)).toHaveCount(3);
    await points(page).nth(1).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
    await waitForFullRender(page);
    await expect(points(page).nth(1)).toHaveAttribute('aria-label', 'Curve point 2: input 50, output 70');
    const red = band(await canvasPixels(page), 0, 1);
    expect(red.r).toBeGreaterThan(original.r + 10);
    expect(Math.abs(red.b - original.b)).toBeLessThan(1);
    // Arrow keys on a curve point don't switch photos or move anything else.
    await expect(page.getByTestId('info-strip')).toContainText('test-photo.png');

    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    const before = await canvasPixels(page);
    await page.reload();
    await waitForFullRender(page);
    await openPanel(page, 'Tone curve');
    await page.getByRole('group', { name: 'Curve channel' }).getByRole('button', { name: 'R', exact: true }).click();
    await expect(points(page)).toHaveCount(3);
    await expect(points(page).nth(1)).toHaveAttribute('aria-label', 'Curve point 2: input 50, output 70');
    expect(countDifferentPixels(await canvasPixels(page), before)).toBe(0);

    // Delete key removes the focused point.
    await points(page).nth(1).focus();
    await page.keyboard.press('Delete');
    await expect(points(page)).toHaveCount(2);
  });
});

test.describe('Color mixer', () => {
  test('a color range changes its own hues and leaves other hues alone', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await openPanel(page, 'Color mixer');
    const original = await canvasPixels(page);
    // The test photo sweeps hue left to right: red at the left edge, blue at 2/3.
    const redBand = [0, 0.03] as const;
    const blueBand = [0.64, 0.69] as const;

    await page.getByRole('group', { name: 'Color mixer property' }).getByRole('button', { name: 'Saturation' }).click();
    await slider(page, 'Red').focus();
    await page.keyboard.press('Home'); // -100
    await waitForFullRender(page);
    const edited = await canvasPixels(page);
    expect(band(edited, ...redBand).spread).toBeLessThan(band(original, ...redBand).spread * 0.4);
    const blueBefore = band(original, ...blueBand);
    const blueAfter = band(edited, ...blueBand);
    expect(Math.abs(blueAfter.spread - blueBefore.spread)).toBeLessThan(0.5);
    expect(Math.abs(blueAfter.b - blueBefore.b)).toBeLessThan(0.5);
    await expect(page.getByTestId('history').getByRole('listitem').first()).toHaveText('Red saturation−100');
    await expect(panelHeader(page, 'Color mixer').getByRole('img', { name: 'Edited' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m8-mixer.png' });

    // Luminance tab, blue darker: the red band (already gray) is unaffected.
    await page.getByRole('group', { name: 'Color mixer property' }).getByRole('button', { name: 'Luminance' }).click();
    await slider(page, 'Blue').focus();
    await page.keyboard.press('Home');
    await waitForFullRender(page);
    const darker = await canvasPixels(page);
    expect(band(darker, ...blueBand).b).toBeLessThan(blueAfter.b - 10);
    expect(Math.abs(band(darker, ...redBand).r - band(edited, ...redBand).r)).toBeLessThan(0.5);
  });
});
