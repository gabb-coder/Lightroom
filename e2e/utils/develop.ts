import { expect, type Page } from '@playwright/test';
import { decodePng, encodePng, makeTestPhoto, type RgbaPixels } from './png';

export const PHOTO_W = 2000;
export const PHOTO_H = 1200;
export const photoPng = encodePng(makeTestPhoto(PHOTO_W, PHOTO_H));

export async function gotoDevelop(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('develop-view')).toBeVisible();
}

export async function waitForFullRender(page: Page) {
  await expect(page.getByTestId('photo-canvas')).toHaveAttribute('data-render-mode', 'full');
}

/** Lets any pending requestAnimationFrame render run before we look. */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Small photo for tests that render many times (software WebGL is slow). */
export const smallPhotoPng = encodePng(makeTestPhoto(600, 360));

export async function openTestPhoto(page: Page, png: Buffer = photoPng) {
  await page.getByTestId('file-input').setInputFiles({ name: 'test-photo.png', mimeType: 'image/png', buffer: png });
  await waitForFullRender(page);
}

/**
 * Decoded screenshot of the canvas after pending renders have run. Overlays
 * (the "Before" badge) are hidden so only rendered pixels are compared.
 */
export async function canvasPixels(page: Page): Promise<RgbaPixels> {
  await settle(page);
  const png = await page.getByTestId('photo-canvas').screenshot({ style: '[data-testid="before-badge"] { visibility: hidden; }' });
  return decodePng(png);
}

export function slider(page: Page, label: string) {
  return page.getByLabel(label, { exact: true });
}
