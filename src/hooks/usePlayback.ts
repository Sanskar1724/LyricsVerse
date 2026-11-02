import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '../types';
import { lastStartedIndex } from '../lib/lyrics';
import type { Player } from '../lib/player';
import { useRaf } from './useRaf';

export interface PlaybackState {
  /** Seconds, refreshed ~10×/s for display. Read player.currentTime for frame-accurate time. */
  time: number;
  /** Index of the last line that has started. */
  index: number;
  playing: boolean;
}

/**
 * Follows a Player and re-renders only when the line changes, play state changes, or ~10×/s for the clock.
 * `beforeFrame` runs first in the same frame, so state it sets (e.g. a game pause) renders together with the new line.
 */
export function usePlayback(player: Player, lines: LyricLine[], beforeFrame?: () => void): PlaybackState {
  const [state, setState] = useState<PlaybackState>(() => ({
    time: player.currentTime,
    index: lastStartedIndex(lines, player.currentTime),
    playing: player.playing,
  }));
  const lastTimeUpdate = useRef(0);
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    const sync = () => {
      const t = player.currentTime;
      setState({ time: t, index: lastStartedIndex(lines, t), playing: player.playing });
    };
    sync();
    return player.on(sync);
  }, [player, lines]);

  useRaf((now) => {
    player.tick();
    beforeFrame?.();
    const t = player.currentTime;
    const index = lastStartedIndex(lines, t);
    const prev = current.current;
    if (index !== prev.index || player.playing !== prev.playing || now - lastTimeUpdate.current > 100) {
      lastTimeUpdate.current = now;
      if (index !== prev.index || player.playing !== prev.playing || Math.abs(t - prev.time) > 0.05) {
        setState({ time: t, index, playing: player.playing });
      }
    }
  });

  return state;
}
