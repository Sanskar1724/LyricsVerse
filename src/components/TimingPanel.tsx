import { useRef, useState } from 'react';
import type { LyricLine } from '../types';
import type { Player } from '../lib/player';
import { adjustTiming, fitTiming, formatTime, NO_ADJUST, type TimingAdjust } from '../lib/lyrics';

interface Props {
  lines: LyricLine[];
  player: Player;
  /** Called on every change so the stage updates live. */
  onPreview: (lines: LyricLine[]) => void;
  onDone: (lines: LyricLine[]) => void;
  onCancel: (original: LyricLine[]) => void;
  /** Present when the song has an audio file that auto-sync can analyse. */
  onAutoSync?: () => void;
  syncing?: boolean;
}

const PACE_STEP = 0.05;
const SHIFT_STEP = 0.25;

/**
 * Fix lyrics that run too fast, too slow, too early or too late, while the song plays.
 * All changes are relative to the timings the panel was opened with, so Cancel restores them exactly.
 */
export function TimingPanel({ lines, player, onPreview, onDone, onCancel, onAutoSync, syncing }: Props) {
  const base = useRef(lines).current;
  const [adj, setAdj] = useState<TimingAdjust>(NO_ADJUST);
  const [firstAt, setFirstAt] = useState<number | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);

  const apply = (next: TimingAdjust) => {
    setAdj(next);
    onPreview(adjustTiming(base, next, player.duration));
  };

  const pace = Math.round(100 / adj.stretch);
  const changed = adj.offset !== 0 || adj.stretch !== 1;

  return (
    <div className="tapsync timing-panel card" data-testid="timing-panel">
      <div className="tapsync-head">
        <strong>🎚 Adjust timing</strong>
        <span className="muted small">Changes apply live: keep the song playing while you tweak.</span>
      </div>

      <div className="timing-row">
        <span className="timing-label">Lyrics pace</span>
        <button className="btn small" onClick={() => apply({ ...adj, stretch: Math.min(4, adj.stretch + PACE_STEP) })} data-testid="pace-slower">
          🐢 Slower
        </button>
        <span className="timing-value" data-testid="pace-value">
          {pace}%
        </span>
        <button
          className="btn small"
          onClick={() => apply({ ...adj, stretch: Math.max(0.25, adj.stretch - PACE_STEP) })}
          data-testid="pace-faster"
        >
          🐇 Faster
        </button>
      </div>

      <div className="timing-row">
        <span className="timing-label">Shift all lines</span>
        <button className="btn small" onClick={() => apply({ ...adj, offset: adj.offset - SHIFT_STEP })} data-testid="shift-earlier">
          ◀ Earlier
        </button>
        <span className="timing-value" data-testid="shift-value">
          {adj.offset >= 0 ? '+' : '−'}
          {Math.abs(adj.offset).toFixed(2)}s
        </span>
        <button className="btn small" onClick={() => apply({ ...adj, offset: adj.offset + SHIFT_STEP })} data-testid="shift-later">
          Later ▶
        </button>
      </div>

      {onAutoSync && (
        <div className="timing-quickfit">
          <button className="btn primary small" onClick={onAutoSync} disabled={syncing} data-testid="autosync-run">
            {syncing ? '🎧 Listening…' : '✨ Auto-sync to the singing'}
          </button>
          <span className="muted small"> Finds the vocals in your audio and lines every lyric up with them.</span>
        </div>
      )}

      <div className="timing-quickfit">
        <div className="muted small">
          <strong>Quick fit:</strong> play the song, click ① when the singer starts “{base[0]?.text}”, and ② when the last line
          begins.
        </div>
        <div className="tapsync-actions">
          <button
            className="btn primary small"
            onClick={() => {
              const t = player.currentTime;
              setFirstAt(t);
              apply(fitTiming(base, t, lastAt, adj.stretch));
            }}
            data-testid="fit-first"
          >
            ① First line starts now{firstAt !== null ? ` (${formatTime(firstAt)})` : ''}
          </button>
          <button
            className="btn small"
            onClick={() => {
              const t = player.currentTime;
              const first = firstAt ?? base[0].start + adj.offset;
              setLastAt(t);
              apply(fitTiming(base, first, t, adj.stretch));
            }}
            disabled={base.length < 2}
            data-testid="fit-last"
          >
            ② Last line starts now{lastAt !== null ? ` (${formatTime(lastAt)})` : ''}
          </button>
        </div>
      </div>

      <div className="tapsync-actions">
        <button className="btn primary" onClick={() => onDone(adjustTiming(base, adj, player.duration))} data-testid="timing-done">
          ✓ Done
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setFirstAt(null);
            setLastAt(null);
            apply(NO_ADJUST);
          }}
          disabled={!changed}
        >
          Reset
        </button>
        <button className="btn ghost" onClick={() => onCancel(base)} data-testid="timing-cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}
