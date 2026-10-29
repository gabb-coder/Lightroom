import { expect, test, type Page } from '@playwright/test';
import { withExif } from './utils/jpeg';
import { cells, gotoLibrary, gridNames, importViaButton } from './utils/library';

/** A small solid JPEG made by the browser, tagged with camera EXIF. */
async function cameraJpeg(page: Page, color: string, camera: [string, string], lens: string, iso: number, date: string): Promise<Buffer> {
  const bytes = await page.evaluate(async (fill) => {
    const canvas = new OffscreenCanvas(60, 40);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 60, 40);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
  return withExif(new Uint8Array(bytes), {
    ifd0: { 0x010f: camera[0], 0x0110: camera[1] },
    exif: { 0x9003: date, 0x8827: { short: iso }, 0xa434: lens },
  });
}

const metadataFilters = (page: Page) => page.getByTestId('metadata-filters');

test.describe('Metadata filters and keywords', () => {
  test('filter by camera, lens, ISO and capture date; search covers camera and lens', async ({ page }) => {
    await gotoLibrary(page);
    const files = [
      { name: 'r5-day.jpg', buffer: await cameraJpeg(page, '#c84', ['Canon', 'Canon EOS R5'], 'RF24-105mm F4 L IS USM', 100, '2023:06:14 10:00:00') },
      { name: 'r5-night.jpg', buffer: await cameraJpeg(page, '#225', ['Canon', 'Canon EOS R5'], 'RF50mm F1.8 STM', 6400, '2023:06:15 23:30:00') },
      { name: 'z6.jpg', buffer: await cameraJpeg(page, '#585', ['NIKON CORPORATION', 'NIKON Z 6'], 'NIKKOR Z 24-70mm f/4 S', 800, '2023:07:01 12:00:00') },
    ].map((f) => ({ ...f, mimeType: 'image/jpeg' }));
    await importViaButton(page, files);
    await page.getByLabel('Sort').selectOption('fileName');

    await page.getByRole('button', { name: 'Metadata filters' }).click();
    await expect(metadataFilters(page)).toBeVisible();
    await expect(page.getByLabel('Camera').locator('option')).toHaveText(['Any', 'Canon EOS R5', 'NIKON Z 6']);
    await page.getByLabel('Camera').selectOption('Canon EOS R5');
    expect(await gridNames(page)).toEqual(['r5-day.jpg', 'r5-night.jpg']);
    await page.getByLabel('Minimum ISO').fill('1000');
    expect(await gridNames(page)).toEqual(['r5-night.jpg']);
    await expect(page.getByRole('button', { name: /Metadata filters/ })).toHaveAccessibleName('Metadata filters, 2 active');
    await page.screenshot({ path: 'test-results/screenshots/m11-metadata-filters.png' });

    await metadataFilters(page).getByRole('button', { name: 'Clear' }).click();
    expect(await gridNames(page)).toEqual(['r5-day.jpg', 'r5-night.jpg', 'z6.jpg']);
    await page.getByLabel('Lens').selectOption('NIKKOR Z 24-70mm f/4 S');
    expect(await gridNames(page)).toEqual(['z6.jpg']);
    await page.getByLabel('Lens').selectOption('');
    await page.getByLabel('Captured from').fill('2023-06-15');
    await page.getByLabel('Captured to').fill('2023-06-30');
    expect(await gridNames(page)).toEqual(['r5-night.jpg']);
    await metadataFilters(page).getByRole('button', { name: 'Clear' }).click();

    await page.getByLabel('Search photos').fill('nikon');
    expect(await gridNames(page)).toEqual(['z6.jpg']);
    await page.getByLabel('Search photos').fill('canon rf50');
    expect(await gridNames(page)).toEqual(['r5-night.jpg']);
  });

  test('keywords: add to several photos, remove, filter and search; they survive a reload', async ({ page }) => {
    await gotoLibrary(page);
    const files = await Promise.all(
      ['a', 'b', 'c'].map(async (n, i) => ({ name: `${n}.jpg`, mimeType: 'image/jpeg', buffer: await cameraJpeg(page, `#${i}8${i}`, ['Canon', 'Canon EOS R5'], 'RF', 100, '2023:06:14 10:00:00') })),
    );
    await importViaButton(page, files);
    await page.getByLabel('Sort').selectOption('fileName');
    const keywords = page.getByRole('region', { name: 'Keywords' });

    // a + b: "Beach, Family"; then c alone: "beach" (same keyword) and "Night".
    await cells(page).nth(0).click();
    await cells(page).nth(1).click({ modifiers: ['ControlOrMeta'] });
    await keywords.getByLabel('Add keywords').fill('Beach, Family');
    await keywords.getByLabel('Add keywords').press('Enter');
    await expect(keywords.getByRole('listitem')).toHaveText(['Beach', 'Family']);
    await cells(page).nth(2).click();
    await keywords.getByLabel('Add keywords').fill('beach; Night');
    await keywords.getByLabel('Add keywords').press('Enter');
    await expect(keywords.getByRole('listitem')).toHaveText(['beach', 'Night']);

    // Selection of all three: Beach on all, the others partial.
    await cells(page).nth(0).click();
    await cells(page).nth(2).click({ modifiers: ['Shift'] });
    await expect(keywords.getByRole('listitem')).toHaveText(['Beach', 'Family 2', 'Night 1']);
    await expect(page.getByRole('region', { name: 'Metadata' })).toContainText('RF'); // a short (inline) EXIF string
    await page.screenshot({ path: 'test-results/screenshots/m11-keywords.png' });

    await page.getByLabel('Search photos').fill('family');
    expect(await gridNames(page)).toEqual(['a.jpg', 'b.jpg']);
    await page.getByLabel('Search photos').fill('');

    await expect(page.locator('html')).toHaveAttribute('data-save-state', 'saved');
    await page.reload();
    await expect(cells(page)).toHaveCount(3);
    // Clicking a keyword shows the photos that have it.
    await page.getByLabel('Sort').selectOption('fileName');
    await cells(page).nth(1).click();
    await keywords.getByRole('button', { name: 'Show photos with keyword Family' }).click();
    expect(await gridNames(page)).toEqual(['a.jpg', 'b.jpg']);
    await expect(page.getByRole('button', { name: /Metadata filters/ })).toHaveAccessibleName('Metadata filters, 1 active');

    // Remove "Family" from b only.
    await keywords.getByRole('button', { name: 'Remove keyword Family' }).click();
    await expect.poll(() => gridNames(page)).toEqual(['a.jpg']);
  });
});
