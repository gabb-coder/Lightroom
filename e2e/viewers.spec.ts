import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoDevelop, openTestPhoto, smallPhotoPng, typeSliderValue, waitForFullRender } from './utils/develop';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';
import { decodePng } from './utils/png';

const viewer = (page: Page) => page.getByTestId('photo-viewer');

/** Mean of all channels of an element's screenshot. */
async function meanOf(el: Locator): Promise<number> {
  const img = decodePng(await el.screenshot());
  let sum = 0;
  for (let i = 0; i < img.data.length; i += 4) sum += (img.data[i] ?? 0) + (img.data[i + 1] ?? 0) + (img.data[i + 2] ?? 0);
  return sum / ((img.data.length / 4) * 3);
}

async function loaded(img: Locator) {
  await expect(img).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

test.describe('Full screen, slideshow and compare (M31)', () => {
  test('F shows the focused photo full screen; arrows step; Esc closes. The slideshow plays, pauses and ends', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3, 480, 320));
    await cells(page).first().click();
    await page.keyboard.press('f');
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page)).toHaveAttribute('aria-label', 'Full screen');
    await expect(page.getByTestId('viewer-position')).toHaveText('1 / 3');
    await loaded(page.getByTestId('viewer-image'));
    await page.screenshot({ path: 'test-results/screenshots/m31-fullscreen.png' });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('viewer-position')).toHaveText('2 / 3');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('viewer-position')).toHaveText('3 / 3'); // wraps around
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Slideshow' }).click();
    await expect(viewer(page)).toHaveAttribute('aria-label', 'Slideshow');
    await viewer(page).getByLabel('Seconds per photo').selectOption('2');
    await expect(page.getByTestId('viewer-position')).toHaveText('1 / 3');
    await expect(page.getByTestId('viewer-position')).toHaveText('2 / 3', { timeout: 6000 });
    await viewer(page).focus();
    await page.keyboard.press(' ');
    await expect(viewer(page).getByRole('button', { name: 'Play' })).toBeVisible();
    await page.waitForTimeout(2600);
    await expect(page.getByTestId('viewer-position')).toHaveText('2 / 3');
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
  });

  test('C compares two photos; 1:1 and panning are linked; arrows change the candidate; Swap', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3, 900, 600));
    // Select the second, then add the first (focused: it becomes the select).
    await cells(page).nth(1).click();
    await cells(page).nth(0).click({ modifiers: ['ControlOrMeta'] });
    await page.keyboard.press('c');
    const compare = page.getByTestId('compare-view');
    await expect(compare).toBeVisible();
    const panes = page.getByTestId('compare-pane');
    await expect(panes).toHaveCount(2);
    await expect(panes.nth(0)).toContainText('Select: IMG_0418.png');
    await expect(panes.nth(1)).toContainText('Candidate: IMG_0419.png');
    const images = page.getByTestId('compare-image');
    await loaded(images.nth(0));
    await loaded(images.nth(1));

    // 1:1: one photo pixel per device pixel, full-size renders, both panes together.
    await page.keyboard.press('z');
    await expect(compare).toHaveAttribute('data-zoom', '1:1');
    await expect(images.nth(0)).toHaveAttribute('data-sharp', 'true', { timeout: 30_000 });
    await expect(images.nth(1)).toHaveAttribute('data-sharp', 'true', { timeout: 30_000 });
    await expect.poll(() => images.nth(0).evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([900, 600]);
    const before = [await images.nth(0).boundingBox(), await images.nth(1).boundingBox()];
    const pane = await panes.nth(0).boundingBox();
    if (!pane || !before[0] || !before[1]) throw new Error('no layout');
    expect(before[0].width).toBeCloseTo(900, 0);
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.mouse.down();
    await page.mouse.move(pane.x + pane.width / 2 + 60, pane.y + pane.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const after = [await images.nth(0).boundingBox(), await images.nth(1).boundingBox()];
    if (!after[0] || !after[1]) throw new Error('no layout');
    const moved = (i: 0 | 1) => (after[i]?.x ?? 0) - (before[i]?.x ?? 0);
    expect(moved(0)).toBeGreaterThan(10);
    expect(moved(1)).toBeCloseTo(moved(0), 0);
    await page.screenshot({ path: 'test-results/screenshots/m31-compare.png' });

    await page.keyboard.press('ArrowRight');
    await expect(panes.nth(1)).toContainText('Candidate: IMG_0420.png');
    await compare.getByRole('button', { name: 'Swap' }).click();
    await expect(panes.nth(0)).toContainText('Select: IMG_0420.png');
    await expect(panes.nth(1)).toContainText('Candidate: IMG_0418.png');
    await page.keyboard.press('Escape');
    await expect(compare).toHaveCount(0);
  });

  test('full screen in Develop shows the edits, including ones not saved yet', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('button', { name: 'Full screen' }).click();
    const image = page.getByTestId('viewer-image');
    await loaded(image);
    const plain = await meanOf(image);
    await page.keyboard.press('Escape');
    await typeSliderValue(page, 'exposure', '1.5');
    await waitForFullRender(page);
    await page.keyboard.press('f');
    await loaded(image);
    await expect.poll(() => meanOf(image)).toBeGreaterThan(plain + 25);
  });
});
