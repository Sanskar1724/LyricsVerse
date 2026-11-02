import { EMOTIONS, type Emotion, type LineAnalysis, type SongAnalysis } from '../../types';
import { emptyEmotionRecord } from '../emotions';
import { analyzeLines } from './lexiconAnalyzer';
import { detectThemes } from './themes';

/**
 * Anything that can turn lyric lines into a SongAnalysis.
 * The built-in one is an offline lexicon; an LLM-backed analyser only needs to implement this
 * (it is async on purpose) and be passed to `buildSong`.
 */
export interface LyricAnalyzer {
  readonly name: string;
  analyze(lines: string[]): Promise<SongAnalysis>;
}

/** Percentage of the song spent in each emotion, weighted by intensity so strong lines count more. */
export function emotionBreakdown(lines: LineAnalysis[]): Record<Emotion, number> {
  const totals = emptyEmotionRecord();
  let sum = 0;
  for (const l of lines) {
    const w = 0.3 + l.intensity;
    totals[l.emotion] += w;
    sum += w;
  }
  const out = emptyEmotionRecord();
  if (sum === 0) return out;
  for (const e of EMOTIONS) out[e] = Math.round((totals[e] / sum) * 1000) / 10;
  return out;
}

/** Build the song-level summary from per-line results. Shared by every analyser. */
export function summarize(analyzer: string, texts: string[], lines: LineAnalysis[]): SongAnalysis {
  const breakdown = emotionBreakdown(lines);
  let dominant: Emotion = 'calm';
  for (const e of EMOTIONS) if (breakdown[e] > breakdown[dominant]) dominant = e;
  let peakLine = -1;
  let peak = -1;
  lines.forEach((l, i) => {
    if (l.intensity > peak) {
      peak = l.intensity;
      peakLine = i;
    }
  });
  const averageIntensity = lines.length ? lines.reduce((s, l) => s + l.intensity, 0) / lines.length : 0;
  return {
    analyzer,
    lines,
    breakdown,
    dominant,
    themes: detectThemes(texts, breakdown),
    peakLine,
    averageIntensity: Math.round(averageIntensity * 100) / 100,
  };
}

export const lexiconAnalyzer: LyricAnalyzer = {
  name: 'lexicon-v1',
  async analyze(texts: string[]) {
    return summarize(this.name, texts, analyzeLines(texts));
  },
};

export { analyzeLine, analyzeLines, wordEmotion } from './lexiconAnalyzer';
export { detectThemes } from './themes';
