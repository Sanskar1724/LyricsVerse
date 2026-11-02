import { rankPlayers, type GameState } from '../../lib/game';
import { Modal } from '../Modal';

interface Props {
  game: GameState;
  onPlayAgain: () => void;
  onShowDna: () => void;
  onClose: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉', '🎖️'];

export function GameResults({ game, onPlayAgain, onShowDna, onClose }: Props) {
  const ranked = rankPlayers(game.players);
  const winner = ranked[0];
  const tie = ranked.length > 1 && ranked[1].score === winner.score;

  return (
    <Modal title="🏆 Results" onClose={onClose} className="game-results">
      <div data-testid="game-results">
        <p className="results-headline">
          {ranked.length === 1
            ? `You scored ${winner.score} points!`
            : tie
              ? "It's a tie at the top! 🤝"
              : `${winner.name} wins with ${winner.score} points! 🎉`}
        </p>
        <table className="results-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Score</th>
              <th scope="col">Correct</th>
              <th scope="col">Best streak</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.name + i} data-testid="result-row">
                <td>{MEDALS[i] ?? i + 1}</td>
                <td>{p.name}</td>
                <td className="num">{p.score}</td>
                <td className="num">
                  {p.correct}/{p.answered}
                  {p.answered > 0 && <span className="muted small"> ({Math.round((p.correct / p.answered) * 100)}%)</span>}
                </td>
                <td className="num">{p.bestStreak > 0 ? `🔥 ${p.bestStreak}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">{game.answeredLines.length} lines guessed.</p>
        <div className="modal-actions">
          <button className="btn primary" onClick={onPlayAgain} data-testid="play-again">
            Play again
          </button>
          <button className="btn" onClick={onShowDna}>
            🧬 Song DNA
          </button>
          <button className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
