import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import type { Player } from '../lib/player';
import { formatTime, linesFromStarts } from '../lib/lyrics';

interface Props {
  lines: LyricLine[];
  player: Player;
  onSave: (lines: LyricLine[]) => void;
  onCancel: () => void;
}

/**
 * Tap to sync: play the song from the top and press Space as each line begins.
 * Backspace undoes the last tap; Esc cancels.
 */
export function TapSync({ lines, player, onSave, onCancel }: Props) {
  const [phase, setPhase] = useState<'ready' | 'tapping' | 'done'>('ready');
  const [taps, setTaps] = useState<number[]>([]);
  const tapsRef = useRef(taps);
  tapsRef.current = taps;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  function begin() {
    setTaps([]);
    player.pause();
    player.seek(0);
    setPhase('tapping');
    void player.play();
  }

  function tap() {
    const prev = tapsRef.current;
    if (prev.length >= lines.length) return;
    const t = Math.max(player.currentTime, (prev[prev.length - 1] ?? -0.1) + 0.1);
    const next = [...prev, Math.round(t * 1000) / 1000];
    tapsRef.current = next;
    setTaps(next);
    if (next.length === lines.length) {
      setPhase('done');
      player.pause();
    }
  }

  function save() {
    const t = tapsRef.current;
    const duration = player.duration;
    // Lines that were never tapped get spread over the remaining time.
    const starts = [...t];
    const remaining = lines.length - starts.length;
    if (remaining > 0) {
      const from = starts.length ? starts[starts.length - 1] : 0;
      const step = Math.max(0.2, (duration - from) / (remaining + 1));
      for (let i = 1; i <= remaining; i++) starts.push(Math.min(duration - 0.05, from + step * i));
    }
    player.pause();
    onSave(
      linesFromStarts(
        lines.map((l) => l.text),
        starts,
        duration,
      ),
    );
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (phaseRef.current === 'ready') begin();
        else if (phaseRef.current === 'tapping') tap();
      } else if (e.key === 'Backspace' && phaseRef.current !== 'ready') {
        e.preventDefault();
        const next = tapsRef.current.slice(0, -1);
        tapsRef.current = next;
        setTaps(next);
        if (phaseRef.current === 'done') {
          setPhase('tapping');
        }
      } else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        player.pause();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const offEnded = player.on((ev) => {
      if (ev === 'ended' && phaseRef.current === 'tapping') setPhase('done');
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      offEnded();
    };
    // Handlers read refs, so binding once per player is intended.
  }, [player]);

  const nextLine = lines[taps.length];
  const prevLine = taps.length > 0 ? lines[taps.length - 1] : null;

  return (
    <div className="tapsync card" data-testid="tapsync">
      <div className="tapsync-head">
        <strong>⏱ Tap to sync</strong>
        <span className="muted small" data-testid="tap-progress">
          {taps.length} / {lines.length} lines
        </span>
      </div>
      <div className="tap-progress-bar" aria-hidden>
        <div style={{ width: `${(taps.length / Math.max(1, lines.length)) * 100}%` }} />
      </div>
      {phase === 'ready' && (
        <p>
          The song restarts from the beginning. Press <kbd>Space</kbd> the moment each line starts. <kbd>Backspace</kbd> undoes,{' '}
          <kbd>Esc</kbd> cancels.
        </p>
      )}
      {phase === 'tapping' && (
        <div className="tap-lines">
          {prevLine && (
            <div className="tap-prev muted small">
              ✓ {formatTime(taps[taps.length - 1])} · {prevLine.text}
            </div>
          )}
          <div className="tap-next" dir="auto">
            Next: <strong>{nextLine?.text}</strong>
          </div>
        </div>
      )}
      {phase === 'done' && (
        <p>
          {taps.length === lines.length ? '🎉 All lines tapped!' : `Song ended with ${lines.length - taps.length} line(s) untapped. They'll be spread over the rest.`}
        </p>
      )}
      <div className="tapsync-actions">
        {phase === 'ready' && (
          <button className="btn primary" onClick={begin} data-testid="tap-begin">
            Start (Space)
          </button>
        )}
        {phase === 'tapping' && (
          <button className="btn primary big" onClick={tap} data-testid="tap-button">
            Tap! (Space)
          </button>
        )}
        {(phase === 'done' || (phase === 'tapping' && taps.length > 0)) && (
          <button className="btn" onClick={save} data-testid="tap-save">
            Save timings
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            player.pause();
            onCancel();
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
