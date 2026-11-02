import { expect, isSoftwareRendering, measureFps, openSample, startShow, test } from './helpers';

/** Let entrance animations finish so we measure steady-state frame rate. */
const SETTLE_MS = 1200;
const FIRST = 'Streetlights hum a slow and gentle tune';
const STYLES = [
  { key: '1', id: 'stars' },
  { key: '2', id: 'kinetic' },
  { key: '3', id: 'karaoke' },
  { key: '4', id: 'tunnel' },
];

test('all four styles play over the living backdrop, with pause, seek and replay', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.getByTestId('sample-button').click();

  // Autoplay rules: nothing plays until the start button is clicked.
  await expect(page.getByTestId('start-overlay')).toBeVisible();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'false');
  await startShow(page);

  // Stars is the default style; the shared backdrop (scene + heartbeat trace) sits behind it.
  await expect(page.getByTestId('mode-stars')).toBeVisible();
  await expect(page.getByTestId('backdrop').locator('canvas')).toHaveCount(2);
  await expect(page.getByTestId('current-line')).toHaveText(FIRST, { timeout: 6000 });

  const software = await isSoftwareRendering(page);
  const minFps = software ? 20 : 50;
  const fps: Record<string, number> = {};
  for (const s of STYLES) {
    await page.keyboard.press(s.key);
    await expect(page.getByTestId('player-screen')).toHaveAttribute('data-mode', s.id);
    await expect(page.getByTestId(`mode-${s.id}`)).toBeVisible();
    // Jump to "I'm so angry at the lies you told" and check the line is on stage in this style.
    await page.getByTestId('seek').fill('23.2');
    await expect(page.getByTestId('current-line')).toContainText('angry');
    await page.waitForTimeout(SETTLE_MS);
    fps[s.id] = await measureFps(page);
  }
  // The backdrop survives mode switches (it isn't torn down and rebuilt).
  await expect(page.getByTestId('backdrop')).toHaveCount(1);

  // Pause with Space mid-song, then resume.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'false');
  const pausedAt = await page.getByTestId('time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('time')).toHaveText(pausedAt!);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'true');

  // Next line ⏭ and seeking back to the start.
  await page.getByTestId('mode-tab-kinetic').click();
  await page.getByTestId('seek').fill('2.1');
  await expect(page.getByTestId('current-line')).toContainText('Streetlights');
  await page.getByTestId('next-line').click();
  await expect(page.getByTestId('current-line')).toContainText('jacket');
  await page.getByTestId('seek').fill('0');
  await expect(page.getByTestId('current-line')).toHaveCount(0);

  // Jump to the end: the Song DNA card appears automatically. Replay restarts from 0:00.
  await page.getByTestId('seek').fill('59.8');
  await expect(page.getByTestId('dna-card')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dna-card')).toHaveCount(0);
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('time')).toHaveText(/^0:0[0-2]$/);

  console.log(`FPS ${JSON.stringify(fps)} (${software ? 'software rendering' : 'GPU'}, need >= ${minFps})`);
  for (const v of Object.values(fps)) expect(v).toBeGreaterThanOrEqual(minFps);
});

test('kinetic gives lines different random looks, words land in order', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.getByTestId('sample-button').click();
  await page.keyboard.press('2');
  const seek = page.getByTestId('seek');
  const looks: string[] = [];
  for (const t of ['2.1', '5.6', '9.1', '12.6', '16.1', '19.6', '23.1', '26.6']) {
    await seek.fill(t);
    const line = page.getByTestId('current-line');
    await expect(line).toBeVisible();
    looks.push(`${await line.getAttribute('data-font')}/${await line.getAttribute('data-entrance')}`);
  }
  // Consecutive lines never share a font or an entrance.
  for (let i = 1; i < looks.length; i++) {
    const [fa, ea] = looks[i - 1].split('/');
    const [fb, eb] = looks[i].split('/');
    expect(fb).not.toBe(fa);
    expect(eb).not.toBe(ea);
  }
  expect(new Set(looks.map((l) => l.split('/')[0])).size).toBeGreaterThanOrEqual(3);

  // Paused at 23.6 s: early words of "I'm so angry…" are visible, the last ones not yet.
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'false');
  await seek.fill('23.6');
  await page.waitForTimeout(600);
  const opacities = await page
    .getByTestId('current-line')
    .locator('.kin-word')
    .evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.opacity || '0')));
  expect(opacities[0]).toBeGreaterThan(0.9);
  expect(opacities[opacities.length - 1]).toBe(0);
});

test('mode preference is remembered and full-screen button responds', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('mode-tab-kinetic').click();
  await page.getByTestId('exit').click();
  await page.getByTestId('sample-button').click();
  await expect(page.getByTestId('player-screen')).toHaveAttribute('data-mode', 'kinetic');
  await page.getByTestId('fullscreen').click();
  await expect
    .poll(async () => {
      const inFs = await page.evaluate(() => !!document.fullscreenElement);
      const toast = await page.getByTestId('toast').count();
      return inFs || toast > 0;
    })
    .toBe(true);
});

test('karaoke fills sung words and leaves the rest', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('3');
  await page.getByTestId('seek').fill('24');
  const fills = () =>
    page
      .getByTestId('current-line')
      .locator('.kara-word')
      .evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--fill') || '0')));
  // Fills are painted on the next animation frame.
  await expect.poll(async () => (await fills())[0]).toBe(1);
  const f = await fills();
  expect(f[f.length - 1]).toBe(0);
});

test('stars: words pop in on the beat, seven per set, then a new set starts', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('1');
  const stars = page.getByTestId('mode-stars');
  const seek = page.getByTestId('seek');
  await expect(stars).toBeVisible();
  await expect(stars).toContainText('92 BPM'); // no audio: steady grid matching the silent pulse

  await seek.fill('1');
  await expect(stars).toHaveAttribute('data-set', '-1');
  // Line 1 has exactly seven words, so it fills set 0 word by word.
  await seek.fill('3');
  await expect(stars).toHaveAttribute('data-set', '0');
  const partial = Number(await stars.getAttribute('data-words'));
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(7);
  await seek.fill('5.3');
  await expect(stars).toHaveAttribute('data-words', '7');
  await expect(stars.locator('.stars-dots span.on')).toHaveCount(7);
  // The first word of line 2 is the 8th word: a new set pops in.
  await seek.fill('6');
  await expect(stars).toHaveAttribute('data-set', '1');
  await expect(stars).toHaveAttribute('data-words', /^[1-7]$/);
  await expect(page.getByTestId('current-line')).toHaveText('I still keep your jacket by the door');
});

test('karaoke paints the first word of a line reached by seeking', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('3');
  await page.getByTestId('seek').fill('24'); // fill line 7's first word fully
  await page.getByTestId('seek').fill('48.6'); // then jump straight into the middle of line 14
  const first = page.getByTestId('current-line').locator('.kara-word').first();
  await expect.poll(async () => first.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--fill') || '0'))).toBe(1);
});
