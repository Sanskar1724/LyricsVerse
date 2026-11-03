import { expect, makeWav, startShow, test } from './helpers';

test('empty lyrics show a friendly message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('form-error')).toContainText('Add some lyrics first');
  await page.getByTestId('lyrics-input').fill('[Chorus]\n\n   \n[Verse 2]');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('form-error')).toContainText('look empty');
});

test('long lyrics with emojis and Hindi play in every mode and tap-to-sync saves timings', async ({ page }) => {
  const extra = ['दिल में तेरा प्यार है ❤️', 'तेरी याद में आँसू 😢', 'Party all night 🎉🥳', '雨が降る夜', 'नहीं मैं ख़ुश नहीं हूँ'];
  const lyrics = Array.from({ length: 220 }, (_, i) => (i < extra.length ? extra[i] : `Line ${i + 1}: ${['so happy', 'so sad', 'I miss you', 'angry fire'][i % 4]}`)).join('\n');
  await page.goto('/');
  await page.getByTestId('lyrics-input').fill(lyrics);
  await expect(page.getByTestId('format-info')).toContainText('Plain text · 220 lines');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('player-screen')).toBeVisible();
  await startShow(page);
  await expect(page.getByTestId('current-line')).toHaveText('दिल में तेरा प्यार है ❤️', { timeout: 6000 });
  await expect(page.getByTestId('mood-chip')).toContainText('Love');

  // Every style copes with Hindi, emoji and a line deep into a 220-line song.
  await page.keyboard.press('Space'); // pause so the line stays put while we switch styles
  await page.getByTestId('seek').fill(String(219 * 3.5));
  for (const [key, id] of [
    ['2', 'kinetic'],
    ['3', 'karaoke'],
    ['4', 'tunnel'],
    ['1', 'stars'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByTestId(`mode-${id}`)).toBeVisible();
    await expect(page.getByTestId('current-line')).toContainText('Line 219');
  }
  await page.getByTestId('seek').fill('2.1');
  await page.keyboard.press('2');
  await page.keyboard.press('Space'); // resume
  await expect(page.getByTestId('current-line')).toContainText('प्यार');

  // Tap to sync: three taps, then save (the rest are spread over the remaining time).
  await page.getByTestId('open-tapsync').click();
  await expect(page.getByTestId('tapsync')).toBeVisible();
  await page.keyboard.press('Space'); // begin
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'true');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1000);
    await page.keyboard.press('Space');
  }
  await expect(page.getByTestId('tap-progress')).toHaveText('3 / 220 lines');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('tap-progress')).toHaveText('2 / 220 lines');
  await page.getByTestId('tap-save').click();
  await expect(page.getByTestId('tapsync')).toHaveCount(0);
  await expect(page.getByTestId('toast').filter({ hasText: 'New timings applied' })).toBeVisible();
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('current-line')).toHaveText('दिल में तेरा प्यार है ❤️', { timeout: 3000 });
});

test('wrong file types and corrupted audio are rejected kindly', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('audio-input');

  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('audio-error')).toContainText("doesn't look like an audio file");

  await input.setInputFiles({ name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not really an mp3 file '.repeat(200)) });
  await expect(page.getByTestId('audio-error')).toContainText("couldn't be played", { timeout: 15000 });

  // The app still works without audio after a bad file.
  await page.getByTestId('lyrics-input').fill('just one line');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('player-screen')).toBeVisible();
});

test('real audio: LRC out of order and past the end of the song', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({ name: 'beat.wav', mimeType: 'audio/wav', buffer: makeWav(8) });
  await expect(page.getByTestId('audio-ready')).toContainText('beat.wav · 0:08');
  await page.getByTestId('lyrics-input').fill('[00:03.00] second line so sad\n[00:01.00] first line so happy\n[00:05.50] third line I love you\n[02:00.00] way past the end');
  await expect(page.getByTestId('format-info')).toContainText('LRC detected · 4 timed lines');
  await page.getByTestId('start-button').click();

  await expect(page.getByTestId('toast').filter({ hasText: 'Re-ordered' })).toBeVisible();
  await expect(page.getByTestId('toast').filter({ hasText: 'after the song ends' })).toBeVisible();
  await expect(page.getByTestId('song-title')).toHaveText('beat');

  await startShow(page);
  await expect(page.getByTestId('current-line')).toHaveText('first line so happy', { timeout: 4000 });
  await expect(page.getByTestId('current-line')).toHaveText('second line so sad', { timeout: 4000 });
  await page.keyboard.press('Space');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'false');
  // Seek back and replay
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('current-line')).toHaveText('first line so happy', { timeout: 4000 });
  await page.keyboard.press('3');
  await expect(page.getByTestId('mode-karaoke')).toBeVisible();
  await expect(page.getByTestId('current-line')).toContainText('line so');
  // Leaving the screen releases the audio without errors.
  await page.getByTestId('exit').click();
  await expect(page.getByTestId('sample-button')).toBeVisible();
});

test('attaching audio to a lyrics-only song re-spreads its timings', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lyrics-input').fill('one\ntwo\nthree\nfour');
  await page.getByTestId('start-button').click();
  await page.getByTestId('attach-audio-input').setInputFiles({ name: 'tune.wav', mimeType: 'audio/wav', buffer: makeWav(6) });
  await expect(page.getByTestId('toast').filter({ hasText: 'Playing with tune.wav' })).toBeVisible();
  await expect(page.getByTestId('transport').getByText('0:06')).toBeVisible();
  await page.getByTestId('attach-audio-input').setInputFiles({ name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('nope'.repeat(100)) });
  await expect(page.getByTestId('toast').filter({ hasText: "couldn't be played" })).toBeVisible({ timeout: 15000 });
});

test('localStorage unavailable: app warns and keeps working in memory', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('toast')).toContainText('only last until you close this tab');
  await page.getByTestId('sample-button').click();
  await page.getByTestId('save-song').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'session only' })).toBeVisible();
  await page.getByTestId('exit').click();
  await page.getByTestId('nav-library').click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
});

test('localStorage full: saving shows a friendly error', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('lyricverse.library')) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByTestId('sample-button').click();
  await page.getByTestId('save-song').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'storage is full' })).toBeVisible();
  await expect(page.getByTestId('save-song')).toHaveText('💾 Save');
});
