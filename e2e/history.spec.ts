import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openTestPhoto, slider, smallPhotoPng } from './utils/develop';
import { countDifferentPixels } from './utils/png';

/** History rows top to bottom (newest first) as "Label value" strings. */
async function historyRows(page: Page): Promise<string[]> {
  const rows = page.getByTestId('history').getByRole('listitem');
  return (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
}

async function nudge(page: Page, label: string, key: 'ArrowRight' | 'ArrowLeft', times: number) {
  await slider(page, label).focus();
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

test.describe('History', () => {
  test('lists edits newest first, merging consecutive changes to one slider', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await expect(page.getByTestId('history')).toContainText('1 step');
    expect(await historyRows(page)).toEqual(['Import']);

    await nudge(page, 'Exposure', 'ArrowRight', 7); // 7 changes, one step
    await nudge(page, 'Contrast', 'ArrowRight', 12);
    await nudge(page, 'Temp', 'ArrowRight', 6);
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();

    expect(await historyRows(page)).toEqual(['Treatment B&W', 'Temperature +6', 'Contrast +12', 'Exposure +0.35', 'Import']);
    await expect(page.getByTestId('history')).toContainText('5 steps');
    await expect(page.getByTestId('history').getByRole('button', { name: /Treatment/ })).toHaveAttribute('aria-current', 'step');
  });

  test('a whole slider drag is a single step', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const box = await slider(page, 'Shadows').boundingBox();
    if (!box) throw new Error('slider not visible');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 10 });
    await page.mouse.up();
    const rows = await historyRows(page);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^Shadows \+\d+$/);
  });

  test('undo/redo (buttons and keyboard) restore exactly the pixels of each step', async ({ page }) => {
    test.slow(); // many renders on software WebGL
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const shots = [await canvasPixels(page)];
    await nudge(page, 'Exposure', 'ArrowRight', 10);
    shots.push(await canvasPixels(page));
    await nudge(page, 'Highlights', 'ArrowLeft', 40);
    shots.push(await canvasPixels(page));
    await nudge(page, 'Vibrance', 'ArrowRight', 30);
    shots.push(await canvasPixels(page));
    const shot = (i: number) => {
      const pixels = shots[i];
      if (!pixels) throw new Error(`no shot ${i}`);
      return pixels;
    };

    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    await expect(redo).toBeDisabled();

    await undo.click();
    expect(countDifferentPixels(await canvasPixels(page), shot(2))).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(countDifferentPixels(await canvasPixels(page), shot(1))).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(countDifferentPixels(await canvasPixels(page), shot(0))).toBe(0);
    await expect(undo).toBeDisabled();
    await expect(slider(page, 'Exposure')).toHaveValue('0');

    await redo.click();
    expect(countDifferentPixels(await canvasPixels(page), shot(1))).toBe(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(countDifferentPixels(await canvasPixels(page), shot(3))).toBe(0);
    await expect(slider(page, 'Vibrance')).toHaveValue('30');
    await expect(redo).toBeDisabled();
  });

  test('clicking a step jumps to it; a new edit after undo discards the undone steps', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await nudge(page, 'Exposure', 'ArrowRight', 4);
    await nudge(page, 'Contrast', 'ArrowRight', 5);
    await nudge(page, 'Shadows', 'ArrowRight', 6);

    const history = page.getByTestId('history');
    await history.getByRole('button', { name: /^Exposure/ }).click();
    await expect(history.getByRole('button', { name: /^Exposure/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('value-contrast')).toHaveText('0');
    await expect(history.getByRole('button', { name: /^Shadows/ })).toHaveCSS('font-style', 'italic');
    await page.screenshot({ path: 'test-results/screenshots/m3-history-undone.png' });

    await nudge(page, 'Whites', 'ArrowRight', 3);
    expect(await historyRows(page)).toEqual(['Whites +3', 'Exposure +0.20', 'Import']);
  });

  test('Reset all is one step and returns the original pixels; undo brings the edits back', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = await canvasPixels(page);
    await nudge(page, 'Blacks', 'ArrowRight', 30);
    await nudge(page, 'Saturation', 'ArrowLeft', 30);
    const edited = await canvasPixels(page);

    await page.getByRole('button', { name: 'Reset all' }).click();
    expect((await historyRows(page))[0]).toBe('Reset all');
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);

    await page.keyboard.press('ControlOrMeta+z');
    expect(countDifferentPixels(await canvasPixels(page), edited)).toBe(0);
  });

  test('Ctrl/Cmd+Z inside a text field does not undo the photo', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await nudge(page, 'Exposure', 'ArrowRight', 2);
    await page.getByTestId('value-contrast').click();
    await page.getByLabel('Contrast value', { exact: true }).press('ControlOrMeta+z');
    await page.getByLabel('Contrast value', { exact: true }).press('Escape');
    await expect(page.getByTestId('value-exposure')).toHaveText('+0.10');
  });

  test('a long history scrolls inside the panel without moving the canvas or Copy/Paste', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const canvasBox = await page.getByTestId('photo-canvas').boundingBox();
    const paste = page.getByRole('button', { name: 'Paste' });
    const pasteBox = await paste.boundingBox();
    for (const label of ['Temp', 'Tint', 'Exposure', 'Contrast', 'Highlights', 'Shadows', 'Whites', 'Blacks', 'Vibrance', 'Saturation']) {
      await nudge(page, label, 'ArrowRight', 1);
      await nudge(page, 'Exposure', 'ArrowRight', 1);
    }
    // 1 + 2 per slider, minus 2 merges where Exposure follows Exposure.
    await expect(page.getByTestId('history')).toContainText('19 steps');
    expect(await page.getByTestId('photo-canvas').boundingBox()).toEqual(canvasBox);
    expect(await paste.boundingBox()).toEqual(pasteBox);
    const list = page.getByTestId('history').getByRole('list');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });

  test('History panel matches the design layout', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await nudge(page, 'Exposure', 'ArrowRight', 7);
    await nudge(page, 'Contrast', 'ArrowRight', 12);
    await nudge(page, 'Highlights', 'ArrowLeft', 38);
    await nudge(page, 'Shadows', 'ArrowRight', 24);
    await nudge(page, 'Vibrance', 'ArrowRight', 15);
    await nudge(page, 'Temp', 'ArrowRight', 6);
    await page.getByTestId('history').getByRole('button', { name: /^Vibrance/ }).click();

    const history = page.getByTestId('history');
    const header = await history.locator('div').first().boundingBox();
    expect(header?.height).toBe(34);
    const current = history.getByRole('button', { name: /^Vibrance/ });
    expect((await current.boundingBox())?.height).toBe(26);
    await expect(current).toHaveCSS('background-color', 'rgba(74, 163, 255, 0.18)');
    await expect(current).toHaveCSS('color', 'rgb(255, 255, 255)');
    const undone = history.getByRole('button', { name: /^Temperature/ });
    await expect(undone).toHaveCSS('color', 'rgb(143, 143, 143)');
    await expect(undone).toHaveCSS('font-style', 'italic');
    await expect(history.getByRole('button', { name: /^Contrast/ })).toHaveCSS('color', 'rgb(207, 207, 207)');
    await expect(history).toContainText('7 steps');

    await page.screenshot({ path: 'test-results/screenshots/m3-develop.png' });
    await page.getByTestId('left-panel').screenshot({ path: 'test-results/screenshots/m3-left-panel.png' });
  });
});
