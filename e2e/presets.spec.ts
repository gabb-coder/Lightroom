import { expect, test, type Page } from '@playwright/test';
import { canvasPixels, gotoDevelop, openTestPhoto, slider, smallPhotoPng } from './utils/develop';
import { countDifferentPixels, imageStats } from './utils/png';

const presetsPanel = (page: Page) => page.getByRole('region', { name: 'Presets' });

test.describe('Presets', () => {
  test('lists the six sample presets from the design in two groups', async ({ page }) => {
    await gotoDevelop(page);
    const user = presetsPanel(page).getByRole('group', { name: 'User presets' });
    const builtin = presetsPanel(page).getByRole('group', { name: 'Built-in' });
    await expect(user.getByRole('button')).toHaveText(['Warm film', 'Soft matte', 'Crisp B&W']);
    await expect(builtin.getByRole('button')).toHaveText(['Clean daylight', 'High contrast', 'Faded']);
    await expect(user.getByRole('button').first()).toBeDisabled(); // no photo yet
  });

  test('applying a preset replaces all settings in one history step', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await slider(page, 'Exposure').focus();
    await page.keyboard.press('End');

    await presetsPanel(page).getByRole('button', { name: 'Crisp B&W' }).click();
    expect(imageStats(await canvasPixels(page)).meanSpread).toBeLessThan(2);
    await expect(page.getByTestId('value-exposure')).toHaveText('0.00'); // replaced, not merged
    await expect(page.getByTestId('value-contrast')).toHaveText('+30');
    await expect(page.getByTestId('value-whites')).toHaveText('+16');
    await expect(page.getByRole('group', { name: 'Treatment' }).getByRole('button', { name: 'B&W' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('history').getByRole('listitem').first()).toHaveText('Preset: Crisp B&W');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('value-exposure')).toHaveText('+5.00');
  });

  test('saving the current settings as a preset and applying it later reproduces the look', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await presetsPanel(page).getByRole('button', { name: 'Warm film' }).click();
    await slider(page, 'Shadows').focus();
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    const look = await canvasPixels(page);

    await page.getByRole('button', { name: 'Save settings as preset' }).click();
    const name = page.getByLabel('Preset name');
    await expect(name).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await name.fill('My warm look');
    await name.press('Enter');
    const saved = presetsPanel(page).getByRole('group', { name: 'User presets' }).getByRole('button', { name: 'My warm look' });
    await expect(saved).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/m3-presets.png' });

    await page.getByRole('button', { name: 'Reset all' }).click();
    await saved.click();
    expect(countDifferentPixels(await canvasPixels(page), look)).toBe(0);
    await expect(page.getByTestId('history').getByRole('listitem').first()).toHaveText('Preset: My warm look');
  });

  test('Escape cancels saving a preset', async ({ page }) => {
    await gotoDevelop(page);
    await openTestPhoto(page, smallPhotoPng);
    await page.getByRole('button', { name: 'Save settings as preset' }).click();
    await page.getByLabel('Preset name').fill('Nope');
    await page.getByLabel('Preset name').press('Escape');
    await expect(page.getByLabel('Preset name')).toHaveCount(0);
    await expect(presetsPanel(page).getByRole('button', { name: 'Nope' })).toHaveCount(0);
  });
});
