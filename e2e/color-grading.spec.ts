import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openPanel, openTestPhoto, panelHeader, smallPhotoPng, typeSliderValue, waitForFullRender } from './utils/develop';
import { countDifferentPixels, type RgbaPixels } from './utils/png';

const wheel = (page: Page) => page.getByTestId('color-wheel');
const history = (page: Page) => page.getByTestId('history');

/** Mean R − B over a band of rows (fractions of the height): positive = warm. */
function warmth(img: RgbaPixels, from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(from * img.height); y < Math.floor(to * img.height); y++) {
    for (let x = 4; x < img.width - 4; x++) {
      const i = (y * img.width + x) * 4;
      sum += (img.data[i] ?? 0) - (img.data[i + 2] ?? 0);
      n++;
    }
  }
  return sum / n;
}

test.describe('Color grading', () => {
  test('dragging the shadows wheel tints the shadows; one history step; persists', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng); // bright at the top, dark at the bottom
    const original = await canvasPixels(page);
    await openPanel(page, 'Color grading');
    await expect(page.getByRole('group', { name: 'Color grading range' }).getByRole('button')).toHaveText(['Shadows', 'Midtones', 'Highlights', 'Global']);

    // Drag from the center to the right rim: red at full saturation.
    await wheel(page).scrollIntoViewIfNeeded();
    const box = await wheel(page).boundingBox();
    if (!box) throw new Error('no wheel');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await waitForFullRender(page);
    await expect(page.getByTestId('value-grade-shadows-hue')).toHaveText('0°');
    await expect(page.getByTestId('value-grade-shadows-sat')).toHaveText('99');
    await expect(history(page).getByRole('button').first()).toContainText('Shadows color');
    await expect(history(page)).toContainText('2 steps');
    await expect(panelHeader(page, 'Color grading').getByRole('img', { name: 'Edited' })).toBeVisible();

    const graded = await canvasPixels(page);
    const darkShift = warmth(graded, 0.85, 1) - warmth(original, 0.85, 1);
    const brightShift = warmth(graded, 0, 0.15) - warmth(original, 0, 0.15);
    expect(darkShift).toBeGreaterThan(15);
    expect(brightShift).toBeLessThan(darkShift / 3);
    await page.getByRole('button', { name: 'Basic', exact: true }).click(); // collapse, so the whole panel shows
    await page.screenshot({ path: 'test-results/screenshots/m14-color-grading.png' });

    // Keyboard on the wheel: ArrowDown lowers saturation.
    await wheel(page).focus();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.getByTestId('value-grade-shadows-sat')).toHaveText('89');

    // Exact values through the sliders, then a reload keeps everything.
    await typeSliderValue(page, 'grade-shadows-hue', '220');
    await page.getByRole('group', { name: 'Color grading range' }).getByRole('button', { name: 'Highlights' }).click();
    await typeSliderValue(page, 'grade-highlights-hue', '40');
    await typeSliderValue(page, 'grade-highlights-sat', '60');
    await typeSliderValue(page, 'grade-balance', '-30');
    await waitForFullRender(page);
    const before = await canvasPixels(page);
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), before)).toBe(0);
    await openPanel(page, 'Color grading');
    await expect(page.getByTestId('value-grade-shadows-hue')).toHaveText('220°');
    await expect(page.getByTestId('value-grade-balance')).toHaveText('−30');
  });

  test('split-toning a B&W photo adds color; double-click on the wheel resets it', async ({ page }) => {
    test.slow();
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    await waitForFullRender(page);
    const mono = await canvasPixels(page);
    expect(Math.abs(warmth(mono, 0, 1))).toBeLessThan(1);
    await openPanel(page, 'Color grading');
    await typeSliderValue(page, 'grade-shadows-hue', '220');
    await typeSliderValue(page, 'grade-shadows-sat', '70');
    await waitForFullRender(page);
    expect(warmth(await canvasPixels(page), 0.8, 1)).toBeLessThan(-8); // blue shadows

    await wheel(page).dblclick();
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), mono)).toBe(0);
  });
});
