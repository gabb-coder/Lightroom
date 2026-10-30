import { expect, test } from '@playwright/test';
import { BASIC_SLIDERS } from '../src/model/sliders';
import {
  canvasPixels,
  gotoDevelop,
  openTestPhoto,
  PHOTO_H,
  PHOTO_W,
  settle,
  slider,
  smallPhotoPng,
  waitForFullRender,
} from './utils/develop';
import { countDifferentPixels, encodePng, imageStats, makeTestPhoto, meanAbsDiff } from './utils/png';

/** smallPhotoPng's gradient with a ±16 checker of 4 px cells on top. */
const detailedSmallPhotoPng = (() => {
  const photo = makeTestPhoto(600, 360);
  for (let i = 0; i < photo.data.length; i += 4) {
    const n = i / 4;
    const sign = (Math.floor((n % 600) / 4) + Math.floor(n / 600 / 4)) % 2 ? 16 : -16;
    for (let c = 0; c < 3; c++) photo.data[i + c] = Math.max(0, Math.min(255, (photo.data[i + c] ?? 0) + sign));
  }
  return encodePng(photo);
})();

test.describe('Develop: open a photo', () => {
  test('file picker opens and renders the photo at full resolution', async ({ page }) => {
    await gotoDevelop(page);
    await expect(slider(page, 'Exposure')).toBeDisabled();
    await openTestPhoto(page);

    await expect(page.getByTestId('info-strip')).toContainText('test-photo.png');
    await expect(page.getByTestId('info-strip')).toContainText(`${PHOTO_W} × ${PHOTO_H}`);
    const canvas = page.getByTestId('photo-canvas');
    await expect(canvas).toHaveJSProperty('width', PHOTO_W);
    await expect(canvas).toHaveJSProperty('height', PHOTO_H);
    await expect(slider(page, 'Exposure')).toBeEnabled();

    const stats = imageStats(await canvasPixels(page));
    expect(stats.mean).toBeGreaterThan(40);
    expect(stats.meanSpread).toBeGreaterThan(40);
  });

  test('drag-and-drop opens a photo', async ({ page }) => {
    await gotoDevelop(page);
    await page.evaluate(async (bytes) => {
      const file = new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const stage = document.querySelector('[data-testid="canvas"]');
      if (!stage) throw new Error('stage missing');
      stage.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
    }, Array.from(encodePng(makeTestPhoto(300, 200))));
    await waitForFullRender(page);
    await expect(page.getByTestId('info-strip')).toContainText('dropped.png');
  });

  test('rejects files that are not photos it can open', async ({ page }) => {
    await gotoDevelop(page);
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await expect(page.getByRole('alert')).toHaveText('notes.txt is not a photo Darkroom can open (JPEG, PNG, WebP, AVIF and HEIC).');
  });
});

test.describe('Develop: Basic panel', () => {
  test('dragging Exposure updates the canvas live on the proxy, then full resolution on release', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page);
    const before = imageStats(await canvasPixels(page));

    const box = await slider(page, 'Exposure').boundingBox();
    if (!box) throw new Error('slider not visible');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });

    // Still dragging: the proxy (long edge 1500) is on screen and already brighter.
    const canvas = page.getByTestId('photo-canvas');
    await expect(canvas).toHaveAttribute('data-render-mode', 'proxy');
    await expect(canvas).toHaveJSProperty('width', 1500);
    expect(imageStats(await canvasPixels(page)).mean).toBeGreaterThan(before.mean + 20);

    await page.mouse.up();
    await waitForFullRender(page);
    await expect(canvas).toHaveJSProperty('width', PHOTO_W);

    const value = page.getByTestId('value-exposure');
    await expect(value).toHaveText(/^\+\d\.\d\d$/);
    await expect(value).toHaveCSS('color', 'rgb(242, 242, 242)');
    await expect(page.getByTestId('value-contrast')).toHaveCSS('color', 'rgb(158, 158, 158)');
  });

  test('every slider at min and max visibly changes the output; double-click resets to identical pixels', async ({ page }) => {
    test.slow(); // many full renders on software WebGL
    await gotoDevelop(page);
    // The gradient photo plus fine detail: Texture and Clarity (M26) have nothing to act on in a smooth gradient.
    await openTestPhoto(page, detailedSmallPhotoPng);
    const base = await canvasPixels(page);

    for (const def of Object.values(BASIC_SLIDERS)) {
      const input = slider(page, def.label);
      await input.focus();
      for (const key of ['End', 'Home'] as const) {
        await page.keyboard.press(key);
        const diff = meanAbsDiff(await canvasPixels(page), base);
        if (process.env.LOG_DIFF) console.log(`${def.label} ${key}: ${diff.toFixed(2)}`);
        expect(diff, `${def.label} ${key === 'End' ? 'max' : 'min'} changed the image by ${diff.toFixed(2)}`).toBeGreaterThan(1.5);
      }
      // Alternate the two reset targets: label, then track.
      const row = page.getByTestId(`slider-${def.id}`);
      await (def.id.length % 2 ? row.locator('label') : input).dblclick();
      await expect(page.getByTestId(`value-${def.id}`)).toHaveText(def.format === 'ev' ? '0.00' : '0');
      expect(countDifferentPixels(await canvasPixels(page), base), `${def.label} reset`).toBe(0);
    }
  });

  test('B&W treatment renders grayscale and Color restores the original pixels', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const base = await canvasPixels(page);
    const treatment = page.getByRole('group', { name: 'Treatment' });

    await treatment.getByRole('button', { name: 'B&W' }).click();
    await expect(treatment.getByRole('button', { name: 'B&W' })).toHaveAttribute('aria-pressed', 'true');
    expect(imageStats(await canvasPixels(page)).meanSpread).toBeLessThan(2);

    await treatment.getByRole('button', { name: 'Color' }).click();
    expect(countDifferentPixels(await canvasPixels(page), base)).toBe(0);
  });

  test('resetting every slider returns pixel-identical output to the original render', async ({ page }) => {
    test.slow(); // many full renders on software WebGL
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const base = await canvasPixels(page);
    const basicHeader = page.getByRole('button', { name: 'Basic' });
    await expect(basicHeader.getByRole('img', { name: 'Edited' })).toHaveCount(0);

    // Edit everything at once.
    const defs = Object.values(BASIC_SLIDERS);
    for (const [i, def] of defs.entries()) {
      await slider(page, def.label).focus();
      for (let n = 0; n < 7 + i; n++) await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowLeft');
    }
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    expect(meanAbsDiff(await canvasPixels(page), base)).toBeGreaterThan(5);
    await expect(basicHeader.getByRole('img', { name: 'Edited' })).toBeVisible();

    // Reset each one.
    for (const def of defs) await page.getByTestId(`slider-${def.id}`).locator('label').dblclick();
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'Color' }).click();

    expect(countDifferentPixels(await canvasPixels(page), base)).toBe(0);
    await expect(basicHeader.getByRole('img', { name: 'Edited' })).toHaveCount(0);
  });

  test('dragging a label scrubs the value using the proxy', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page);
    const label = page.getByTestId('slider-contrast').locator('label');
    const box = await label.boundingBox();
    if (!box) throw new Error('label not visible');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 5 });
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'proxy');
    await expect(page.getByTestId('value-contrast')).toHaveText('+40');
    await page.mouse.move(x - 30, y, { steps: 5 });
    await expect(page.getByTestId('value-contrast')).toHaveText('−30');
    await page.mouse.up();
    await waitForFullRender(page);
  });

  test('clicking a value lets you type an exact number', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);

    await page.getByTestId('value-exposure').click();
    const field = page.getByLabel('Exposure value', { exact: true });
    await expect(field).toBeFocused();
    await field.fill('1.5');
    await field.press('Enter');
    await expect(page.getByTestId('value-exposure')).toHaveText('+1.50');
    await expect(slider(page, 'Exposure')).toHaveValue('1.5');

    // Escape cancels.
    await page.getByTestId('value-exposure').click();
    await page.getByLabel('Exposure value', { exact: true }).fill('-3');
    await page.getByLabel('Exposure value', { exact: true }).press('Escape');
    await expect(page.getByTestId('value-exposure')).toHaveText('+1.50');

    // True minus sign, clamping, and invalid text.
    await page.getByTestId('value-contrast').click();
    await page.getByLabel('Contrast value', { exact: true }).fill('−250');
    await page.getByLabel('Contrast value', { exact: true }).press('Enter');
    await expect(page.getByTestId('value-contrast')).toHaveText('−100');
    await page.getByTestId('value-contrast').click();
    await page.getByLabel('Contrast value', { exact: true }).fill('abc');
    await page.getByLabel('Contrast value', { exact: true }).press('Enter');
    await expect(page.getByTestId('value-contrast')).toHaveText('−100');

    // Typing in the field must not trigger shortcuts (D = Develop, G = Library).
    await page.getByTestId('value-contrast').click();
    await page.getByLabel('Contrast value', { exact: true }).press('g');
    await expect(page.getByTestId('develop-view')).toBeVisible();
  });
});

test.describe('Develop: Before / After', () => {
  test('button and backslash tap toggle the original; holding backslash peeks', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    const original = await canvasPixels(page);
    await slider(page, 'Exposure').focus();
    await page.keyboard.press('End');
    const edited = await canvasPixels(page);
    const canvas = page.getByTestId('photo-canvas');
    const button = page.getByRole('button', { name: 'Before / After' });

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-view', 'before');
    await expect(page.getByText('Before', { exact: true })).toBeVisible();
    expect(countDifferentPixels(await canvasPixels(page), original)).toBe(0);
    await page.screenshot({ path: 'test-results/screenshots/m2-before.png' });

    await button.click();
    await expect(canvas).toHaveAttribute('data-view', 'after');
    expect(countDifferentPixels(await canvasPixels(page), edited)).toBe(0);

    // Tap: toggles.
    await page.keyboard.press('\\');
    await expect(canvas).toHaveAttribute('data-view', 'before');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('\\');
    await expect(canvas).toHaveAttribute('data-view', 'after');

    // Hold: peek while held, back to the edit on release.
    await page.keyboard.down('\\');
    await expect(canvas).toHaveAttribute('data-view', 'before');
    await page.waitForTimeout(400);
    await page.keyboard.up('\\');
    await expect(canvas).toHaveAttribute('data-view', 'after');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Develop: histogram', () => {
  test('shows the rendered image and follows edits, B&W and Before', async ({ page }) => {
    await gotoDevelop(page);
    const channel = (c: string) => page.getByTestId('histogram').locator(`path[data-channel="${c}"]`);
    await expect(channel('r')).toHaveCount(0);

    await openTestPhoto(page, smallPhotoPng);
    await expect(channel('r')).toHaveCount(1);
    await settle(page);
    const originalRed = await channel('r').getAttribute('d');

    await slider(page, 'Exposure').focus();
    await page.keyboard.press('End');
    await settle(page);
    const brightRed = await channel('r').getAttribute('d');
    expect(brightRed).not.toBe(originalRed);

    await page.getByRole('button', { name: 'Before / After' }).click();
    await settle(page);
    expect(await channel('r').getAttribute('d')).toBe(originalRed);
    await page.getByRole('button', { name: 'Before / After' }).click();

    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    await settle(page);
    const [r, g, b] = await Promise.all(['r', 'g', 'b'].map((c) => channel(c).getAttribute('d')));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

test('M2 screenshot: edited photo with the full Basic panel', async ({ page }) => {
  // ~120 full renders of a 2000 × 1200 photo on software WebGL: about 50 s alone, up to twice that with the suite in parallel.
  test.setTimeout(180_000);
  await gotoDevelop(page);
  await openTestPhoto(page);
  const set = async (label: string, presses: number, key: 'ArrowRight' | 'ArrowLeft') => {
    await slider(page, label).focus();
    for (let i = 0; i < presses; i++) await page.keyboard.press(key);
  };
  await set('Temp', 12, 'ArrowRight');
  await set('Exposure', 7, 'ArrowRight');
  await set('Contrast', 15, 'ArrowRight');
  await set('Highlights', 40, 'ArrowLeft');
  await set('Shadows', 25, 'ArrowRight');
  await set('Vibrance', 20, 'ArrowRight');
  await settle(page);
  await page.screenshot({ path: 'test-results/screenshots/m2-develop.png' });
});
