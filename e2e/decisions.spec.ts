import { expect, test } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { defaultEditSettings } from '../src/model/editSettings';
import { canvasPixels, gotoDevelop, openTestPhoto, smallPhotoPng, typeSliderValue, waitForFullRender } from './utils/develop';
import { storedEditsByName } from './utils/idb';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';
import { countDifferentPixels, encodePng, type RgbaPixels } from './utils/png';

const history = (page: import('@playwright/test').Page) => page.getByTestId('history').getByRole('button');

/** Four flat quadrants: the readout doesn't depend on exactly which pixel is under the pointer. */
function quadrants(): RgbaPixels {
  const width = 400;
  const height = 300;
  const colors = [
    [200, 60, 40],
    [40, 170, 90],
    [50, 80, 210],
    [120, 120, 120],
  ];
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = colors[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)] ?? [0, 0, 0];
      data.set([...c, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

test.describe('Preset previews, RGB readout and batch Auto tone (M32)', () => {
  test('pointing at a preset shows it without a history step; leaving restores the photo; clicking applies it', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const canvas = page.getByTestId('photo-canvas');
    const original = await canvasPixels(page);
    await expect(history(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'High contrast' }).hover();
    await expect(canvas).toHaveAttribute('data-preset', 'preview');
    await waitForFullRender(page);
    expect(countDifferentPixels(await canvasPixels(page), original)).toBeGreaterThan(1000);
    await page.screenshot({ path: 'test-results/screenshots/m32-preset-preview.png' });
    await expect(history(page)).toHaveCount(1);

    await page.mouse.move(5, 5);
    await expect(canvas).toHaveAttribute('data-preset', 'none');
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);

    await page.getByRole('button', { name: 'High contrast' }).click();
    await expect(history(page).first()).toContainText('Preset: High contrast');
  });

  test('the RGB readout shows the rendered color under the pointer, as the CPU reference renders it', async ({ page }) => {
    await gotoDevelop(page);
    const photo = quadrants();
    await openTestPhoto(page, encodePng(photo));
    await typeSliderValue(page, 'exposure', '0.6');
    await typeSliderValue(page, 'saturation', '-30');
    await waitForFullRender(page);
    const settings = defaultEditSettings();
    Object.assign(settings.basic, { exposure: 0.6, saturation: -30 });
    const reference = renderRgba8(photo.data, photo, pipelineParams(settings));
    const box = await page.getByTestId('photo-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    const readout = page.getByTestId('pixel-readout');
    for (const [fx, fy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ] as const) {
      await page.mouse.move(box.x + fx * box.width, box.y + fy * box.height);
      const i = (Math.floor(fy * photo.height) * photo.width + Math.floor(fx * photo.width)) * 4;
      const text = (await readout.textContent()) ?? '';
      const m = /R (\d+) G (\d+) B (\d+)/.exec(text);
      expect(m, text).not.toBeNull();
      [1, 2, 3].forEach((k, c) => expect(Math.abs(Number(m?.[k]) - (reference.data[i + c] ?? 0)), `${text} at ${fx},${fy}`).toBeLessThanOrEqual(2));
    }
    await page.screenshot({ path: 'test-results/screenshots/m32-readout.png' });
    await page.mouse.move(2, 2);
    await expect(readout).toHaveCount(0);
  });

  test('Auto tone in Library: every selected photo gets one "Auto tone" step', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await cells(page).nth(0).click();
    await cells(page).nth(1).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: /^Auto tone/ }).click();
    await expect(page.getByTestId('settings-message')).toHaveText('Auto tone: 2 of 2 photos changed');
    await expect
      .poll(async () => Object.values(await storedEditsByName(page)).map((e) => e.labels.at(-1)).filter(Boolean).sort())
      .toEqual(['Auto tone', 'Auto tone']);
    // Ctrl/Cmd+U does the same for the third one.
    await cells(page).nth(2).click();
    await page.keyboard.press('ControlOrMeta+u');
    await expect(page.getByTestId('settings-message')).toHaveText('Auto tone: 1 of 1 photo changed');
  });
});
