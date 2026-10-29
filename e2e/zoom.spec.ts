import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openTestPhoto, photoPng, waitForFullRender } from './utils/develop';
import { countDifferentPixels, encodePng, type RgbaPixels } from './utils/png';

const stage = (page: Page) => page.getByTestId('photo-stage');
const canvas = (page: Page) => page.getByTestId('photo-canvas');
const navRect = (page: Page) => page.getByTestId('navigator-rect');
const zoomButton = (page: Page, label: string) => page.getByRole('group', { name: 'Zoom' }).getByRole('button', { name: label, exact: true });

/** Every pixel different from its neighbours, so any resampling would show. */
function patternPhoto(width: number, height: number): RgbaPixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([(x * 37 + y * 11) % 256, (x * 5) % 256, (y * 7 + x) % 256, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

/** Navigator rectangle as fractions of the navigator image. */
async function navFractions(page: Page) {
  const img = await page.getByTestId('navigator-image').boundingBox();
  const r = await navRect(page).boundingBox();
  if (!img || !r) throw new Error('no navigator');
  return { x: (r.x - img.x) / img.width, y: (r.y - img.y) / img.height, w: r.width / img.width, h: r.height / img.height };
}

test.describe('Zoom and Navigator', () => {
  test('1:1 shows one photo pixel per screen pixel', async ({ page }) => {
    await gotoDevelop(page);
    const photo = patternPhoto(400, 300);
    await openTestPhoto(page, encodePng(photo));
    // Fit scales the photo up to fill the stage.
    expect((await canvas(page).boundingBox())?.width).toBeGreaterThan(400);
    await page.keyboard.press('z');
    await expect(stage(page)).toHaveAttribute('data-zoom', '1:1');
    await waitForFullRender(page);
    const box = await canvas(page).boundingBox();
    expect({ w: box?.width, h: box?.height }).toEqual({ w: 400, h: 300 });
    expect(countDifferentPixels(await canvasPixels(page), photo)).toBe(0);
    // Z again goes back.
    await page.keyboard.press('z');
    await expect(stage(page)).toHaveAttribute('data-zoom', 'fit');
  });

  test('pan by dragging and from the Navigator; Fill covers the stage; click zooms at a point', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, photoPng); // 2000 × 1200
    await expect(page.getByTestId('navigator-image')).toBeVisible();
    await expect(navRect(page)).toHaveCount(0); // Fit: nothing hidden

    await zoomButton(page, '1:1').click();
    await expect(zoomButton(page, '1:1')).toHaveAttribute('aria-pressed', 'true');
    await waitForFullRender(page);
    const stageBox = await stage(page).boundingBox();
    if (!stageBox) throw new Error('no stage');
    const start = await navFractions(page);
    expect(start.w).toBeCloseTo(stageBox.width / 2000, 2);
    expect(start.x + start.w / 2).toBeCloseTo(0.5, 2); // centered
    await page.screenshot({ path: 'test-results/screenshots/m16-zoom-1to1.png' });

    // Drag the photo 300 px to the left: the view moves 300 photo pixels right.
    const cx = stageBox.x + stageBox.width / 2;
    const cy = stageBox.y + stageBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 150, cy, { steps: 3 });
    await page.mouse.move(cx - 300, cy, { steps: 3 });
    await page.mouse.up();
    await expect(stage(page)).toHaveAttribute('data-zoom', '1:1'); // a drag is not a click
    const dragged = await navFractions(page);
    expect(dragged.x - start.x).toBeCloseTo(300 / 2000, 2);

    // Click in the Navigator: the view centers there (clamped at the edge).
    const nav = await page.getByTestId('navigator-image').boundingBox();
    if (!nav) throw new Error('no navigator image');
    await page.mouse.click(nav.x + nav.width * 0.05, nav.y + nav.height * 0.9);
    const corner = await navFractions(page);
    expect(corner.x).toBeCloseTo(0, 2);
    expect(corner.y + corner.h).toBeCloseTo(1, 2);

    // Fill: the photo covers the stage.
    await zoomButton(page, 'Fill').click();
    await waitForFullRender(page);
    const filled = await canvas(page).boundingBox();
    expect(filled?.width).toBeGreaterThanOrEqual(stageBox.width - 1);
    expect(filled?.height).toBeGreaterThanOrEqual(stageBox.height - 1);
    // Z goes to 1:1 and back to Fill.
    await page.keyboard.press('z');
    await expect(stage(page)).toHaveAttribute('data-zoom', '1:1');
    await page.keyboard.press('z');
    await expect(stage(page)).toHaveAttribute('data-zoom', 'fill');

    // From Fit, clicking the photo zooms to 1:1 centered on the click.
    await zoomButton(page, 'Fit').click();
    const fitBox = await canvas(page).boundingBox();
    if (!fitBox) throw new Error('no canvas');
    await page.mouse.click(fitBox.x + fitBox.width * 0.25, fitBox.y + fitBox.height * 0.3);
    await expect(stage(page)).toHaveAttribute('data-zoom', '1:1');
    const clicked = await navFractions(page);
    expect(clicked.x + clicked.w / 2).toBeCloseTo(0.25, 2);
    expect(clicked.y + clicked.h / 2).toBeCloseTo(0.3, 2);
    await page.screenshot({ path: 'test-results/screenshots/m16-zoom-navigator.png' });
  });

  test('the crop tool shows the whole photo whatever the zoom', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, photoPng);
    await zoomButton(page, '1:1').click();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    await expect(stage(page)).toHaveAttribute('data-zoom', 'fit');
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveAttribute('data-zoom', '1:1');
  });
});
