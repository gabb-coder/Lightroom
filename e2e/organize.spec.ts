import { expect, test, type Page } from '@playwright/test';
import { waitForFullRender } from './utils/develop';
import { cells, gotoLibrary, gridNames, importViaButton, testFiles } from './utils/library';

const cell = (page: Page, name: string) => page.getByTestId('grid-cell').and(page.getByRole('button', { name, exact: true }));
const statusBar = (page: Page) => page.getByTestId('status-bar');

test.describe('Organize: Library', () => {
  test('Ctrl/Cmd and Shift multi-select; 1–5, 0 and P/X/U apply to every selected photo', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(6));
    await cells(page).nth(0).click();
    await cells(page).nth(2).click({ modifiers: ['ControlOrMeta'] });
    await expect(statusBar(page)).toContainText('2 selected');
    await cells(page).nth(4).click({ modifiers: ['Shift'] });
    await expect(statusBar(page)).toContainText('3 selected'); // range 2..4 from the anchor
    await expect(cells(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(cells(page).nth(3)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('4');
    for (const i of [2, 3, 4]) await expect(cells(page).nth(i).getByLabel('4 star rating')).toBeVisible();
    await expect(cells(page).nth(0).getByLabel('No rating')).toBeVisible();

    await page.keyboard.press('p');
    for (const i of [2, 3, 4]) await expect(cells(page).nth(i).getByRole('img', { name: 'Picked' })).toBeVisible();

    // Reject one photo: it is dimmed.
    await cells(page).nth(3).click();
    await page.keyboard.press('x');
    await expect(cells(page).nth(3).getByRole('img', { name: 'Rejected' })).toBeVisible();
    await expect(cells(page).nth(3).locator('[data-dimmed]')).toHaveCSS('opacity', '0.45');
    await expect(cells(page).nth(2).locator('[data-dimmed]')).toHaveCSS('opacity', '1');
    await expect(page.getByRole('region', { name: 'Metadata' })).toContainText('Rejected');
    await page.screenshot({ path: 'test-results/screenshots/m5-library.png' });

    await page.keyboard.press('u');
    await expect(cells(page).nth(3).getByRole('img', { name: 'Rejected' })).toHaveCount(0);
    await page.keyboard.press('0');
    await expect(cells(page).nth(3).getByLabel('No rating')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Metadata' })).toContainText('RatingNone');
  });

  test('shortcuts do nothing while typing in the search field', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    const search = page.getByLabel('Search photos');
    await search.pressSequentially('4x'); // would rate 4 and reject if shortcuts fired
    await expect(search).toHaveValue('4x');
    await search.fill('');
    await expect(cells(page)).toHaveCount(3);
    await expect(cells(page).first().getByLabel('No rating')).toBeVisible();
    await expect(cells(page).first().getByRole('img', { name: 'Rejected' })).toHaveCount(0);
  });

  test('combined filters, search and sort show the right photos; Clear filters restores all', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(6)); // IMG_0418 … IMG_0423
    const tag = async (name: string, keys: string[], label?: string) => {
      await cell(page, name).click();
      for (const k of keys) await page.keyboard.press(k);
      if (label) await page.getByRole('group', { name: 'Set color label' }).getByRole('button', { name: `${label} label` }).click();
    };
    await tag('IMG_0418.png', ['5', 'p'], 'Red');
    await tag('IMG_0419.png', ['3', 'p'], 'Green');
    await tag('IMG_0420.png', ['3'], 'Red');
    await tag('IMG_0421.png', ['1', 'x']);
    await tag('IMG_0423.png', ['4', 'x'], 'Red');
    await expect(cell(page, 'IMG_0423.png').getByRole('img', { name: 'Red label' })).toBeVisible();

    const flags = page.getByRole('group', { name: 'Flag filter' });
    const labels = page.getByRole('group', { name: 'Color label filter' });
    await flags.getByRole('button', { name: 'Picks' }).click();
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0419.png']);
    await page.getByLabel('Rating', { exact: true }).selectOption('4');
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0418.png']);

    await flags.getByRole('button', { name: 'All' }).click();
    await labels.getByRole('button', { name: 'Red label' }).click();
    await page.getByLabel('Rating', { exact: true }).selectOption('3');
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0420.png', 'IMG_0423.png']);
    await flags.getByRole('button', { name: 'Unflagged' }).click();
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0420.png']);
    await flags.getByRole('button', { name: 'Rejected' }).click();
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0423.png']);
    await expect(statusBar(page)).toContainText('1 of 6 photos');
    await page.screenshot({ path: 'test-results/screenshots/m5-filters.png' });

    await page.getByLabel('Search photos').fill('0418');
    await expect(page.getByTestId('no-matches')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect.poll(() => gridNames(page)).toHaveLength(6);
    await expect(page.getByLabel('Search photos')).toHaveValue('');

    await page.getByLabel('Search photos').fill('img_042');
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0420.png', 'IMG_0421.png', 'IMG_0422.png', 'IMG_0423.png']);
    await page.getByLabel('Search photos').fill('');
    await page.getByLabel('Sort', { exact: true }).selectOption('rating');
    await expect.poll(() => gridNames(page)).toEqual(['IMG_0418.png', 'IMG_0423.png', 'IMG_0419.png', 'IMG_0420.png', 'IMG_0421.png', 'IMG_0422.png']);
  });

  test('ratings, flags and labels survive a reload', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(2));
    await cells(page).nth(1).click();
    await page.keyboard.press('2');
    await page.keyboard.press('p');
    await page.getByRole('group', { name: 'Set color label' }).getByRole('button', { name: 'Blue label' }).click();
    await expect(cells(page).nth(1).getByRole('img', { name: 'Blue label' })).toBeVisible();
    await page.reload();
    await expect(cells(page).nth(1).getByLabel('2 star rating')).toBeVisible();
    await expect(cells(page).nth(1).getByRole('img', { name: 'Picked' })).toBeVisible();
    await expect(cells(page).nth(1).getByRole('img', { name: 'Blue label' })).toBeVisible();
  });
});

test.describe('Organize: Develop', () => {
  test('toolbar stars, flags and labels, keyboard shortcuts and the filmstrip filter', async ({ page }) => {
    await gotoLibrary(page);
    await importViaButton(page, testFiles(3));
    await cells(page).nth(0).dblclick();
    await waitForFullRender(page);
    const toolbar = page.getByTestId('toolbar');

    await toolbar.getByRole('button', { name: 'Rate 3 stars' }).click();
    await expect(toolbar.getByRole('button', { name: 'Rate 3 stars' })).toHaveAttribute('aria-pressed', 'true');
    await toolbar.getByRole('button', { name: 'Pick' }).click();
    await expect(toolbar.getByRole('button', { name: 'Pick' })).toHaveAttribute('aria-pressed', 'true');
    await toolbar.getByRole('button', { name: 'Green label' }).click();
    await expect(toolbar.getByRole('button', { name: 'Green label' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/screenshots/m5-develop.png' });

    // Clicking the current rating clears it; the keyboard sets it again.
    await toolbar.getByRole('button', { name: 'Rate 3 stars' }).click();
    await expect(toolbar.getByRole('button', { name: 'Rate 3 stars' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('5');
    await expect(toolbar.getByRole('button', { name: 'Rate 5 stars' })).toHaveAttribute('aria-pressed', 'true');

    // Shortcuts in Develop apply only to the open photo.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('info-strip')).toContainText('IMG_0419.png');
    await page.keyboard.press('x');
    await expect(toolbar.getByRole('button', { name: 'Reject' })).toHaveAttribute('aria-pressed', 'true');

    const filmstrip = page.getByTestId('filmstrip');
    await filmstrip.getByLabel('Filter').selectOption('picks');
    await expect(filmstrip.getByRole('button')).toHaveCount(1);
    await expect(filmstrip.getByRole('button', { name: 'IMG_0418.png' })).toBeVisible();
    await filmstrip.getByLabel('Filter').selectOption('rated3');
    await expect(filmstrip.getByRole('button')).toHaveCount(1);
    await filmstrip.getByLabel('Filter').selectOption('all');
    await expect(filmstrip.getByRole('button')).toHaveCount(3);

    await page.getByRole('tab', { name: 'Library' }).click();
    await expect(cells(page).nth(0).getByLabel('5 star rating')).toBeVisible();
    await expect(cells(page).nth(0).getByRole('img', { name: 'Green label' })).toBeVisible();
    await expect(cells(page).nth(1).locator('[data-dimmed]')).toHaveCSS('opacity', '0.45');
  });
});

test('the filter bar fits on one line at 1440px, as in the design', async ({ page }) => {
  await gotoLibrary(page);
  await importViaButton(page, testFiles(1));
  const bar = await page.getByTestId('filter-bar').boundingBox();
  expect(bar?.height).toBe(44);
});
