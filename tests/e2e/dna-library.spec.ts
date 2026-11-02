import { readFileSync } from 'node:fs';
import { expect, openSample, startShow, test } from './helpers';

test('Song DNA card opens and downloads as a PNG', async ({ page }, testInfo) => {
  await openSample(page);
  await page.getByTestId('open-dna').click();
  const card = page.getByTestId('dna-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('dna-table')).toContainText('%');
  await expect(card.locator('canvas')).toHaveAttribute('aria-label', /Song DNA for Paper Lanterns/);

  const download = page.getByTestId('dna-download');
  await expect(download).toBeEnabled();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toBe('paper-lanterns-dna.png');
  // The confirmation toast only stays a few seconds, so check it before the slow file work.
  await expect(page.getByTestId('toast')).toContainText('PNG');
  const path = testInfo.outputPath('dna.png');
  await file.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
  expect(bytes.readUInt32BE(16)).toBe(1080); // width
  expect(bytes.readUInt32BE(20)).toBe(1350); // height
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('save a song, reopen it from the library, and see it in the mood diary', async ({ page }) => {
  await openSample(page);
  await startShow(page); // playing logs the listen in the diary
  await page.getByTestId('save-song').click();
  await expect(page.getByTestId('toast')).toContainText('Saved to your library');
  await expect(page.getByTestId('save-song')).toContainText('Saved');

  // Survives a full page reload (it's in localStorage).
  await page.reload();
  await page.getByTestId('nav-library').click();
  const item = page.getByTestId('library-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Paper Lanterns');
  await expect(item).toContainText('16 lines');

  await item.getByTestId('library-open').click();
  await expect(page.getByTestId('song-title')).toHaveText('Paper Lanterns');
  await startShow(page);
  await expect(page.getByTestId('current-line')).toHaveText('Streetlights hum a slow and gentle tune', { timeout: 6000 });

  await page.getByTestId('exit').click();
  await page.getByTestId('nav-diary').click();
  await expect(page.getByTestId('diary-entry')).toHaveCount(1);
  await expect(page.getByTestId('diary-entry')).toContainText('Paper Lanterns');
  await expect(page.getByTestId('diary-chart')).toBeVisible();

  // Delete from the library (two-step confirm).
  await page.getByText('← Home').click();
  await page.getByTestId('nav-library').click();
  await page.getByRole('button', { name: 'Delete Paper Lanterns' }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('library-item')).toHaveCount(0);
  await expect(page.getByText('No saved songs yet')).toBeVisible();
});
