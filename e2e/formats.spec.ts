import { expect, test, type Page } from '@playwright/test';
import { pipelineParams, renderRgba8 } from '../src/engine/pipeline';
import { defaultEditSettings } from '../src/model/editSettings';
import { canvasPixels, gotoDevelop, typeSliderValue, waitForFullRender } from './utils/develop';
import { cells, gotoLibrary, importViaButton, testFiles } from './utils/library';
import { decodePng, makeTestPhoto, meanAbsDiff } from './utils/png';

const dialog = (page: Page) => page.getByRole('dialog');

/**
 * Replaces the File System Access folder picker with an in-memory folder
 * called "Pictures" (headless Chromium can't show the real one). Files are
 * kept in `window.__folder` by path; `window.__cancelPicker` makes the next
 * pick a cancel.
 */
async function mockFolderPicker(page: Page, seed: Record<string, string>) {
  await page.addInitScript((initial) => {
    type Dir = { name: string; getFileHandle: unknown; getDirectoryHandle: unknown };
    const files = new Map<string, Blob>(Object.entries(initial).map(([k, v]) => [k, new Blob([v])]));
    const w = window as unknown as { __folder: Map<string, Blob>; __cancelPicker: boolean; showDirectoryPicker: () => Promise<Dir> };
    w.__folder = files;
    w.__cancelPicker = false;
    const dir = (prefix: string, name: string): Dir => ({
      name,
      getFileHandle: async (file: string, options?: { create?: boolean }) => {
        const path = prefix + file;
        if (!files.has(path) && !options?.create) throw new DOMException('missing', 'NotFoundError');
        return {
          createWritable: async () => {
            const parts: Blob[] = [];
            return { write: async (b: Blob) => void parts.push(b), close: async () => void files.set(path, new Blob(parts)) };
          },
        };
      },
      getDirectoryHandle: async (sub: string) => dir(`${prefix}${sub}/`, sub),
    });
    w.showDirectoryPicker = async () => {
      if (w.__cancelPicker) {
        w.__cancelPicker = false;
        throw new DOMException('cancelled', 'AbortError');
      }
      return dir('', 'Pictures');
    };
  }, seed);
}

async function folderContents(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(async () => {
    const files = (window as unknown as { __folder: Map<string, Blob> }).__folder;
    const out: Record<string, number[]> = {};
    for (const [path, blob] of files) out[path] = Array.from(new Uint8Array(await blob.arrayBuffer()));
    return out;
  });
}

test.describe('Export destinations', () => {
  test('exports into a chosen folder and subfolder without replacing existing files', async ({ page }) => {
    test.slow();
    await mockFolderPicker(page, { 'Exports/IMG_0418.png': 'already here' });
    const files = testFiles(2);
    await gotoLibrary(page);
    await importViaButton(page, files);
    await cells(page).nth(1).click();
    await cells(page).nth(0).click({ modifiers: ['Shift'] });
    await page.getByRole('tab', { name: 'Export' }).click();
    await dialog(page).getByRole('button', { name: 'PNG, lossless' }).click();
    await page.getByLabel('Export to').selectOption('folder');
    await expect(page.getByTestId('export-destination')).toHaveText('You’ll be asked for a folder when you export.');
    await expect(page.getByLabel('Subfolder name')).toHaveValue('Exports');

    // Cancelling the picker exports nothing and keeps the dialog open.
    await page.evaluate(() => ((window as unknown as { __cancelPicker: boolean }).__cancelPicker = true));
    await dialog(page).getByRole('button', { name: 'Export 2 photos' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId('export-toast')).toHaveCount(0);

    await dialog(page).getByRole('button', { name: 'Choose…' }).click();
    await expect(page.getByTestId('export-destination')).toContainText('Saving into “Pictures”');
    await page.screenshot({ path: 'test-results/screenshots/m19-export-folder.png' });
    await dialog(page).getByRole('button', { name: 'Export 2 photos' }).click();
    await expect(page.getByTestId('export-toast')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(page.getByTestId('export-toast')).toContainText('Saved to Pictures/Exports');

    const contents = await folderContents(page);
    expect(Object.keys(contents).sort()).toEqual(['Exports/IMG_0418-2.png', 'Exports/IMG_0418.png', 'Exports/IMG_0419.png']);
    expect(Buffer.from(contents['Exports/IMG_0418.png'] ?? []).toString()).toBe('already here');
    for (const [i, path] of ['Exports/IMG_0418-2.png', 'Exports/IMG_0419.png'].entries()) {
      const exported = decodePng(Buffer.from(contents[path] ?? []));
      const source = decodePng(files[i]?.buffer ?? Buffer.alloc(0));
      const reference = renderRgba8(source.data, source, pipelineParams(defaultEditSettings()));
      let maxDiff = 0;
      for (let k = 0; k < reference.data.length; k++) maxDiff = Math.max(maxDiff, Math.abs((reference.data[k] ?? 0) - (exported.data[k] ?? 0)));
      expect(maxDiff, path).toBeLessThanOrEqual(2);
    }

    // Without a subfolder, files go straight into the picked folder.
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByLabel('Put in subfolder').uncheck();
    await expect(page.getByLabel('Subfolder name')).toBeDisabled();
    await dialog(page).getByRole('button', { name: 'Export 2 photos' }).click();
    await expect
      .poll(async () => Object.keys(await folderContents(page)).filter((p) => !p.includes('/')).sort(), { timeout: 60_000 })
      .toEqual(['IMG_0418.png', 'IMG_0419.png']);
  });

  test('applying an export preset keeps where files go', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(1));
    await page.getByRole('tab', { name: 'Export' }).click();
    await page.getByLabel('Export to').selectOption('downloads');
    await dialog(page).getByRole('button', { name: 'Social square, 1080 px' }).click();
    await expect(page.getByLabel('Export to')).toHaveValue('downloads');
    await expect(dialog(page).getByRole('button', { name: 'Social square, 1080 px' })).toHaveAttribute('aria-current', 'true');
    // Changing only the location keeps the preset highlighted.
    await page.getByLabel('Export to').selectOption('zip');
    await expect(dialog(page).getByRole('button', { name: 'Social square, 1080 px' })).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('Import formats', () => {
  test('a WebP photo imports, renders and edits', async ({ page }) => {
    await gotoDevelop(page);
    const source = makeTestPhoto(600, 360);
    // Encode the test photo as lossless WebP in the browser.
    const webp = await page.evaluate(async ({ width, height, data }) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 1 });
      if (blob.type !== 'image/webp') throw new Error(`encoded ${blob.type}`);
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, { width: source.width, height: source.height, data: Array.from(source.data) });
    await page.getByTestId('file-input').setInputFiles({ name: 'trip.webp', mimeType: 'image/webp', buffer: Buffer.from(webp) });
    await waitForFullRender(page);
    await expect(page.getByTestId('develop-view')).toContainText('trip.webp');
    const before = await canvasPixels(page);
    await typeSliderValue(page, 'exposure', '1');
    await waitForFullRender(page);
    const after = await canvasPixels(page);
    expect(meanAbsDiff(before, after)).toBeGreaterThan(10);
    await page.screenshot({ path: 'test-results/screenshots/m19-webp-import.png' });
  });

  test('a HEIC file the browser cannot decode gets a clear message', async ({ page }) => {
    await gotoLibrary(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await (await chooser).setFiles({ name: 'IMG_2001.HEIC', mimeType: '', buffer: Buffer.from('not really a heic file') });
    await expect(page.getByTestId('status-bar').getByRole('alert')).toHaveText(
      "IMG_2001.HEIC is HEIC, which this browser can't open (Safari can). Convert it to JPEG to import it here.",
    );
  });
});
