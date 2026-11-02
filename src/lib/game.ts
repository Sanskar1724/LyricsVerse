import { EMOTIONS, type Emotion } from '../types';

export const MAX_PLAYERS = 4;
export const BASE_POINTS = 100;
export const STREAK_BONUS = 25;
export const MAX_STREAK_BONUS_STEPS = 4;

export interface PlayerScore {
  name: string;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
}

export interface LastGuess {
  playerIndex: number;
  guess: Emotion;
  correctEmotion: Emotion;
  correct: boolean;
  points: number;
}

export type GamePhase = 'off' | 'playing' | 'question' | 'reveal' | 'finished';

export interface GameState {
  phase: GamePhase;
  players: PlayerScore[];
  /** Whose turn it is. */
  turn: number;
  /** Line being guessed / revealed. */
  lineIndex: number;
  options: Emotion[];
  correctEmotion: Emotion | null;
  answeredLines: number[];
  last: LastGuess | null;
}

export type GameAction =
  | { type: 'start'; names: string[] }
  | { type: 'ask'; lineIndex: number; correctEmotion: Emotion; options: Emotion[] }
  | { type: 'guess'; emotion: Emotion }
  | { type: 'continue' }
  | { type: 'finish' }
  | { type: 'quit' };

export const initialGame: GameState = {
  phase: 'off',
  players: [],
  turn: 0,
  lineIndex: -1,
  options: [],
  correctEmotion: null,
  answeredLines: [],
  last: null,
};

/** Points for a correct answer, given the streak before it: 100, 125, 150, 175, 200, 200… */
export function pointsFor(streakBefore: number): number {
  return BASE_POINTS + Math.min(streakBefore, MAX_STREAK_BONUS_STEPS) * STREAK_BONUS;
}

export function cleanNames(names: string[]): string[] {
  const list = names.slice(0, MAX_PLAYERS).map((n, i) => n.trim().slice(0, 20) || `Player ${i + 1}`);
  return list.length ? list : ['Player 1'];
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      return {
        ...initialGame,
        phase: 'playing',
        players: cleanNames(action.names).map((name) => ({ name, score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0 })),
      };
    case 'ask':
      if (state.phase !== 'playing' || state.answeredLines.includes(action.lineIndex)) return state;
      return {
        ...state,
        phase: 'question',
        lineIndex: action.lineIndex,
        options: action.options,
        correctEmotion: action.correctEmotion,
        last: null,
      };
    case 'guess': {
      if (state.phase !== 'question' || !state.correctEmotion) return state;
      const p = state.players[state.turn];
      const correct = action.emotion === state.correctEmotion;
      const points = correct ? pointsFor(p.streak) : 0;
      const streak = correct ? p.streak + 1 : 0;
      const updated: PlayerScore = {
        ...p,
        score: p.score + points,
        streak,
        bestStreak: Math.max(p.bestStreak, streak),
        correct: p.correct + (correct ? 1 : 0),
        answered: p.answered + 1,
      };
      return {
        ...state,
        phase: 'reveal',
        players: state.players.map((x, i) => (i === state.turn ? updated : x)),
        answeredLines: [...state.answeredLines, state.lineIndex],
        last: { playerIndex: state.turn, guess: action.emotion, correctEmotion: state.correctEmotion, correct, points },
      };
    }
    case 'continue':
      if (state.phase !== 'reveal') return state;
      return { ...state, phase: 'playing', turn: (state.turn + 1) % state.players.length };
    case 'finish':
      if (state.phase === 'off') return state;
      return { ...state, phase: 'finished' };
    case 'quit':
      return initialGame;
  }
}

export function rankPlayers(players: PlayerScore[]): PlayerScore[] {
  return [...players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
}

/** Small deterministic PRNG so the same line always offers the same choices. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Four distinct choices including the correct one, shuffled. */
export function makeOptions(correct: Emotion, seed: number, count = 4): Emotion[] {
  const rand = mulberry32(seed * 7919 + EMOTIONS.indexOf(correct));
  const others = EMOTIONS.filter((e) => e !== correct);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const picks = [correct, ...others.slice(0, count - 1)];
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}
