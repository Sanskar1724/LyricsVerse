import { expect, makeWav, test } from './helpers';

test('finds the beat of an uploaded song and shows it in Stars', async ({ page }) => {
  await page.goto('/');
  // makeWav has a kick drum at 120 BPM.
  await page.getByTestId('audio-input').setInputFiles({ name: 'groove.wav', mimeType: 'audio/wav', buffer: makeWav(12) });
  await expect(page.getByTestId('audio-ready')).toBeVisible();
  await page.getByTestId('lyrics-input').fill('one two three four five six seven\neight nine ten');
  await page.getByTestId('autosync-checkbox').uncheck();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('toast').filter({ hasText: /Found the beat: 1(19|20|21) BPM/ })).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('1');
  await expect(page.getByTestId('dj-bpm')).toHaveText(/1(19|20|21)\.\d BPM/);
});
