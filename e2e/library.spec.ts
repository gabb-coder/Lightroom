import { expect, test } from '@playwright/test';
import { canvasPixels, slider, waitForFullRender } from './utils/develop';
import { withExif, withExifDate } from './utils/jpeg';
import { countDifferentPixels } from './utils/png';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';



test.describe('Library', () => {
  test('imports several photos with the Import button and shows them in the grid', async ({ page }) => {
    await gotoLibrary(page);
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    await importViaButton(page, testFiles(5));

    await expect(page.getByTestId('status-bar')).toContainText('5 of 5 photos');
    await expect(cells(page)).toHaveCount(5);
    await expect(cells(page).first()).toContainText('IMG_0418.png');
    // Thumbnails come from the worker and load from the catalog.
    await expect(cells(page).first().locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('button', { name: /All photographs/ })).toContainText('5');
    // The first new photo is selected and its details are shown.
    await expect(cells(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Metadata' })).toContainText('240 × 160');
    await page.screenshot({ path: 'test-results/screenshots/m4-library.png' });
  });

  test('"Previous import" shows only the latest batch', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await importViaButton(page, testFiles(2).map((f, i) => ({ ...f, name: `second-${i}.png` })), 5);
    await expect(cells(page)).toHaveCount(5);
    await page.getByRole('button', { name: /Previous import/ }).click();
    await expect(cells(page)).toHaveCount(2);
    await expect(page.getByTestId('status-bar')).toContainText('2 of 5 photos');
  });

  test('dropping files on the drop zone imports them; unsupported files are reported', async ({ page }) => {
    await gotoLibrary(page);
    const files = [...testFiles(2), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }];
    await page.evaluate(async (list) => {
      const dt = new DataTransfer();
      for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.mimeType }));
      const target = document.querySelector('[aria-label="Photo grid"]');
      if (!target) throw new Error('grid missing');
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, files.map((f) => ({ name: f.name, mimeType: f.mimeType, bytes: Array.from(f.buffer) })));
    await expect(cells(page)).toHaveCount(2);
    await expect(page.getByTestId('status-bar').getByRole('alert')).toHaveText('notes.txt is not a photo Darkroom can open (JPEG, PNG, WebP, AVIF and HEIC).');
  });

  test('reads the capture date from EXIF', async ({ page }) => {
    await gotoLibrary(page);
    const jpeg = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(60, 40);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.fillStyle = '#6a8';
      ctx.fillRect(0, 0, 60, 40);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await importViaButton(page, [{ name: 'dated.jpg', mimeType: 'image/jpeg', buffer: withExifDate(new Uint8Array(jpeg), '2021:07:04 09:15:30') }]);
    const metadata = page.getByRole('region', { name: 'Metadata' });
    await expect(metadata).toContainText('2021');
    await expect(metadata).toContainText('09:15');
  });

  test('reads camera, lens, focal length, exposure and ISO from EXIF; fills them in for older photos', async ({ page }) => {
    await gotoLibrary(page);
    const jpeg = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(60, 40);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.fillStyle = '#68a';
      ctx.fillRect(0, 0, 60, 40);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const tagged = withExif(new Uint8Array(jpeg), {
      ifd0: { 0x010f: 'Canon', 0x0110: 'Canon EOS R5' },
      exif: {
        0x829a: { rational: [1, 125] },
        0x829d: { rational: [8, 1] },
        0x8827: { short: 200 },
        0x920a: { rational: [35, 1] },
        0xa434: 'RF24-105mm F4 L IS USM',
      },
    });
    await importViaButton(page, [
      { name: 'camera.jpg', mimeType: 'image/jpeg', buffer: tagged },
      ...testFiles(1),
    ]);
    const metadata = page.getByRole('region', { name: 'Metadata' });
    const row = (k: string) => metadata.locator('dl > div', { has: page.locator('dt', { hasText: new RegExp(`^${k}$`) }) }).locator('dd');
    await cells(page).nth(0).click();
    await expect(row('Camera')).toHaveText('Canon EOS R5');
    await expect(row('Lens')).toHaveText('RF24-105mm F4 L IS USM');
    await expect(row('Focal length')).toHaveText('35 mm');
    await expect(row('Exposure')).toHaveText('1/125 s at f/8');
    await expect(row('ISO')).toHaveText('200');
    await page.screenshot({ path: 'test-results/screenshots/exif-metadata.png' });

    // A PNG has no EXIF.
    await cells(page).nth(1).click();
    await expect(row('Camera')).toHaveText('Unknown');
    await expect(row('ISO')).toHaveText('Unknown');

    // Photos imported before these fields existed get them on the next start.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('photo-editor');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const store = db.transaction('photos', 'readwrite').objectStore('photos');
      const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
      });
      for (const r of rows) {
        delete r.exif;
        store.put(r);
      }
      await new Promise((r) => (store.transaction.oncomplete = r));
      db.close();
    });
    await page.reload();
    await cells(page).nth(0).click();
    await expect(row('Camera')).toHaveText('Canon EOS R5');
    await expect(row('Exposure')).toHaveText('1/125 s at f/8');
  });

  test('the thumbnail size slider changes the grid columns', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(12));
    const firstRowCount = async () => {
      const tops = await cells(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      return tops.filter((t) => t === tops[0]).length;
    };
    const before = await firstRowCount();
    await page.getByLabel('Thumbnails').fill('320');
    await expect.poll(firstRowCount).toBeLessThan(before);
  });
});

test.describe('Develop filmstrip', () => {
  test('switches photos; double-click and arrow keys navigate', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(4));
    await cells(page).nth(2).dblclick();
    await expect(page.getByTestId('develop-view')).toBeVisible();
    await waitForFullRender(page);
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0420.png');

    const filmstrip = page.getByTestId('filmstrip');
    await expect(filmstrip).toContainText('4 photos');
    await expect(filmstrip.getByRole('button', { name: 'IMG_0420.png' })).toHaveAttribute('aria-pressed', 'true');
    await filmstrip.getByRole('button', { name: 'IMG_0418.png' }).click();
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0418.png');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0419.png');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0418.png');
    await page.screenshot({ path: 'test-results/screenshots/m4-develop-filmstrip.png' });

    // Arrow keys still adjust a focused slider instead of switching photos.
    await slider(page, 'Exposure').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0418.png');
    await expect(page.getByTestId('value-exposure')).toHaveText('+0.05');
  });

  test('each photo keeps its own edits and history', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    await page.getByRole('tab', { name: 'Develop' }).click();
    await page.getByTestId('filmstrip').getByRole('button', { name: 'IMG_0418.png' }).click();
    await waitForFullRender(page);
    await slider(page, 'Contrast').focus();
    await page.keyboard.press('End');

    await page.getByTestId('filmstrip').getByRole('button', { name: 'IMG_0419.png' }).click();
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0419.png');
    await expect(page.getByTestId('value-contrast')).toHaveText('0');
    await expect(page.getByTestId('history')).toContainText('1 step');

    await page.getByTestId('filmstrip').getByRole('button', { name: 'IMG_0418.png' }).click();
    await expect(page.getByTestId('value-contrast')).toHaveText('+100');
    await expect(page.getByTestId('history')).toContainText('2 steps');
    await expect(page.getByTestId('filmstrip').getByRole('button', { name: 'IMG_0418.png' }).getByRole('img', { name: 'Edited' })).toBeVisible();
  });
});

test.describe('Persistence', () => {
  test('a reload keeps all photos, edits, history and saved presets', async ({ page }) => {
    test.slow();
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await cells(page).nth(1).dblclick();
    await waitForFullRender(page);
    await slider(page, 'Exposure').focus();
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
    await page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' }).click();
    await slider(page, 'Shadows').focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
    await page.getByTestId('history').getByRole('button', { name: /^Treatment/ }).click(); // undo one step
    await page.getByRole('button', { name: 'Save settings as preset' }).click();
    await page.getByLabel('Preset name').fill('Persisted look');
    await page.getByLabel('Preset name').press('Enter');
    const edited = await canvasPixels(page);
    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');

    await page.reload();
    await expect(page.getByTestId('develop-view')).toBeVisible();
    await waitForFullRender(page);
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0419.png');
    await expect(page.getByTestId('value-exposure')).toHaveText('+0.45');
    await expect(page.getByTestId('value-shadows')).toHaveText('0'); // undone step is not current
    await expect(page.getByTestId('history')).toContainText('4 steps');
    await expect(page.getByTestId('history').getByRole('button', { name: /^Shadows/ })).toHaveCSS('font-style', 'italic');
    expect(countDifferentPixels(await canvasPixels(page), edited)).toBe(0);
    await expect(page.getByRole('region', { name: 'Presets' }).getByRole('button', { name: 'Persisted look' })).toBeVisible();

    await page.getByRole('tab', { name: 'Library' }).click();
    await expect(cells(page)).toHaveCount(3);
    await expect(cells(page).nth(1).getByRole('img', { name: 'Edited' })).toBeVisible();
    await expect(cells(page).nth(0).getByRole('img', { name: 'Edited' })).toHaveCount(0);
  });
});

// @perf: measured on its own after the other tests (playwright.config.ts "performance" project).
test.describe('Performance', () => {
  test('200 photos import and the grid scrolls at 60fps @perf', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoLibrary(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await (await chooser).setFiles(testFiles(200, 120, 80));
    await expect(page.getByTestId('status-bar')).toContainText('200 of 200 photos', { timeout: 120_000 });
    await expect(page.getByTestId('status-bar')).not.toContainText('Importing');

    const result = await page.getByTestId('library-grid').evaluate(async (el) => {
      el.scrollTop = 0;
      const frames: number[] = [];
      let maxCells = 0;
      await new Promise<void>((resolve) => {
        let last = performance.now();
        const step = (now: number) => {
          frames.push(now - last);
          last = now;
          maxCells = Math.max(maxCells, el.querySelectorAll('[data-testid="grid-cell"]').length);
          el.scrollTop += 60;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1 || frames.length > 600) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      frames.shift();
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        frames: frames.length,
        median: sorted[Math.floor(sorted.length / 2)] ?? 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        slow: frames.filter((f) => f > 25).length,
        maxCells,
      };
    });
    console.log(`scroll: ${JSON.stringify(result)}`);
    // Only visible rows are in the DOM.
    expect(result.maxCells).toBeLessThan(60);
    // ~60fps: median frame ≈16.7ms, at most 5% of frames late.
    expect(result.median).toBeLessThan(18);
    expect(result.slow / result.frames).toBeLessThanOrEqual(0.05);
    await page.screenshot({ path: 'test-results/screenshots/m4-library-200.png' });
  });
});
