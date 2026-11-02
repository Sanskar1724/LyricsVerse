import { EMOTIONS, type Emotion, type LineAnalysis, type WordAnalysis } from '../../types';
import { emptyEmotionRecord } from '../emotions';
import { DOWNTONERS, EMOJI_LEXICON, INTENSIFIERS, LEXICON, NEGATION_FLIP, NEGATORS } from './lexicon';

/** How many following words a negator reaches. */
const NEGATION_WINDOW = 3;
/** Negated words count for less than direct ones ("not happy" is weaker than "sad"). */
const NEGATION_FACTOR = 0.7;
const CLAUSE_BREAK = /[,.;:!?…—–()"“”]+|\s-\s|\bbut\b|\bthough\b|\byet\b|\bpar\b|(?:^|\s)लेकिन(?=\s|$)/giu;
const WORD = /[\p{L}\p{M}\p{N}']+/gu;
const EMOJI = /\p{Extended_Pictographic}(?:️)?/gu;
/** Words that, between "never" and an emotion word, make "never" an intensifier: "never felt SO lost". */
const NEVER_AMPLIFIERS = new Set(['so', 'soo', 'such', 'this', 'that', 'more', 'as']);

export function normalizeToken(token: string): string {
  return token
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/^'+|'+$/g, '')
    .replace(/(\p{L})\1{2,}/gu, '$1$1'); // "sooooo" → "soo"
}

function toMap(dict: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(dict).map(([k, v]) => [k.normalize('NFC'), v]));
}

const LEX = Object.fromEntries(EMOTIONS.map((e) => [e, toMap(LEXICON[e])])) as Record<Emotion, Map<string, number>>;
const INTENSIFY = toMap(INTENSIFIERS);
const DOWNTONE = toMap(DOWNTONERS);
const NEGATE = new Set([...NEGATORS].map((n) => n.normalize('NFC')));
/** Hindi negators come after the word they negate: "ख़ुशी नहीं" = "not happiness". */
const POST_NEGATORS = new Set(['nahi', 'nahin', 'नहीं', 'ना', 'न'].map((n) => n.normalize('NFC')));

const SUFFIXES = ['ing', 'ed', 'es', 's', 'ly', 'ness', 'ful', "'s", "'re", "'ll", "'m", "'ve", "'d"];

/** Look a token up in one emotion lexicon, trying a few cheap stems ("laughing" → "laugh"). */
function lookupIn(dict: Map<string, number>, token: string): number {
  const direct = dict.get(token);
  if (direct !== undefined) return direct;
  for (const suf of SUFFIXES) {
    if (token.length > suf.length + 2 && token.endsWith(suf)) {
      const stem = token.slice(0, -suf.length);
      const hit = dict.get(stem) ?? dict.get(stem + 'e');
      if (hit !== undefined) return hit;
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        const dbl = dict.get(stem.slice(0, -1));
        if (dbl !== undefined) return dbl;
      }
    }
  }
  return 0;
}

/** Strongest emotion a single word carries, or null. */
export function wordEmotion(rawWord: string): { emotion: Emotion; weight: number } | null {
  const emojis = rawWord.match(EMOJI);
  if (emojis) {
    for (const e of emojis) {
      const hit = EMOJI_LEXICON[e] ?? EMOJI_LEXICON[e.replace(/️/g, '')];
      if (hit) return { emotion: hit[0], weight: hit[1] };
    }
  }
  const tokens = rawWord.match(WORD);
  if (!tokens) return null;
  let best: { emotion: Emotion; weight: number } | null = null;
  for (const t of tokens) {
    const tok = normalizeToken(t);
    for (const e of EMOTIONS) {
      const w = lookupIn(LEX[e], tok);
      if (w > 0 && (!best || w > best.weight)) best = { emotion: e, weight: w };
    }
  }
  return best;
}

function intensityFromScore(score: number): number {
  return 1 - Math.exp(-score * 0.9);
}

export interface AnalyzeOptions {
  /** Emotion of the previous line, used when a line has no emotional words. */
  previous?: LineAnalysis | null;
}

export function analyzeLine(text: string, opts: AnalyzeOptions = {}): LineAnalysis {
  const scores = emptyEmotionRecord();
  const trimmed = text.trim();
  const words: WordAnalysis[] = trimmed
    ? trimmed.split(/\s+/).map((w) => ({ text: w, emotion: wordEmotion(w)?.emotion ?? null }))
    : [];

  if (!trimmed) {
    return { emotion: 'calm', intensity: 0, scores, confidence: 0, words };
  }

  let lineBoost = 1;
  if (/!/.test(trimmed)) lineBoost *= 1.2;

  // Emojis anywhere on the line.
  for (const e of trimmed.match(EMOJI) ?? []) {
    const hit = EMOJI_LEXICON[e] ?? EMOJI_LEXICON[e.replace(/️/g, '')];
    if (hit) scores[hit[0]] += hit[1];
  }

  const clauses = trimmed.split(CLAUSE_BREAK);
  for (const clause of clauses) {
    const rawTokens = clause.match(WORD) ?? [];
    let negateLeft = 0;
    let negatorWasNever = false;
    let neverAmplified = false;
    let multiplier = 1;
    let multiplierLeft = 0;
    let lastHit: { emotion: Emotion; weight: number; ago: number; negated: boolean } | null = null;

    for (const raw of rawTokens) {
      if (lastHit) lastHit.ago++;
      const tok = normalizeToken(raw);
      const isCaps = raw.length >= 3 && raw === raw.toUpperCase() && raw !== raw.toLowerCase();
      const elongated = /(\p{L})\1{2,}/u.test(raw);

      if (POST_NEGATORS.has(tok) && lastHit && lastHit.ago <= 2 && !lastHit.negated) {
        // Undo the word we just scored and count it as its opposite.
        scores[lastHit.emotion] = Math.max(0, scores[lastHit.emotion] - lastHit.weight);
        scores[NEGATION_FLIP[lastHit.emotion]] += lastHit.weight * NEGATION_FACTOR;
        lastHit = null;
        continue;
      }
      if (NEGATE.has(tok) || tok.endsWith("n't")) {
        negateLeft = NEGATION_WINDOW;
        negatorWasNever = tok === 'never';
        neverAmplified = false;
        const boost = INTENSIFY.get(tok);
        if (boost !== undefined) {
          multiplier = boost;
          multiplierLeft = 3;
        }
        continue;
      }
      const boost = INTENSIFY.get(tok);
      if (boost !== undefined) {
        multiplier = Math.max(multiplier, boost) * (elongated ? 1.15 : 1);
        multiplierLeft = 2;
        if (negatorWasNever && negateLeft > 0 && NEVER_AMPLIFIERS.has(tok)) neverAmplified = true;
        continue;
      }
      const soften = DOWNTONE.get(tok);
      if (soften !== undefined) {
        multiplier = soften;
        multiplierLeft = 2;
        continue;
      }
      if (negatorWasNever && negateLeft > 0 && NEVER_AMPLIFIERS.has(tok)) neverAmplified = true;

      let best: Emotion | null = null;
      let bestW = 0;
      for (const e of EMOTIONS) {
        const w = lookupIn(LEX[e], tok);
        if (w > bestW) {
          bestW = w;
          best = e;
        }
      }

      if (best) {
        let w = bestW * (isCaps ? 1.3 : 1) * (elongated ? 1.2 : 1);
        if (multiplierLeft > 0) w *= multiplier;
        const negated = negateLeft > 0 && !neverAmplified;
        if (negated) scores[NEGATION_FLIP[best]] += w * NEGATION_FACTOR;
        else scores[best] += w;
        lastHit = { emotion: best, weight: w, ago: 0, negated };
        // Secondary readings: a word like "lost" is both sad and fearful. Give the others a little credit.
        for (const e of EMOTIONS) {
          if (e === best || negated) continue;
          const w2 = lookupIn(LEX[e], tok);
          if (w2 > 0) scores[e] += w2 * 0.5;
        }
        multiplierLeft = 0;
        multiplier = 1;
      } else if (multiplierLeft > 0) {
        multiplierLeft--;
      }
      if (negateLeft > 0) negateLeft--;
    }
  }

  let top: Emotion = 'calm';
  let topScore = 0;
  let total = 0;
  for (const e of EMOTIONS) {
    scores[e] = Math.round(scores[e] * lineBoost * 1000) / 1000;
    total += scores[e];
    if (scores[e] > topScore) {
      topScore = scores[e];
      top = e;
    }
  }

  if (topScore === 0) {
    // No emotional words: carry the previous line's mood at half strength, so a verse stays coherent.
    const prev = opts.previous;
    if (prev && prev.intensity > 0) {
      return { emotion: prev.emotion, intensity: round2(prev.intensity * 0.5), scores, confidence: 0, words };
    }
    return { emotion: 'calm', intensity: 0.12, scores, confidence: 0, words };
  }

  const dominance = topScore / total; // 1 when only one emotion was found
  const intensity = clamp(intensityFromScore(topScore) * (0.75 + 0.25 * dominance), 0.05, 1);
  return { emotion: top, intensity: round2(intensity), scores, confidence: round2(dominance), words };
}

export function analyzeLines(texts: string[]): LineAnalysis[] {
  const out: LineAnalysis[] = [];
  for (const t of texts) out.push(analyzeLine(t, { previous: out[out.length - 1] ?? null }));
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
