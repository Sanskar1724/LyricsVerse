/**
 * Offline beat tracking: find the tempo and every beat of a song so visuals can land exactly on the beat.
 *
 * 1. Onset strength: how sharply loudness rises every 10 ms, in the bass band (kick drum) and overall (snare, chords).
 * 2. Tempo: autocorrelation of the onset curve over 60–190 BPM, gently preferring ~115 BPM to settle half/double ambiguity.
 * 3. Beats: dynamic programming (Ellis 2007): choose beat times that sit on strong onsets while keeping a steady period.
 * 4. Downbeats: in 4/4, the beat phase with the most bass energy is taken as "beat 1".
 */

export interface BeatGrid {
  bpm: number;
  /** Beat times in seconds. */
  times: number[];
  /** Index (0–3) of the first downbeat in `times`; downbeats are every 4th beat from there. */
  downbeat: number;
}

const HOP = 0.01;

interface Coeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function lowpass(fc: number, fs: number): Coeffs {
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  return { b0, b1: (1 - cos) / a0, b2: b0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function filter(x: Float32Array, c: Coeffs): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

function energies(x: Float32Array, hopSamples: number): Float32Array {
  const n = Math.floor(x.length / hopSamples);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * hopSamples, end = i + hopSamples; i < end; i++) s += x[i] * x[i];
    out[f] = s / hopSamples;
  }
  return out;
}

function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
}

/** Onset strength per 10 ms frame (≥ 0), plus bass energy for downbeat finding. */
export function onsetEnvelope(channels: Float32Array[], sampleRate: number): { onset: Float32Array; bass: Float32Array } {
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  const right = channels[1] ?? channels[0];
  for (let i = 0; i < n; i++) mono[i] = (channels[0][i] + right[i]) * 0.5;
  const low = Float32Array.from(mono);
  const lp = lowpass(160, sampleRate);
  filter(low, lp);
  filter(low, lp);
  const hopSamples = Math.max(1, Math.round(sampleRate * HOP));
  const eLow = energies(low, hopSamples);
  const eAll = energies(mono, hopSamples);
  const floorLow = mean(eLow) * 1e-3 + 1e-9;
  const floorAll = mean(eAll) * 1e-3 + 1e-9;

  const raw = new Float32Array(eLow.length);
  for (let t = 1; t < raw.length; t++) {
    const dl = Math.log(eLow[t] + floorLow) - Math.log(eLow[t - 1] + floorLow);
    const da = Math.log(eAll[t] + floorAll) - Math.log(eAll[t - 1] + floorAll);
    raw[t] = Math.max(0, dl) + 0.6 * Math.max(0, da);
  }
  // Remove the slowly varying part (crescendos) and normalise.
  const win = Math.round(0.4 / HOP);
  const onset = new Float32Array(raw.length);
  let acc = 0;
  for (let t = 0; t < raw.length; t++) {
    acc += raw[t];
    if (t >= win) acc -= raw[t - win];
    const local = acc / Math.min(t + 1, win);
    onset[t] = Math.max(0, raw[t] - local);
  }
  let sd = 0;
  const m = mean(onset);
  for (let t = 0; t < onset.length; t++) sd += (onset[t] - m) ** 2;
  sd = Math.sqrt(sd / Math.max(1, onset.length)) || 1;
  for (let t = 0; t < onset.length; t++) onset[t] /= sd;
  return { onset, bass: eLow };
}

/** Beat period in frames (fractional), from autocorrelation of the onset curve. */
export function estimatePeriod(onset: Float32Array): number {
  const minLag = Math.round(60 / 190 / HOP);
  const maxLag = Math.round(60 / 60 / HOP);
  const scores: number[] = [];
  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let t = lag; t < onset.length; t++) s += onset[t] * onset[t - lag];
    s /= onset.length - lag;
    const bpm = 60 / (lag * HOP);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 1.0) ** 2);
    const w = s * prior;
    scores[lag] = w;
    if (w > bestScore) {
      bestScore = w;
      best = lag;
    }
  }
  // Parabolic interpolation for a fractional period.
  const a = scores[best - 1];
  const b = scores[best];
  const c = scores[best + 1];
  if (a !== undefined && c !== undefined) {
    const denom = a - 2 * b + c;
    if (denom < 0) return best + (0.5 * (a - c)) / denom;
  }
  return best;
}

/** Ellis-style DP beat tracker. Returns beat frames. */
export function trackBeats(onset: Float32Array, period: number, tightness = 120): number[] {
  const n = onset.length;
  if (n === 0) return [];
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let bestPrev = 0;
    let bestIdx = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const r = Math.log((t - tau) / period);
      const s = score[tau] - tightness * r * r;
      if (bestIdx < 0 || s > bestPrev) {
        bestPrev = s;
        bestIdx = tau;
      }
    }
    score[t] = onset[t] + (bestIdx >= 0 ? Math.max(0, bestPrev) : 0);
    back[t] = bestIdx >= 0 && bestPrev > 0 ? bestIdx : -1;
  }
  // End on the best-scoring frame in the last two periods.
  let end = n - 1;
  for (let t = Math.max(0, n - 2 * Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats: number[] = [];
  for (let t = end; t >= 0; t = back[t]) {
    beats.push(t);
    if (back[t] < 0) break;
  }
  return beats.reverse();
}

/** Full analysis. Returns null if the audio has no clear rhythm. */
export function detectBeats(channels: Float32Array[], sampleRate: number): BeatGrid | null {
  if (!channels.length || channels[0].length < sampleRate * 3) return null;
  const { onset, bass } = onsetEnvelope(channels, sampleRate);
  const period = estimatePeriod(onset);
  const frames = trackBeats(onset, period);
  if (frames.length < 4) return null;

  // Only keep beats where something is actually playing (skip silent intro/outro).
  const strong = onset.reduce((m, v) => Math.max(m, v), 0) * 0.15;
  let first = 0;
  while (first < frames.length && onset[frames[first]] < strong) first++;
  let last = frames.length - 1;
  while (last > first && onset[frames[last]] < strong) last--;
  const kept = frames.slice(first, last + 1);
  if (kept.length < 4) return null;

  let downbeat = 0;
  let bestBass = -1;
  for (let p = 0; p < 4; p++) {
    let s = 0;
    for (let i = p; i < kept.length; i += 4) s += bass[kept[i]] ?? 0;
    if (s > bestBass) {
      bestBass = s;
      downbeat = p;
    }
  }
  return {
    bpm: Math.round((60 / (period * HOP)) * 10) / 10,
    times: kept.map((f) => Math.round(f * HOP * 1000) / 1000),
    downbeat,
  };
}

/** A steady grid for songs without audio (matches the silent player's pulse). */
export function syntheticGrid(duration: number, bpm = 92): BeatGrid {
  const step = 60 / bpm;
  const times: number[] = [];
  for (let t = 0; t <= duration; t += step) times.push(Math.round(t * 1000) / 1000);
  return { bpm, times, downbeat: 0 };
}

/** Index of the last beat at or before t (-1 if none). */
export function beatIndexAt(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Move a time onto the nearest beat or half-beat if one is within `window` seconds.
 * Keeps lyrics feeling "on the beat" without drifting far from when they're sung.
 */
export function snapToBeat(t: number, grid: BeatGrid, window = 0.2): number {
  const i = beatIndexAt(grid.times, t);
  const candidates: number[] = [];
  for (const k of [i - 1, i, i + 1]) {
    const a = grid.times[k];
    const b = grid.times[k + 1];
    if (a === undefined) continue;
    candidates.push(a);
    if (b !== undefined) candidates.push((a + b) / 2);
  }
  let best = t;
  let bestD = window;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
