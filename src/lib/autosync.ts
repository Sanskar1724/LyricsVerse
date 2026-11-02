/**
 * Offline auto-sync: find where the singing is in an audio file and line the lyrics up with it.
 *
 * 1. Features: split stereo into mid (centre, where lead vocals usually sit) and side (panned instruments),
 *    band-pass both to the vocal range (250–3500 Hz), and measure loudness every 20 ms.
 *    "Vocal score" = mid − side, which cancels most wide-panned instruments; bass and kick are filtered out.
 * 2. Detection: median-smooth the score (drops drum hits), then threshold with hysteresis into sung phrases.
 * 3. Alignment: each line is expected to take sung time in proportion to its syllables. Dynamic programming picks,
 *    for every line, a start among the phrase starts (and dips inside long phrases) that best matches that.
 *
 * Everything here is plain TypeScript on Float32Arrays, so it is testable without a browser.
 */

import type { LyricLine } from '../types';

export const HOP_SECONDS = 0.02;

export interface VocalFeatures {
  /** Seconds per frame. */
  hop: number;
  /** Vocal score per frame (≥ 0). */
  score: Float32Array;
  /** Loudness of the centre channel in the vocal band, per frame. Used as an absolute reference. */
  level: Float32Array;
}

export interface VocalSegment {
  start: number;
  end: number;
}

export interface AutoSyncResult {
  lines: LyricLine[];
  segments: VocalSegment[];
  /** 0–1, how well the lyrics fitted the detected singing. */
  confidence: number;
}

export class AutoSyncError extends Error {}

// ------------------------------------------------------------------ filtering

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function biquad(type: 'lowpass' | 'highpass', fc: number, fs: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * Math.min(fc, fs * 0.45)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const lp = type === 'lowpass';
  const b0 = (lp ? (1 - cos) / 2 : (1 + cos) / 2) / a0;
  const b1 = (lp ? 1 - cos : -(1 + cos)) / a0;
  return { b0, b1, b2: b0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function filterInPlace(x: Float32Array, f: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

function bandPass(x: Float32Array, fs: number): void {
  // Two passes each side for a steeper slope.
  const hp = biquad('highpass', 250, fs);
  const lp = biquad('lowpass', 3500, fs);
  filterInPlace(x, hp);
  filterInPlace(x, hp);
  filterInPlace(x, lp);
  filterInPlace(x, lp);
}

function rmsFrames(x: Float32Array, hopSamples: number): Float32Array {
  const n = Math.floor(x.length / hopSamples);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const base = f * hopSamples;
    for (let i = 0; i < hopSamples; i++) {
      const v = x[base + i];
      sum += v * v;
    }
    out[f] = Math.sqrt(sum / hopSamples);
  }
  return out;
}

/** Compute the per-frame vocal score from raw channel data (1 or 2 channels). */
export function vocalFeatures(channels: Float32Array[], sampleRate: number): VocalFeatures {
  if (channels.length === 0 || channels[0].length === 0) return { hop: HOP_SECONDS, score: new Float32Array(0), level: new Float32Array(0) };
  const n = channels[0].length;
  const left = channels[0];
  const right = channels[1] ?? channels[0];
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }
  bandPass(mid, sampleRate);
  bandPass(side, sampleRate);
  const hopSamples = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const m = rmsFrames(mid, hopSamples);
  const s = rmsFrames(side, hopSamples);
  const score = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) score[i] = Math.max(0, m[i] - 0.9 * s[i]);
  return { hop: hopSamples / sampleRate, score, level: m };
}

// ------------------------------------------------------------------ detection

function medianSmooth(x: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(x.length);
  const win: number[] = [];
  for (let i = 0; i < x.length; i++) {
    win.length = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(x.length - 1, i + radius); j++) win.push(x[j]);
    win.sort((a, b) => a - b);
    out[i] = win[win.length >> 1];
  }
  return out;
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

export interface Detection {
  segments: VocalSegment[];
  /** Smoothed score, normalised 0–1. */
  smooth: Float32Array;
  /** 1 for frames inside a sung segment. */
  active: Uint8Array;
}

export function detectVocals(features: VocalFeatures): Detection {
  const { hop, score, level } = features;
  const smooth = medianSmooth(score, Math.max(1, Math.round(0.09 / hop)));
  const sorted = Float32Array.from(smooth).sort();
  const floor = percentile(sorted, 0.15);
  const high = percentile(sorted, 0.95);
  const range = high - floor;
  const norm = new Float32Array(smooth.length);
  for (let i = 0; i < smooth.length; i++) norm[i] = range > 1e-6 ? Math.min(1, Math.max(0, (smooth[i] - floor) / range)) : 0;

  const active = new Uint8Array(smooth.length);
  const segments: VocalSegment[] = [];
  if (range < 1e-4) return { segments, smooth: norm, active };
  // Absolute gate: the centre-minus-sides residue must be a real share of the vocal-band loudness.
  // Without it, an instrumental's leftovers would be normalised up into "singing".
  const loud = percentile(Float32Array.from(level).sort(), 0.95);
  const gate = loud * 0.3;
  if (high < gate) return { segments, smooth: norm, active };

  const on = 0.32;
  const off = 0.2;
  let inSeg = false;
  let segStart = 0;
  for (let i = 0; i <= norm.length; i++) {
    const v = i < norm.length && smooth[i] >= gate * 0.5 ? norm[i] : 0;
    if (!inSeg && v >= on) {
      inSeg = true;
      segStart = i;
      // Walk back to where the rise began so onsets aren't late.
      while (segStart > 0 && norm[segStart - 1] >= off) segStart--;
    } else if (inSeg && v < off) {
      inSeg = false;
      segments.push({ start: segStart * hop, end: i * hop });
    }
  }

  // Merge tiny gaps (breaths), drop blips.
  const merged: VocalSegment[] = [];
  for (const s of segments) {
    const prev = merged[merged.length - 1];
    if (prev && s.start - prev.end < 0.25) prev.end = s.end;
    else merged.push({ ...s });
  }
  const kept = merged.filter((s) => s.end - s.start >= 0.25);
  for (const s of kept) {
    for (let i = Math.floor(s.start / hop); i < Math.min(active.length, Math.ceil(s.end / hop)); i++) active[i] = 1;
  }
  return { segments: kept.map((s) => ({ start: round2(s.start), end: round2(s.end) })), smooth: norm, active };
}

// ------------------------------------------------------------------ syllables

/** Rough syllable count. English vowel groups, Devanagari aksharas, one per CJK character. */
export function countSyllables(text: string): number {
  let total = 0;
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const word = raw.replace(/[^\p{L}\p{M}']/gu, '');
    if (!word) continue;
    if (/[ऀ-ॿ]/.test(word)) {
      const vowels = (word.match(/[ऄ-औ]/g) ?? []).length;
      const consonants = (word.match(/[क-हक़-य़](?!्)/g) ?? []).length;
      total += Math.max(1, vowels + consonants);
    } else if (/[぀-ヿ一-鿿가-힯]/.test(word)) {
      total += [...word].length;
    } else {
      let groups = (word.match(/[aeiouyàáâäèéêëìíîïòóôöùúûü]+/g) ?? []).length;
      if (groups > 1 && /[^aeiouy]e$/.test(word) && !/le$/.test(word)) groups--;
      total += Math.max(1, groups);
    }
  }
  return Math.max(1, total);
}

// ------------------------------------------------------------------ alignment

interface Candidate {
  t: number;
  penalty: number;
}

function candidatesFrom(det: Detection, hop: number, wanted: number): Candidate[] {
  const cands: Candidate[] = det.segments.map((s) => ({ t: s.start, penalty: 0 }));
  const sm = det.smooth;
  const near = Math.round(0.2 / hop);
  const wide = Math.round(0.8 / hop);
  // Dips inside long phrases: likely a new line sung without a pause.
  for (const s of det.segments) {
    if (s.end - s.start < 2) continue;
    const a = Math.ceil(s.start / hop) + near;
    const b = Math.floor(s.end / hop) - near;
    for (let i = a; i < b; i++) {
      let isMin = true;
      for (let j = i - near; j <= i + near && isMin; j++) if (sm[j] < sm[i]) isMin = false;
      if (!isMin) continue;
      let peak = 0;
      for (let j = Math.max(0, i - wide); j <= Math.min(sm.length - 1, i + wide); j++) peak = Math.max(peak, sm[j]);
      if (sm[i] < peak * 0.75) cands.push({ t: (i + 1) * hop, penalty: 0.35 });
    }
  }
  // Not enough? Add a grid inside sung phrases so every line still gets a slot.
  if (cands.length < wanted * 1.5) {
    for (const s of det.segments) {
      for (let t = s.start + 0.5; t < s.end - 0.3; t += 0.5) cands.push({ t, penalty: 0.8 });
    }
  }
  cands.sort((x, y) => x.t - y.t);
  const out: Candidate[] = [];
  for (const c of cands) {
    const prev = out[out.length - 1];
    if (prev && c.t - prev.t < 0.3) {
      if (c.penalty < prev.penalty) out[out.length - 1] = c;
    } else out.push(c);
  }
  return out;
}

/**
 * Pick a start time for each line. Returns starts (seconds) and an average fit cost.
 */
export function alignLines(texts: string[], det: Detection, hop: number): { starts: number[]; cost: number } {
  const n = texts.length;
  const total = det.active.length;
  const prefix = new Float64Array(total + 1);
  for (let i = 0; i < total; i++) prefix[i + 1] = prefix[i] + det.active[i] * hop;
  const sungBetween = (a: number, b: number) => {
    const i = Math.max(0, Math.min(total, Math.round(a / hop)));
    const j = Math.max(0, Math.min(total, Math.round(b / hop)));
    return j > i ? prefix[j] - prefix[i] : 0;
  };
  const totalSung = prefix[total];
  const syll = texts.map(countSyllables);
  const totalSyll = syll.reduce((s, x) => s + x, 0);
  const perSyll = totalSung / totalSyll;
  const expected = syll.map((s) => s * perSyll);
  const meanExpected = totalSung / n;

  const cands = candidatesFrom(det, hop, n);
  const m = cands.length;
  if (m < n) throw new AutoSyncError(`Only found ${m} sung phrases for ${n} lines. Try ⏱ Sync instead.`);

  const fit = (sung: number, exp: number) => {
    const r = Math.log((sung + 0.2) / (exp + 0.2));
    return r * r;
  };
  const endT = total * hop;
  const INF = Number.POSITIVE_INFINITY;
  const reach = 80; // how many candidates ahead the next line may start
  let prev = new Float64Array(m).fill(INF);
  const back: Int32Array[] = [];

  for (let j = 0; j <= m - n; j++) {
    // Skipping a lot of singing before the first line is unlikely (but intros with humming happen).
    prev[j] = cands[j].penalty + 0.6 * (sungBetween(0, cands[j].t) / Math.max(0.5, meanExpected));
  }
  for (let i = 1; i < n; i++) {
    const cur = new Float64Array(m).fill(INF);
    const from = new Int32Array(m).fill(-1);
    for (let j = i - 1; j <= m - (n - i) - 1; j++) {
      if (prev[j] === INF) continue;
      const kMax = Math.min(m - (n - i), j + reach);
      for (let k = j + 1; k <= kMax; k++) {
        const c = prev[j] + cands[k].penalty + fit(sungBetween(cands[j].t, cands[k].t), expected[i - 1]);
        if (c < cur[k]) {
          cur[k] = c;
          from[k] = j;
        }
      }
    }
    back.push(from);
    prev = cur;
  }

  let best = -1;
  let bestCost = INF;
  for (let j = n - 1; j < m; j++) {
    if (prev[j] === INF) continue;
    const tail = Math.min(sungBetween(cands[j].t, endT), expected[n - 1] * 3);
    const c = prev[j] + 0.5 * fit(tail, expected[n - 1]);
    if (c < bestCost) {
      bestCost = c;
      best = j;
    }
  }
  if (best < 0) throw new AutoSyncError("Couldn't line the lyrics up with the singing. Try ⏱ Sync instead.");

  const idx = new Array<number>(n);
  idx[n - 1] = best;
  for (let i = n - 1; i >= 1; i--) idx[i - 1] = back[i - 1][idx[i]];
  return { starts: idx.map((k) => round2(cands[k].t)), cost: bestCost / n };
}

/** Full pipeline on decoded audio. */
export function autoSync(texts: string[], channels: Float32Array[], sampleRate: number, duration: number): AutoSyncResult {
  if (texts.length === 0) throw new AutoSyncError('There are no lyric lines to sync.');
  const features = vocalFeatures(channels, sampleRate);
  const det = detectVocals(features);
  const sungTotal = det.segments.reduce((s, x) => s + (x.end - x.start), 0);
  if (det.segments.length === 0 || sungTotal < 1.5) {
    throw new AutoSyncError("Couldn't hear any singing in this file. Is it an instrumental? You can still use ⏱ Sync.");
  }
  const { starts, cost } = alignLines(texts, det, features.hop);

  const lines: LyricLine[] = texts.map((text, i) => {
    const start = starts[i];
    const next = starts[i + 1] ?? duration;
    // End when the singing for this line stops (plus a little tail), never after the next line starts.
    let lastSung = start;
    for (const s of det.segments) {
      if (s.end <= start || s.start >= next) continue;
      lastSung = Math.max(lastSung, Math.min(s.end, next));
    }
    const end = Math.min(next, Math.max(start + 0.8, lastSung + 0.5), duration);
    return { id: i, text, start, end: round2(Math.max(end, start + 0.05)) };
  });

  return { lines, segments: det.segments, confidence: round2(Math.max(0, Math.min(1, 1 - cost / 1.5))) };
}

/** Decode an audio file in the browser. OfflineAudioContext needs no user gesture and never plays sound. */
export async function decodeAudioFile(file: Blob): Promise<{ channels: Float32Array[]; sampleRate: number; duration: number }> {
  const bytes = await file.arrayBuffer();
  const Ctor: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) throw new AutoSyncError('This browser cannot decode audio for auto-sync.');
  const ctx = new Ctor(1, 1, 22050);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    throw new AutoSyncError("Couldn't decode this audio file for auto-sync.");
  }
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c));
  return { channels, sampleRate: buffer.sampleRate, duration: buffer.duration };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
