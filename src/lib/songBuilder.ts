import type { LyricLine, Song, TimingSource } from '../types';
import { lexiconAnalyzer, type LyricAnalyzer } from './analysis';
import { buildTimeline, parseLyrics, placeholderDuration, spreadEvenly, toLrc } from './lyrics';
import { autoSync, AutoSyncError, decodeAudioFile } from './autosync';
import { detectBeats } from './beats';

export class FriendlyError extends Error {}

export interface SongInput {
  id?: string;
  title: string;
  artist: string;
  rawLyrics: string;
  /** Real audio length in seconds, or null when there's no audio. */
  audioDuration: number | null;
  /** Placeholder length for silent songs (the sample uses this). */
  fallbackDuration?: number;
  isSample?: boolean;
  analyzer?: LyricAnalyzer;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function buildSong(input: SongInput): Promise<Song> {
  const raw = input.rawLyrics ?? '';
  if (!raw.trim()) throw new FriendlyError('Add some lyrics first: paste them in, or try the sample song.');

  const parsed = parseLyrics(raw);
  if (parsed.lines.length === 0) {
    throw new FriendlyError(
      parsed.format === 'lrc'
        ? "Couldn't find any timed lyric lines. LRC lines look like: [00:12.50] your lyric here"
        : 'Those lyrics look empty. Paste at least one line of text.',
    );
  }

  const warnings = [...parsed.warnings];
  let lines: LyricLine[];
  let duration: number;
  let timing: TimingSource;

  if (parsed.format === 'lrc') {
    const res = buildTimeline(parsed.lines, parsed.breaks, input.audioDuration);
    if (res.lines.length === 0) {
      throw new FriendlyError('Every timestamp is after the end of the song. Check the LRC file matches this audio.');
    }
    lines = res.lines;
    duration = input.audioDuration ?? Math.max(res.duration, input.fallbackDuration ?? 0);
    warnings.push(...res.warnings);
    timing = 'lrc';
  } else {
    duration = input.audioDuration ?? input.fallbackDuration ?? placeholderDuration(parsed.lines.length);
    lines = spreadEvenly(
      parsed.lines.map((l) => l.text),
      duration,
    );
    timing = 'spread';
  }

  const texts = lines.map((l) => l.text);
  const analysis = await (input.analyzer ?? lexiconAnalyzer).analyze(texts);

  return {
    id: input.id ?? newId(),
    title: input.title.trim() || parsed.meta.title || 'Untitled song',
    artist: input.artist.trim() || parsed.meta.artist || 'Unknown artist',
    rawLyrics: raw,
    lines,
    timing,
    duration,
    analysis,
    isSample: input.isSample,
    warnings,
  };
}

/** Fit an existing song to newly attached audio. Evenly spread lyrics are re-spread; timed lyrics are re-checked. */
export async function retimeForAudio(song: Song, audioDuration: number): Promise<Song> {
  if (song.timing === 'spread') {
    return {
      ...song,
      duration: audioDuration,
      lines: spreadEvenly(
        song.lines.map((l) => l.text),
        audioDuration,
      ),
      warnings: [],
    };
  }
  if (song.timing === 'tapped' || song.timing === 'auto') {
    const inside = song.lines.filter((l) => l.start < audioDuration);
    if (inside.length === song.lines.length) {
      return { ...song, duration: audioDuration, lines: song.lines.map((l) => ({ ...l, end: Math.min(l.end, audioDuration) })) };
    }
  }
  // LRC, or tapped timings that don't fit: rebuild from the source text so warnings are regenerated.
  const rebuilt = await buildSong({
    id: song.id,
    title: song.title,
    artist: song.artist,
    rawLyrics: song.timing === 'tapped' ? toLrc(song.lines) : song.rawLyrics,
    audioDuration,
  });
  return { ...rebuilt, isSample: song.isSample };
}


export interface AudioAnalysis {
  song: Song;
  /** Auto-sync fit (0–1), or null if auto-sync wasn't run or failed. */
  confidence: number | null;
  /** Why auto-sync failed, if it did. */
  syncError: string | null;
}

/**
 * Decode the audio once, find the beat, and (optionally) line the lyrics up with the singing.
 * Never throws for beat detection problems: a song without a clear beat simply gets none.
 */
export async function analyzeSongAudio(song: Song, file: Blob, duration: number, opts: { autoSync: boolean }): Promise<AudioAnalysis> {
  let audio: Awaited<ReturnType<typeof decodeAudioFile>>;
  try {
    audio = await decodeAudioFile(file);
  } catch (err) {
    const msg = err instanceof AutoSyncError ? err.message : "Couldn't analyse this audio file.";
    return { song, confidence: null, syncError: opts.autoSync ? msg : null };
  }
  // Let the "listening…" message paint before the number crunching.
  await new Promise((r) => setTimeout(r, 30));
  let out: Song = { ...song, duration };
  try {
    const grid = detectBeats(audio.channels, audio.sampleRate);
    if (grid) out = { ...out, beats: grid };
  } catch {
    // No beat map: modes fall back to the live analyser.
  }
  let confidence: number | null = null;
  let syncError: string | null = null;
  if (opts.autoSync) {
    try {
      const res = autoSync(
        song.lines.map((l) => l.text),
        audio.channels,
        audio.sampleRate,
        duration,
      );
      out = { ...out, lines: res.lines, timing: 'auto', vocals: res.segments };
      confidence = res.confidence;
    } catch (err) {
      syncError = err instanceof AutoSyncError ? err.message : "Auto-sync couldn't analyse this file.";
    }
  }
  return { song: out, confidence, syncError };
}

/** Auto-sync (and beat detection). Throws FriendlyError with a readable reason if syncing fails. */
export async function autoSyncSong(song: Song, file: Blob, duration: number): Promise<{ song: Song; confidence: number }> {
  const res = await analyzeSongAudio(song, file, duration, { autoSync: true });
  if (res.syncError) throw new FriendlyError(res.syncError);
  return { song: res.song, confidence: res.confidence ?? 0 };
}
