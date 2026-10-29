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
 * (the "Before" badge, mask guides, the split divider) are hidden so only rendered pixels are compared.
 */
export async function canvasPixels(page: Page): Promise<RgbaPixels> {
  await settle(page);
  const png = await page
    .getByTestId('photo-canvas')
    .screenshot({ style: '[data-testid="before-badge"], [data-testid="mask-overlay"], [data-testid^="split-"] { visibility: hidden; }' });
  return decodePng(png);
}

export function slider(page: Page, label: string) {
  return page.getByLabel(label, { exact: true });
}

/** A panel's header button (its accessible name gains "Edited" once edited). */
export const panelHeader = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true }).getByRole('button').first();

export async function openPanel(page: Page, title: string) {
  const header = panelHeader(page, title);
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}

/** Types an exact slider value into its value field (click the value, type, Enter). */
export async function typeSliderValue(page: Page, id: string, value: string) {
  await page.getByTestId(`value-${id}`).click();
  // The field opens focused with its text selected, so typing replaces it.
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(`value-${id}`)).toBeVisible();
}
