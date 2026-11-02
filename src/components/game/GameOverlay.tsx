import type { CSSProperties } from 'react';
import type { Song } from '../../types';
import type { GameState } from '../../lib/game';
import { pointsFor } from '../../lib/game';
import { EMOTION_STYLES } from '../../lib/emotions';

interface Props {
  game: GameState;
  song: Song;
  onGuess: (e: GameState['options'][number]) => void;
  onNext: () => void;
  onQuit: () => void;
}

export function Scoreboard({ game }: { game: GameState }) {
  return (
    <div className="scoreboard" data-testid="scoreboard" aria-label="Scoreboard">
      {game.players.map((p, i) => (
        <div key={i} className={`score-pill ${i === game.turn && game.phase !== 'finished' ? 'turn' : ''}`} data-testid={`score-${i}`}>
          <span className="score-name">{p.name}</span>
          <span className="score-value" data-testid={`score-value-${i}`}>
            {p.score}
          </span>
          {p.streak > 1 && <span className="score-streak">🔥{p.streak}</span>}
        </div>
      ))}
    </div>
  );
}

export function GameOverlay({ game, song, onGuess, onNext, onQuit }: Props) {
  const player = game.players[game.turn];

  if (game.phase === 'question' && player) {
    return (
      <div className="game-question-backdrop">
        <div className="game-question card" role="dialog" aria-label="Guess the feeling" data-testid="game-question">
          <div className="turn-label">
            🎤 <strong>{player.name}</strong>'s turn · line {game.lineIndex + 1} of {song.lines.length}
          </div>
          <h2>How will the next line feel?</h2>
          <p className="muted small">
            Worth {pointsFor(player.streak)} points{player.streak > 0 ? ` (🔥 streak ${player.streak})` : ''}. Press 1–4 or click.
          </p>
          <div className="guess-grid">
            {game.options.map((e, i) => {
              const st = EMOTION_STYLES[e];
              return (
                <button
                  key={e}
                  className="guess-btn"
                  style={{ '--emo': st.color } as CSSProperties}
                  onClick={() => onGuess(e)}
                  data-testid={`guess-${e}`}
                  data-option={i}
                >
                  <span className="guess-key">{i + 1}</span>
                  <span className="guess-emoji">{st.emoji}</span>
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>
          <button className="btn link small" onClick={onQuit}>
            Quit game
          </button>
        </div>
      </div>
    );
  }

  if (game.phase === 'reveal' && game.last) {
    const last = game.last;
    const st = EMOTION_STYLES[last.correctEmotion];
    const guessed = EMOTION_STYLES[last.guess];
    const line = song.lines[game.lineIndex];
    const isLast = game.lineIndex >= song.lines.length - 1;
    return (
      <div
        className={`game-reveal ${last.correct ? 'correct' : 'wrong'}`}
        style={{ '--emo': st.color } as CSSProperties}
        data-testid="game-reveal"
        data-correct={last.correct}
      >
        {last.correct && (
          <div className="confetti" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        )}
        <div className="reveal-result" data-testid="reveal-result">
          {last.correct ? (
            <>
              ✅ Correct! <strong>+{last.points}</strong>
            </>
          ) : (
            <>
              ❌ Not quite. You said {guessed.emoji} {guessed.label}
            </>
          )}
        </div>
        <p className="reveal-line" dir="auto">
          {line?.text}
        </p>
        <div className="reveal-emotion">
          It's {st.emoji} <strong>{st.label}</strong>
        </div>
        <div className="reveal-actions">
          <button className="btn small" onClick={onNext} data-testid="game-next">
            {isLast ? 'See results 🏆' : 'Next line ⏭'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
