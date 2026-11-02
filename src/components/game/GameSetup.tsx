import { useState } from 'react';
import { MAX_PLAYERS } from '../../lib/game';
import { Modal } from '../Modal';

interface Props {
  initialNames: string[];
  onStart: (names: string[]) => void;
  onClose: () => void;
}

export function GameSetup({ initialNames, onStart, onClose }: Props) {
  const [names, setNames] = useState<string[]>(initialNames.length ? initialNames : ['']);

  return (
    <Modal title="🎮 Guess the Feeling" onClose={onClose} className="game-setup">
      <p className="muted">
        Before each line, the music pauses. Guess its emotion from four choices. Faster streaks earn bonus points. Take turns
        with up to {MAX_PLAYERS} players.
      </p>
      <div className="player-count" role="group" aria-label="Number of players">
        {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`chip-btn ${names.length === n ? 'active' : ''}`}
            onClick={() => setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''))}
            data-testid={`players-${n}`}
          >
            {n} {n === 1 ? 'player' : 'players'}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart(names);
        }}
      >
        <div className="name-fields">
          {names.map((name, i) => (
            <label key={i} className="field">
              <span>Player {i + 1}</span>
              <input
                value={name}
                maxLength={20}
                placeholder={`Player ${i + 1}`}
                onChange={(e) => setNames((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                data-testid={`player-name-${i}`}
                autoFocus={i === 0}
              />
            </label>
          ))}
        </div>
        <button className="btn primary big" type="submit" data-testid="game-start">
          Let's play ▶
        </button>
      </form>
    </Modal>
  );
}
