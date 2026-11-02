import { pointsFor } from '../../src/lib/game';
import { expect, openSample, test } from './helpers';

test('Guess the Feeling: a full round with 2 players', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('open-game').click();
  await page.getByTestId('players-2').click();
  await page.getByTestId('player-name-0').fill('Asha');
  await page.getByTestId('player-name-1').fill('Ben');
  await page.getByTestId('game-start').click();

  await expect(page.getByTestId('scoreboard')).toBeVisible();
  const names = ['Asha', 'Ben'];
  const expected = [
    { score: 0, streak: 0 },
    { score: 0, streak: 0 },
  ];
  const lines = 16;

  for (let i = 0; i < lines; i++) {
    const question = page.getByTestId('game-question');
    await expect(question).toBeVisible({ timeout: 6000 });
    const who = i % 2;
    await expect(question).toContainText(`${names[who]}'s turn · line ${i + 1} of ${lines}`);
    // The upcoming line is hidden while guessing: weather shows the idle note, not the line.
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'false');

    // Alternate between the first and last option so we get a mix of right and wrong answers.
    const options = question.locator('[data-testid^="guess-"]');
    await expect(options).toHaveCount(4);
    await options.nth(i % 3 === 0 ? 0 : 3).click();

    const reveal = page.getByTestId('game-reveal');
    await expect(reveal).toBeVisible();
    const correct = (await reveal.getAttribute('data-correct')) === 'true';
    const p = expected[who];
    if (correct) {
      await expect(page.getByTestId('reveal-result')).toContainText(`Correct! +${pointsFor(p.streak)}`);
      p.score += pointsFor(p.streak);
      p.streak++;
    } else {
      await expect(page.getByTestId('reveal-result')).toContainText('Not quite');
      p.streak = 0;
    }
    await expect(page.getByTestId(`score-value-${who}`)).toHaveText(String(p.score));
    // The revealed line is playing now.
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'true');
    // Skip ahead. If the revealed line already finished by itself, the next question
    // (or the results) has replaced this panel, which is also correct behaviour.
    await page
      .getByTestId('game-next')
      .click({ force: true, timeout: 2500 })
      .catch(() => undefined);
  }

  const results = page.getByTestId('game-results');
  await expect(results).toBeVisible();
  await expect(results.getByTestId('result-row')).toHaveCount(2);
  const rows = await results.getByTestId('result-row').allTextContents();
  for (let k = 0; k < 2; k++) {
    expect(rows.some((r) => r.includes(names[k]) && r.includes(String(expected[k].score)))).toBe(true);
  }
  await expect(results).toContainText('16 lines guessed');

  // Play again resets the scores.
  await page.getByTestId('play-again').click();
  await expect(page.getByTestId('score-value-0')).toHaveText('0');
  await expect(page.getByTestId('game-question')).toBeVisible({ timeout: 6000 });
  await page.keyboard.press('1'); // keyboard guessing works too
  await expect(page.getByTestId('game-reveal')).toBeVisible();
  await page.getByTestId('open-game').click(); // End game
  await expect(page.getByTestId('scoreboard')).toHaveCount(0);
});
