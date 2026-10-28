import { expect, test, type Page } from '@playwright/test';
import { decodePng, encodePng, imageStats, makeTestPhoto } from './utils/png';

const PHOTO_W = 2000;
const PHOTO_H = 1200;
const photoPng = encodePng(makeTestPhoto(PHOTO_W, PHOTO_H));

async function gotoDevelop(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('develop-view')).toBeVisible();
}

async function waitForFullRender(page: Page) {
  await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'full');
}

/** Lets any pending requestAnimationFrame render run before we look. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function openTestPhoto(page: Page) {
  await page.getByTestId('file-input').setInputFiles({ name: 'test-photo.png', mimeType: 'image/png', buffer: photoPng });
  await waitForFullRender(page);
}

async function canvasStats(page: Page) {
  await settle(page);
  return imageStats(decodePng(await page.getByTestId('photo-canvas').screenshot()));
}

test.describe('Develop: open a photo', () => {
  test('file picker opens and renders the photo at full resolution', async ({ page }) => {
    await gotoDevelop(page);
    await expect(page.getByLabel('Exposure')).toBeDisabled();
    await openTestPhoto(page);

    await expect(page.getByTestId('info-strip')).toContainText('test-photo.png');
    await expect(page.getByTestId('info-strip')).toContainText(`${PHOTO_W} × ${PHOTO_H}`);
    const canvas = page.getByTestId('photo-canvas');
    await expect(canvas).toHaveJSProperty('width', PHOTO_W);
    await expect(canvas).toHaveJSProperty('height', PHOTO_H);
    await expect(page.getByLabel('Exposure')).toBeEnabled();

    const stats = await canvasStats(page);
    expect(stats.mean).toBeGreaterThan(40);
    expect(stats.meanSpread).toBeGreaterThan(40);
    await page.screenshot({ path: 'test-results/screenshots/m1-develop-photo.png' });
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

  test('rejects files that are not JPEG or PNG', async ({ page }) => {
    await gotoDevelop(page);
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await expect(page.getByRole('alert')).toHaveText('notes.txt is not a JPEG or PNG file.');
  });
});

test.describe('Develop: sliders', () => {
  test('dragging Exposure updates the canvas live on the proxy, then full resolution on release', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page);
    const before = await canvasStats(page);

    const slider = page.getByLabel('Exposure');
    const box = await slider.boundingBox();
    if (!box) throw new Error('slider not visible');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });

    // Still dragging: the proxy (long edge 1500) is on screen and already brighter.
    const canvas = page.getByTestId('photo-canvas');
    await expect(canvas).toHaveAttribute('data-render-mode', 'proxy');
    await expect(canvas).toHaveJSProperty('width', 1500);
    const during = await canvasStats(page);
    expect(during.mean).toBeGreaterThan(before.mean + 20);

    await page.mouse.up();
    await waitForFullRender(page);
    await expect(canvas).toHaveJSProperty('width', PHOTO_W);

    const value = page.locator('output[for="s-exposure"]');
    await expect(value).toHaveText(/^\+\d\.\d\d$/);
    await expect(value).toHaveCSS('color', 'rgb(242, 242, 242)');
    await expect(page.locator('output[for="s-contrast"]')).toHaveCSS('color', 'rgb(158, 158, 158)');
    await page.screenshot({ path: 'test-results/screenshots/m1-exposure-drag.png' });
  });

  type Stats = ReturnType<typeof imageStats>;
  const extremes: { label: string; atMax: (s: Stats, base: Stats) => void; atMin: (s: Stats, base: Stats) => void }[] = [
    {
      label: 'Exposure',
      atMax: (s, base) => expect(s.mean).toBeGreaterThan(base.mean + 30),
      atMin: (s, base) => expect(s.mean).toBeLessThan(base.mean - 30),
    },
    {
      label: 'Contrast',
      atMax: (s, base) => expect(s.lumaStdDev).toBeGreaterThan(base.lumaStdDev + 5),
      atMin: (s, base) => expect(s.lumaStdDev).toBeLessThan(base.lumaStdDev - 5),
    },
    {
      label: 'Saturation',
      atMax: (s, base) => expect(s.meanSpread).toBeGreaterThan(base.meanSpread + 20),
      atMin: (s) => expect(s.meanSpread).toBeLessThan(2), // grayscale
    },
  ];

  for (const { label, atMax, atMin } of extremes) {
    test(`${label} at max and min visibly changes the output`, async ({ page }) => {
      await gotoDevelop(page);
      await openTestPhoto(page);
      const base = await canvasStats(page);
      const slider = page.getByLabel(label);

      await slider.focus();
      await page.keyboard.press('End');
      await waitForFullRender(page);
      atMax(await canvasStats(page), base);

      await page.keyboard.press('Home');
      atMin(await canvasStats(page), base);
    });
  }
});
