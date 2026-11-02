import type { ComponentType } from 'react';
import type { Song } from '../types';
import type { Player } from '../lib/player';
import type { LineLook } from '../lib/looks';
import type { BackdropTone } from './Backdrop';

/**
 * Everything a display mode gets. Modes read `player.currentTime` and `player.sampleEnergy()`
 * inside their own animation loop, so they don't need React re-renders per frame.
 * Each mode must cancel its animation frames and observers on unmount.
 */
export interface ModeProps {
  song: Song;
  /** Line currently on display (-1 before the first line). During the game, the upcoming line is held back. */
  index: number;
  player: Player;
  /** A random look per line (font, entrance, palette…), fresh every session. */
  looks: LineLook[];
}

export interface ModeDefinition {
  id: string;
  label: string;
  icon: string;
  /** Keyboard shortcut (a single key). */
  hotkey: string;
  description: string;
  /** How bold the shared background should be behind this mode. */
  backdrop: BackdropTone;
  Component: ComponentType<ModeProps>;
}
