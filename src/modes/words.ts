import type { LyricLine, Song } from '../types';
import { syntheticGrid, type BeatGrid } from '../lib/beats';
import { countSyllables } from '../lib/autosync';

export interface WordTime {
  text: string;
  start: number;
  end: number;
}

/** Roughly how long one syllable takes when sung. Used to cap a line's sung part when it's followed by a pause. */
const SECONDS_PER_SYLLABLE = 0.34;

/**
 * Estimate when each word of a line is sung: the sung part of the line is shared out by syllables.
 * Lines whose `end` runs into an instrumental gap are capped so words don't crawl through the silence.
 */
export function wordTimes(line: LyricLine): WordTime[] {
  const words = line.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const syll = words.map((w) => countSyllables(w));
  const total = syll.reduce((s, x) => s + x, 0);
  const span = Math.max(0.4, Math.min(line.end - line.start, total * SECONDS_PER_SYLLABLE + 0.4) * 0.95);
  let t = line.start;
  return words.map((text, i) => {
    const d = (syll[i] / total) * span;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
}

/** Small deterministic random generator, so a line always gets the same layout. */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** The song's beat map, or a steady grid matching the silent player's pulse. */
export function beatGridFor(song: Song): BeatGrid {
  return song.beats ?? syntheticGrid(song.duration);
}
