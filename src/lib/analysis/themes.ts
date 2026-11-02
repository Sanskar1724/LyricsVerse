import { THEMES, type Emotion, type Theme, type ThemeScore } from '../../types';
import { THEME_KEYWORDS } from './lexicon';

const MIN_THEME_SCORE = 1.5;
const MAX_THEMES = 4;

function countKeyword(textLower: string, words: string[], keyword: string): number {
  if (keyword.includes(' ')) {
    let n = 0;
    let i = textLower.indexOf(keyword);
    while (i !== -1) {
      n++;
      i = textLower.indexOf(keyword, i + keyword.length);
    }
    return n;
  }
  let n = 0;
  for (const w of words) if (w === keyword || w === keyword + 's') n++;
  return n;
}

/**
 * Score themes from keyword groups, then nudge with the emotion mix
 * (e.g. lots of sadness + some love reads as heartbreak).
 * Returns the themes that clear a minimum score, strongest first, scored 0–1.
 */
export function detectThemes(lines: string[], breakdown: Record<Emotion, number>): ThemeScore[] {
  const text = lines.join('\n').toLowerCase();
  const words = text.match(/[\p{L}\p{M}']+/gu) ?? [];
  const raw = {} as Record<Theme, number>;
  for (const theme of THEMES) {
    raw[theme] = 0;
    for (const kw of THEME_KEYWORDS[theme]) raw[theme] += countKeyword(text, words, kw);
  }

  const pct = (e: Emotion) => (breakdown[e] ?? 0) / 100;
  raw.heartbreak += pct('sadness') * 3 + (pct('sadness') > 0.12 && pct('love') + pct('longing') > 0.12 ? 1.5 : 0);
  raw.hope += pct('hope') * 4;
  raw.love += pct('love') * 4;
  raw.party += pct('joy') * 2.5;
  raw.struggle += (pct('anger') + pct('fear')) * 3;
  raw.nostalgia += pct('longing') * 4;
  raw.freedom += pct('joy') * 1 + pct('hope') * 1;

  const max = Math.max(...THEMES.map((t) => raw[t]));
  if (max < MIN_THEME_SCORE) return [];
  return THEMES.filter((t) => raw[t] >= MIN_THEME_SCORE)
    .sort((a, b) => raw[b] - raw[a])
    .slice(0, MAX_THEMES)
    .map((theme) => ({ theme, score: Math.round((raw[theme] / max) * 100) / 100 }));
}
