import type { BeatGrid } from './lib/beats';

export const EMOTIONS = ['joy', 'sadness', 'anger', 'love', 'longing', 'hope', 'fear', 'calm'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const THEMES = ['heartbreak', 'freedom', 'nostalgia', 'love', 'struggle', 'party', 'hope'] as const;
export type Theme = (typeof THEMES)[number];

/** A lyric line with timings in seconds. `end` is when the line stops being "current". */
export interface LyricLine {
  id: number;
  text: string;
  start: number;
  end: number;
}

/** How the line timings were produced. 'tapped' = set by hand (tap sync or the timing panel), 'auto' = auto-synced to the vocals. */
export type TimingSource = 'lrc' | 'spread' | 'tapped' | 'auto';

export interface WordAnalysis {
  text: string;
  /** Emotion carried by this word on its own, or null if it's neutral. */
  emotion: Emotion | null;
}

export interface LineAnalysis {
  emotion: Emotion;
  /** 0–1 */
  intensity: number;
  /** Raw (unnormalised) evidence per emotion. */
  scores: Record<Emotion, number>;
  /** 0 when no emotional words were found and the emotion was inferred. */
  confidence: number;
  words: WordAnalysis[];
}

export interface ThemeScore {
  theme: Theme;
  /** 0–1, relative to the strongest theme. */
  score: number;
}

export interface SongAnalysis {
  analyzer: string;
  lines: LineAnalysis[];
  /** Percentages, summing to ~100. */
  breakdown: Record<Emotion, number>;
  dominant: Emotion;
  themes: ThemeScore[];
  /** Index of the most emotionally intense line (-1 if no lines). */
  peakLine: number;
  averageIntensity: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  rawLyrics: string;
  lines: LyricLine[];
  timing: TimingSource;
  /** Seconds. For songs without audio this is a placeholder length. */
  duration: number;
  analysis: SongAnalysis;
  isSample?: boolean;
  /** Where singing was detected (seconds), from auto-sync. Shown on the seek bar. */
  vocals?: { start: number; end: number }[];
  /** Tempo and beat times found in the audio. Songs without audio use a steady synthetic grid. */
  beats?: BeatGrid;
  /** Friendly notes produced while parsing (e.g. "3 lines were out of order"). */
  warnings: string[];
}
