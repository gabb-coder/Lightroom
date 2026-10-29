import { expect, type Page } from '@playwright/test';
import { encodePng, makeTestPhoto } from './png';

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** `count` distinct PNG photos named IMG_0418.png, IMG_0419.png, … */
export function testFiles(count: number, width = 240, height = 160): TestFile[] {
  return Array.from({ length: count }, (_, i) => {
    const photo = makeTestPhoto(width, height);
    // Shift each photo's colors so thumbnails differ.
    for (let p = 0; p < photo.data.length; p += 4) photo.data[p] = ((photo.data[p] ?? 0) + i * 37) % 256;
    return { name: `IMG_${String(418 + i).padStart(4, '0')}.png`, mimeType: 'image/png', buffer: encodePng(photo) };
  });
}

export async function gotoLibrary(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByTestId('library-view')).toBeVisible();
}

/** Imports through the top-bar button and waits until the library holds `total` photos. */
export async function importViaButton(page: Page, files: TestFile[], total = files.length) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles(files);
  await expect(page.getByTestId('status-bar')).toContainText(`of ${total} photos`);
  await expect(page.getByTestId('status-bar')).not.toContainText('Importing');
}

export const cells = (page: Page) => page.getByTestId('grid-cell');

/** File names of the grid cells, in display order. */
export async function gridNames(page: Page): Promise<string[]> {
  return cells(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
}
