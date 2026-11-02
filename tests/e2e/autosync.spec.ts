import { expect, makeVocalWav, test } from './helpers';

const SUNG: [number, number][] = [
  [2, 4.5],
  [5.2, 7.5],
  [11, 13.5], // after an instrumental break
];
const LYRICS = 'first line we sing out loud\nsecond line keeps going on\nthird line after the break';

test('auto-sync lines plain lyrics up with the singing in an MP3/WAV', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({ name: 'my-song.wav', mimeType: 'audio/wav', buffer: makeVocalWav(16, SUNG) });
  await expect(page.getByTestId('audio-ready')).toBeVisible();
  await page.getByTestId('lyrics-input').fill(LYRICS);
  await expect(page.getByTestId('autosync-checkbox')).toBeChecked();
  await page.getByTestId('start-button').click();

  await expect(page.getByTestId('toast').filter({ hasText: 'Auto-synced 3 lines' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('estimate-hint')).toHaveCount(0);
  // The detected singing is drawn on the seek bar.
  await expect(page.locator('.seek-vocal')).toHaveCount(3);

  const line = page.getByTestId('current-line');
  const seek = page.getByTestId('seek');
  await seek.fill('1.5');
  await expect(line).toHaveCount(0);
  await seek.fill('2.4');
  await expect(line).toHaveText('first line we sing out loud');
  await seek.fill('5.6');
  await expect(line).toHaveText('second line keeps going on');
  await seek.fill('10');
  await expect(line).not.toHaveText('third line after the break');
  await seek.fill('11.4');
  await expect(line).toHaveText('third line after the break');
});

test('auto-sync can be run later from the player', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({ name: 'my-song.wav', mimeType: 'audio/wav', buffer: makeVocalWav(16, SUNG) });
  await page.getByTestId('lyrics-input').fill(LYRICS);
  await page.getByTestId('autosync-checkbox').uncheck();
  await page.getByTestId('start-button').click();

  // Estimated timings: the notice offers auto-sync because the audio is available.
  await expect(page.getByTestId('estimate-hint')).toBeVisible();
  await page.getByTestId('hint-autosync').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Auto-synced 3 lines' })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('seek').fill('11.4');
  await expect(page.getByTestId('current-line')).toHaveText('third line after the break');

  // Also from the timing panel.
  await page.getByTestId('open-timing').click();
  await page.getByTestId('autosync-run').click();
  await expect(page.getByTestId('timing-panel')).toHaveCount(0);
});

test('auto-sync explains when it hears no singing', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({ name: 'instrumental.wav', mimeType: 'audio/wav', buffer: makeVocalWav(8, []) });
  await page.getByTestId('lyrics-input').fill('one\ntwo');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('toast').filter({ hasText: "Couldn't hear any singing" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('player-screen')).toBeVisible();
  await expect(page.getByTestId('estimate-hint')).toBeVisible();
});
