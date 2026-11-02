import type { ModeDefinition } from './types';
import { BeatStarsMode } from './BeatStarsMode';
import { KineticMode } from './KineticMode';
import { KaraokeMode } from './KaraokeMode';
import { TunnelMode } from './TunnelMode';

/**
 * All display modes, in menu order. To add one, write a component that takes ModeProps and add an entry here.
 */
export const MODES: ModeDefinition[] = [
  { id: 'stars', label: 'Stars', icon: '✨', hotkey: '1', backdrop: 'dark', description: 'Words pop in as stars on the beat, seven at a time', Component: BeatStarsMode },
  { id: 'kinetic', label: 'Kinetic', icon: '🔠', hotkey: '2', backdrop: 'vivid', description: 'Every line gets its own font, entrance and colours', Component: KineticMode },
  { id: 'karaoke', label: 'Karaoke', icon: '🎤', hotkey: '3', backdrop: 'vivid', description: 'Sing along: words fill as they are sung', Component: KaraokeMode },
  { id: 'tunnel', label: 'Tunnel', icon: '🌀', hotkey: '4', backdrop: 'dark', description: 'Fly through a tunnel of light', Component: TunnelMode },
];

export function findMode(id: string): ModeDefinition {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
