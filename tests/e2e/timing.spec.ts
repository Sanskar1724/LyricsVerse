import { expect, openSample, test } from './helpers';

const FIRST = 'Streetlights hum a slow and gentle tune';
const SECOND = 'I still keep your jacket by the door';

test('adjust timing: shift later, slow the pace, cancel restores', async ({ page }) => {
  await openSample(page);
  const line = page.getByTestId('current-line');
  const seek = page.getByTestId('seek');

  await page.getByTestId('open-timing').click();
  await expect(page.getByTestId('timing-panel')).toBeVisible();

  // Cancel puts everything back.
  await page.getByTestId('shift-later').click();
  await page.getByTestId('timing-cancel').click();
  await seek.fill('2.1');
  await expect(line).toHaveText(FIRST);

  await page.getByTestId('open-timing').click();
  // Shift +0.5 s: the first line (2.0 s) now starts at 2.5 s.
  await page.getByTestId('shift-later').click();
  await page.getByTestId('shift-later').click();
  await expect(page.getByTestId('shift-value')).toHaveText('+0.50s');
  await seek.fill('2.2');
  await expect(line).toHaveCount(0);
  await seek.fill('2.6');
  await expect(line).toHaveText(FIRST);

  // Slower pace (stretch 1.10): the 2nd line moves from 5.5 s to 2 + 3.5 × 1.1 + 0.5 = 6.35 s.
  await page.getByTestId('pace-slower').click();
  await page.getByTestId('pace-slower').click();
  await expect(page.getByTestId('pace-value')).toHaveText('91%');
  await seek.fill('6.2');
  await expect(line).toHaveText(FIRST);
  await seek.fill('6.5');
  await expect(line).toHaveText(SECOND);

  await page.getByTestId('timing-done').click();
  await expect(page.getByTestId('timing-panel')).toHaveCount(0);
  await expect(page.getByTestId('toast').filter({ hasText: 'New timings applied' })).toBeVisible();
  await seek.fill('6.2');
  await expect(line).toHaveText(FIRST);
});

test('quick fit: snap estimated lyrics to the singer', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lyrics-input').fill('one\ntwo\nthree\nfour');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('estimate-hint')).toBeVisible();

  const line = page.getByTestId('current-line');
  const seek = page.getByTestId('seek');
  await page.getByTestId('open-timing').click();
  await expect(page.getByTestId('estimate-hint')).toHaveCount(0);

  // The singer starts at 0:10 and the last line comes at 0:15.
  await seek.fill('10');
  await page.getByTestId('fit-first').click();
  await seek.fill('15');
  await page.getByTestId('fit-last').click();

  await seek.fill('9.8');
  await expect(line).toHaveCount(0);
  await seek.fill('10.1');
  await expect(line).toHaveText('one');
  await seek.fill('15.1');
  await expect(line).toHaveText('four');

  await page.getByTestId('timing-done').click();
  // Saved timings are no longer "estimated".
  await expect(page.getByTestId('estimate-hint')).toHaveCount(0);
});
