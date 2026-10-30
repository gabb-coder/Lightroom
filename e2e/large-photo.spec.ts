import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { gotoDevelop, typeSliderValue } from './utils/develop';
import { encodePng, makeTestPhoto } from './utils/png';

const W = 8192;
const H = 6144; // 50.3 megapixels

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length) {
    const marker = bytes[i + 1] ?? 0;
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error('no SOF marker');
}

test.describe('Photos larger than the GPU (M33)', () => {
  test('the export says when it had to be smaller than the original', async ({ page }) => {
    // Main-thread export so the page's ?maxTexture cap applies to it too.
    await page.goto('/?export=main&maxTexture=256');
    await page.getByRole('tab', { name: 'Develop' }).click();
    await page.getByTestId('file-input').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: encodePng(makeTestPhoto(600, 360)) });
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'full');
    await page.getByRole('tab', { name: 'Export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await readFile(await (await download).path());
    expect(jpegSize(file)).toEqual({ width: 256, height: 154 });
    await expect(page.getByTestId('export-toast')).toContainText("Larger than this device's graphics can process: exported at 256 px on the long edge.");
  });
});

test.describe('Large photos (M33) @perf', () => {
  test('a 50 MP photo imports, edits and exports at full size without errors @perf', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const png = encodePng(makeTestPhoto(W, H));
    await gotoDevelop(page);
    const maxTexture = await page.evaluate(() => {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
      return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 0;
    });
    test.skip(maxTexture < 8192, `this GPU holds ${maxTexture} px textures; 50 MP needs 8192`);

    const t0 = Date.now();
    await page.getByTestId('file-input').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: png });
    // Decoding and the first full render of 50 MP take a while on software WebGL.
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'full', { timeout: 300_000 });
    const opened = Date.now() - t0;
    await expect(page.getByTestId('info-strip')).toContainText(`${W} × ${H}`);

    const t1 = Date.now();
    await typeSliderValue(page, 'exposure', '0.4');
    await typeSliderValue(page, 'clarity', '30');
    await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'full', { timeout: 300_000 });
    const edited = Date.now() - t1;

    await page.getByRole('tab', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Full size JPEG' }).click();
    const t2 = Date.now();
    const download = page.waitForEvent('download', { timeout: 540_000 });
    await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
    const file = await readFile(await (await download).path());
    const exported = Date.now() - t2;
    expect(jpegSize(file)).toEqual({ width: W, height: H });

    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    console.log(
      `50 MP (${W}×${H}): open ${(opened / 1000).toFixed(1)} s, two edits ${(edited / 1000).toFixed(1)} s, full-size export ${(exported / 1000).toFixed(1)} s (${(file.length / 1e6).toFixed(1)} MB), JS heap ${(heap / 1e6).toFixed(0)} MB, max texture ${maxTexture}`,
    );
    expect(errors).toEqual([]);
  });
});
