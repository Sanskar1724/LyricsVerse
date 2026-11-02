import { describe, expect, it } from 'vitest';
import { cleanNames, gameReducer, initialGame, makeOptions, pointsFor, rankPlayers, type GameState } from '../../src/lib/game';
import { EMOTIONS } from '../../src/types';

function ask(s: GameState, lineIndex: number, correct = 'joy' as const) {
  return gameReducer(s, { type: 'ask', lineIndex, correctEmotion: correct, options: makeOptions(correct, lineIndex) });
}

describe('game scoring', () => {
  it('scores with a growing streak bonus that caps', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(pointsFor)).toEqual([100, 125, 150, 175, 200, 200, 200]);
  });

  it('plays a 2-player round with turns, streaks and resets', () => {
    let s = gameReducer(initialGame, { type: 'start', names: ['Asha', 'Ben'] });
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => p.name)).toEqual(['Asha', 'Ben']);

    // Asha correct
    s = ask(s, 0);
    expect(s.phase).toBe('question');
    s = gameReducer(s, { type: 'guess', emotion: 'joy' });
    expect(s.phase).toBe('reveal');
    expect(s.last).toMatchObject({ correct: true, points: 100, playerIndex: 0 });
    s = gameReducer(s, { type: 'continue' });
    expect(s.turn).toBe(1);

    // Ben wrong
    s = ask(s, 1);
    s = gameReducer(s, { type: 'guess', emotion: 'anger' });
    expect(s.last).toMatchObject({ correct: false, points: 0, playerIndex: 1, correctEmotion: 'joy' });
    s = gameReducer(s, { type: 'continue' });

    // Asha correct again: streak 2 → 125 points
    s = ask(s, 2);
    s = gameReducer(s, { type: 'guess', emotion: 'joy' });
    expect(s.last?.points).toBe(125);
    s = gameReducer(s, { type: 'continue' });

    // Ben correct (his streak was reset)
    s = ask(s, 3);
    s = gameReducer(s, { type: 'guess', emotion: 'joy' });
    expect(s.last?.points).toBe(100);

    const [asha, ben] = s.players;
    expect(asha).toMatchObject({ score: 225, streak: 2, bestStreak: 2, correct: 2, answered: 2 });
    expect(ben).toMatchObject({ score: 100, streak: 1, bestStreak: 1, correct: 1, answered: 2 });
    expect(s.answeredLines).toEqual([0, 1, 2, 3]);

    s = gameReducer(s, { type: 'finish' });
    expect(s.phase).toBe('finished');
    expect(rankPlayers(s.players)[0].name).toBe('Asha');
  });

  it('never asks the same line twice and ignores out-of-phase actions', () => {
    let s = gameReducer(initialGame, { type: 'start', names: ['Solo'] });
    expect(gameReducer(s, { type: 'guess', emotion: 'joy' })).toBe(s); // no question yet
    expect(gameReducer(s, { type: 'continue' })).toBe(s);
    s = ask(s, 0);
    expect(ask(s, 1)).toBe(s); // already asking
    s = gameReducer(s, { type: 'guess', emotion: 'joy' });
    expect(gameReducer(s, { type: 'guess', emotion: 'joy' })).toBe(s); // double click
    s = gameReducer(s, { type: 'continue' });
    expect(s.turn).toBe(0); // single player keeps the turn
    expect(ask(s, 0)).toBe(s); // line 0 already answered
    expect(gameReducer(initialGame, { type: 'finish' })).toBe(initialGame);
    expect(gameReducer(s, { type: 'quit' })).toEqual(initialGame);
  });

  it('cleans player names and limits to 4 players', () => {
    expect(cleanNames(['  ', 'Zoe', '', 'Kai', 'Extra'])).toEqual(['Player 1', 'Zoe', 'Player 3', 'Kai']);
    expect(cleanNames([])).toEqual(['Player 1']);
    expect(cleanNames(['x'.repeat(50)])[0]).toHaveLength(20);
  });

  it('offers 4 distinct, deterministic options including the answer', () => {
    for (const e of EMOTIONS) {
      for (let seed = 0; seed < 20; seed++) {
        const o = makeOptions(e, seed);
        expect(o).toHaveLength(4);
        expect(new Set(o).size).toBe(4);
        expect(o).toContain(e);
        expect(makeOptions(e, seed)).toEqual(o);
      }
    }
  });

  it('ranks ties by correct answers then name', () => {
    const base = { streak: 0, bestStreak: 0, answered: 3 };
    const r = rankPlayers([
      { name: 'B', score: 100, correct: 1, ...base },
      { name: 'A', score: 100, correct: 1, ...base },
      { name: 'C', score: 300, correct: 2, ...base },
    ]);
    expect(r.map((p) => p.name)).toEqual(['C', 'A', 'B']);
  });
});
