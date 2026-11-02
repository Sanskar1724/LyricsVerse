import type { CSSProperties } from 'react';
import type { Song } from '../types';
import { formatTime } from '../lib/lyrics';
import { EMOTION_STYLES } from '../lib/emotions';

interface Props {
  song: Song;
  time: number;
  index: number;
  playing: boolean;
  rate: number;
  disabled?: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onRate: (r: number) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Transport({ song, time, index, playing, rate, disabled, onToggle, onSeek, onPrev, onNext, onRate }: Props) {
  const an = index >= 0 ? song.analysis.lines[index] : null;
  const st = an ? EMOTION_STYLES[an.emotion] : null;
  const pct = song.duration > 0 ? (time / song.duration) * 100 : 0;

  return (
    <div className="transport" data-testid="transport">
      <div className="transport-buttons">
        <button className="icon-btn" onClick={onPrev} disabled={disabled} aria-label="Previous line" title="Previous line (←)">
          ⏮
        </button>
        <button
          className="icon-btn play"
          onClick={onToggle}
          disabled={disabled}
          aria-label={playing ? 'Pause' : 'Play'}
          title="Play / pause (Space)"
          data-testid="play-toggle"
          data-playing={playing}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button className="icon-btn" onClick={onNext} disabled={disabled} aria-label="Next line" title="Next line (→)" data-testid="next-line">
          ⏭
        </button>
      </div>
      <div className="seek">
        <span className="time" data-testid="time">
          {formatTime(time)}
        </span>
        <div className="seek-track" style={{ '--pct': `${pct}%` } as CSSProperties}>
          {song.vocals?.map((v, i) => (
            <span
              key={`v${i}`}
              className="seek-vocal"
              style={{ left: `${(v.start / song.duration) * 100}%`, width: `${((v.end - v.start) / song.duration) * 100}%` }}
              aria-hidden
            />
          ))}
          {song.lines.length <= 400 &&
            song.lines.map((l, i) => (
              <span
                key={l.id}
                className="seek-tick"
                style={{ left: `${(l.start / song.duration) * 100}%`, background: EMOTION_STYLES[song.analysis.lines[i].emotion].color }}
                aria-hidden
              />
            ))}
          <input
            type="range"
            min={0}
            max={song.duration}
            step={0.1}
            value={Math.min(time, song.duration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            aria-label="Seek"
            disabled={disabled}
            data-testid="seek"
          />
        </div>
        <span className="time muted">{formatTime(song.duration)}</span>
      </div>
      <div className="transport-right">
        {st && (
          <span className="mood-chip" style={{ '--emo': st.color } as CSSProperties} data-testid="mood-chip">
            {st.emoji} {st.label} <span className="muted">{Math.round((an?.intensity ?? 0) * 100)}%</span>
          </span>
        )}
        <label className="rate">
          <span className="sr-only">Speed</span>
          <select value={rate} onChange={(e) => onRate(parseFloat(e.target.value))} aria-label="Playback speed">
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
