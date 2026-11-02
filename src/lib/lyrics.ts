import type { LyricLine } from '../types';

/** Seconds per line used when there is no audio to measure the song length from. */
export const PLACEHOLDER_SECONDS_PER_LINE = 3.5;
/** Hard cap so a pasted novel can't freeze the tab. */
export const MAX_LINES = 1500;

export interface RawLine {
  text: string;
  /** Seconds, or null for plain-text lines. */
  start: number | null;
}

export interface ParsedLyrics {
  format: 'lrc' | 'plain';
  lines: RawLine[];
  /** LRC lines with a timestamp but no text: they mark the end of the previous line. */
  breaks: number[];
  meta: { title?: string; artist?: string; offsetMs?: number };
  warnings: string[];
}

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TIMESTAMP = /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/;
const META_TAG = /^\s*\[(ti|ar|al|by|offset|length|re|ve|au|#):(.*)\]\s*$/i;
const SECTION_HEADER = /^\s*\[[^\]\d][^\]]*\]\s*$/; // [Chorus], [Verse 2]

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** True when most non-empty lines start with an LRC timestamp. */
export function detectFormat(raw: string): 'lrc' | 'plain' {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !META_TAG.test(l));
  if (lines.length === 0) return 'plain';
  const timed = lines.filter((l) => LEADING_TIMESTAMP.test(l)).length;
  return timed > 0 && timed >= lines.length * 0.5 ? 'lrc' : 'plain';
}

export function parseLrc(raw: string): ParsedLyrics {
  const out: ParsedLyrics = { format: 'lrc', lines: [], breaks: [], meta: {}, warnings: [] };
  let bad = 0;
  let badTimestamps = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const meta = META_TAG.exec(rawLine);
    if (meta) {
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === 'ti') out.meta.title = value;
      else if (key === 'ar') out.meta.artist = value;
      else if (key === 'offset' && /^[+-]?\d+$/.test(value)) out.meta.offsetMs = parseInt(value, 10);
      continue;
    }
    if (!LEADING_TIMESTAMP.test(rawLine)) {
      if (!SECTION_HEADER.test(rawLine)) bad++;
      continue;
    }

    const times: number[] = [];
    const badBefore = badTimestamps;
    TIMESTAMP.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIMESTAMP.exec(rawLine))) {
      // Only consume timestamps that are stacked at the start: "[00:01][00:30]chorus".
      if (rawLine.slice(lastEnd, m.index).trim() !== '') break;
      lastEnd = m.index + m[0].length;
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseFloat('0.' + m[3]) : 0;
      if (sec >= 60) {
        badTimestamps++;
        continue;
      }
      times.push(min * 60 + sec + frac);
    }
    const text = cleanText(rawLine.slice(lastEnd));
    if (times.length === 0) {
      if (badTimestamps === badBefore) bad++;
      continue;
    }
    for (const t of times) {
      if (text) out.lines.push({ text, start: t });
      else out.breaks.push(t);
    }
  }

  if (out.meta.offsetMs) {
    // LRC convention: a positive offset makes lyrics appear sooner.
    const shift = out.meta.offsetMs / 1000;
    for (const l of out.lines) l.start = Math.max(0, (l.start ?? 0) - shift);
    out.breaks = out.breaks.map((b) => Math.max(0, b - shift));
  }
  if (bad > 0) out.warnings.push(`Skipped ${bad} line${bad === 1 ? '' : 's'} without a valid [mm:ss.xx] timestamp.`);
  if (badTimestamps > 0) out.warnings.push(`Ignored ${badTimestamps} impossible timestamp${badTimestamps === 1 ? '' : 's'} (seconds ≥ 60).`);
  return out;
}

export function parsePlain(raw: string): ParsedLyrics {
  const out: ParsedLyrics = { format: 'plain', lines: [], breaks: [], meta: {}, warnings: [] };
  let headers = 0;
  for (const rawLine of raw.split(/\r?\n/)) {
    if (SECTION_HEADER.test(rawLine)) {
      headers++;
      continue;
    }
    const text = cleanText(rawLine);
    if (text) out.lines.push({ text, start: null });
  }
  if (headers > 0) out.warnings.push(`Hid ${headers} section label${headers === 1 ? '' : 's'} like [Chorus].`);
  return out;
}

export function parseLyrics(raw: string): ParsedLyrics {
  const parsed = detectFormat(raw) === 'lrc' ? parseLrc(raw) : parsePlain(raw);
  if (parsed.lines.length > MAX_LINES) {
    parsed.warnings.push(`That's a lot of lyrics! Only the first ${MAX_LINES} lines are used.`);
    parsed.lines = parsed.lines.slice(0, MAX_LINES);
  }
  return parsed;
}

export function placeholderDuration(lineCount: number): number {
  return Math.max(10, Math.round(lineCount * PLACEHOLDER_SECONDS_PER_LINE + 4));
}

/** Spread plain lines evenly across the song, leaving a short intro and outro. */
export function spreadEvenly(texts: string[], duration: number): LyricLine[] {
  const n = texts.length;
  if (n === 0) return [];
  const lead = Math.min(2, duration * 0.04);
  const tail = Math.min(2, duration * 0.04);
  const step = Math.max(0.05, (duration - lead - tail) / n);
  return texts.map((text, i) => {
    const start = round3(lead + i * step);
    return { id: i, text, start, end: round3(Math.min(duration, start + step)) };
  });
}

export interface TimedResult {
  lines: LyricLine[];
  duration: number;
  warnings: string[];
}

/**
 * Turn timestamped lines into a clean, sorted timeline.
 * - sorts out-of-order timestamps
 * - merges lines that share a timestamp
 * - drops lines that start after the audio ends (when the audio length is known)
 */
export function buildTimeline(raw: RawLine[], breaks: number[], audioDuration: number | null): TimedResult {
  const warnings: string[] = [];
  const timed = raw.filter((l): l is { text: string; start: number } => l.start !== null && Number.isFinite(l.start));

  let outOfOrder = 0;
  for (let i = 1; i < timed.length; i++) if (timed[i].start < timed[i - 1].start) outOfOrder++;
  if (outOfOrder > 0) warnings.push(`Re-ordered ${outOfOrder} line${outOfOrder === 1 ? '' : 's'} with out-of-order timestamps.`);
  const sorted = timed
    .map((l, i) => ({ ...l, order: i }))
    .sort((a, b) => a.start - b.start || a.order - b.order);

  const merged: { text: string; start: number }[] = [];
  for (const l of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.start - l.start) < 0.01) prev.text = `${prev.text} / ${l.text}`;
    else merged.push({ text: l.text, start: l.start });
  }

  let kept = merged;
  if (audioDuration !== null) {
    kept = merged.filter((l) => l.start < audioDuration);
    const dropped = merged.length - kept.length;
    if (dropped > 0) {
      warnings.push(
        `${dropped} line${dropped === 1 ? ' starts' : 's start'} after the song ends (${formatTime(audioDuration)}), so ${dropped === 1 ? 'it was' : 'they were'} left out.`,
      );
    }
  }

  const lastStart = kept.length ? kept[kept.length - 1].start : 0;
  const duration = audioDuration ?? Math.max(10, lastStart + 5);
  const sortedBreaks = [...breaks].sort((a, b) => a - b);

  const lines: LyricLine[] = kept.map((l, i) => {
    const nextStart = i + 1 < kept.length ? kept[i + 1].start : Infinity;
    const brk = sortedBreaks.find((b) => b > l.start && b < nextStart);
    const fallbackEnd = Math.min(duration, l.start + 6);
    const end = brk ?? (Number.isFinite(nextStart) ? nextStart : fallbackEnd);
    return { id: i, text: l.text, start: round3(l.start), end: round3(Math.max(end, l.start + 0.05)) };
  });

  return { lines, duration, warnings };
}

/** Index of the last line that has started at time t, or -1 before the first line. */
export function lastStartedIndex(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Build end times for tapped starts (sorted). */
export function linesFromStarts(texts: string[], starts: number[], duration: number): LyricLine[] {
  return texts.map((text, i) => {
    const start = round3(Math.min(starts[i] ?? duration, duration));
    const next = starts[i + 1];
    const end = next !== undefined ? next : Math.min(duration, start + 6);
    return { id: i, text, start, end: round3(Math.max(end, start + 0.05)) };
  });
}

export interface TimingAdjust {
  /** Seconds added to every line (after stretching). */
  offset: number;
  /** Multiplies the gaps between lines, measured from the first line. >1 = slower lyrics. */
  stretch: number;
}

export const NO_ADJUST: TimingAdjust = { offset: 0, stretch: 1 };

/** Shift and stretch a set of lines. The first line is the pivot, so stretching keeps it in place. */
export function adjustTiming(base: LyricLine[], adj: TimingAdjust, duration: number): LyricLine[] {
  if (base.length === 0) return [];
  const pivot = base[0].start;
  const latest = Math.max(0, duration - 0.05);
  const starts = base.map((l) => round3(Math.min(latest, Math.max(0, pivot + (l.start - pivot) * adj.stretch + adj.offset))));
  return base.map((l, i) => {
    const next = starts[i + 1];
    const ownLength = (l.end - l.start) * adj.stretch;
    const end = next !== undefined ? Math.min(next, starts[i] + Math.max(ownLength, 0.05)) : Math.min(duration, starts[i] + Math.max(ownLength, 2));
    return { ...l, start: starts[i], end: round3(Math.max(end, starts[i] + 0.05)) };
  });
}

/**
 * Work out the adjustment that puts the first line at `firstAt` and (optionally) the last line at `lastAt`.
 * With only the first point, the current stretch is kept.
 */
export function fitTiming(base: LyricLine[], firstAt: number, lastAt: number | null, currentStretch = 1): TimingAdjust {
  if (base.length === 0) return NO_ADJUST;
  const b0 = base[0].start;
  const bn = base[base.length - 1].start;
  let stretch = currentStretch;
  if (lastAt !== null && base.length > 1 && bn - b0 > 0.01 && lastAt > firstAt) {
    stretch = Math.min(4, Math.max(0.25, (lastAt - firstAt) / (bn - b0)));
  }
  return { offset: round3(firstAt - b0), stretch: Math.round(stretch * 1000) / 1000 };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function toLrc(lines: LyricLine[]): string {
  return lines
    .map((l) => {
      const m = Math.floor(l.start / 60);
      const s = l.start - m * 60;
      return `[${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}] ${l.text}`;
    })
    .join('\n');
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
