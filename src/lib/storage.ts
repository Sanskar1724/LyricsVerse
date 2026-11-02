import { EMOTIONS, type Emotion, type Song } from '../types';
import { emptyEmotionRecord } from './emotions';

export const LIBRARY_KEY = 'lyricverse.library.v1';
export const DIARY_KEY = 'lyricverse.diary.v1';
export const PREFS_KEY = 'lyricverse.prefs.v1';
const MAX_DIARY_ENTRIES = 1000;

/** The subset of the Web Storage API we use, so tests can pass a fake. */
export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveResult = { ok: true; persisted: boolean } | { ok: false; reason: 'quota' | 'unknown'; message: string };

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error) && !(typeof err === 'object' && err !== null)) return false;
  const e = err as { name?: string; code?: number };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

/** Returns window.localStorage if it exists and is writable, else null (private mode, blocked cookies…). */
export function browserBackend(): KeyValueBackend | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__lyricverse_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/**
 * JSON storage that never throws. If the real backend is missing, data lives in memory for this tab.
 * Corrupted JSON reads as the fallback value.
 */
export class SafeStore {
  private memory = new Map<string, string>();
  readonly persistent: boolean;

  constructor(private backend: KeyValueBackend | null) {
    this.persistent = backend !== null;
  }

  read<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
    let raw: string | null = null;
    try {
      raw = this.backend ? this.backend.getItem(key) : (this.memory.get(key) ?? null);
    } catch {
      raw = this.memory.get(key) ?? null;
    }
    if (raw === null) return fallback;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (validate && !validate(parsed)) return fallback;
      return parsed as T;
    } catch {
      return fallback;
    }
  }

  write(key: string, value: unknown): SaveResult {
    const json = JSON.stringify(value);
    if (!this.backend) {
      this.memory.set(key, json);
      return { ok: true, persisted: false };
    }
    try {
      this.backend.setItem(key, json);
      return { ok: true, persisted: true };
    } catch (err) {
      if (isQuotaError(err)) {
        return {
          ok: false,
          reason: 'quota',
          message: 'Your browser storage is full. Delete a few songs from the Library and try again.',
        };
      }
      // Storage broke mid-session (e.g. disabled): keep going in memory.
      this.memory.set(key, json);
      this.backend = null;
      return { ok: true, persisted: false };
    }
  }
}

let defaultStore: SafeStore | null = null;
export function getStore(): SafeStore {
  if (!defaultStore) defaultStore = new SafeStore(browserBackend());
  return defaultStore;
}

// ---------------------------------------------------------------- library

export type SavedSong = Omit<Song, 'warnings'> & { savedAt: number; updatedAt: number };

function isSavedSongArray(v: unknown): v is SavedSong[] {
  return (
    Array.isArray(v) &&
    v.every(
      (s) =>
        s && typeof s === 'object' && typeof s.id === 'string' && typeof s.title === 'string' && Array.isArray(s.lines) && s.analysis,
    )
  );
}

export function loadLibrary(store: SafeStore = getStore()): SavedSong[] {
  return store.read<SavedSong[]>(LIBRARY_KEY, [], isSavedSongArray).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSong(song: Song, store: SafeStore = getStore(), now = Date.now()): SaveResult {
  const lib = loadLibrary(store);
  const existing = lib.find((s) => s.id === song.id);
  const { warnings: _w, ...rest } = song;
  const entry: SavedSong = { ...rest, savedAt: existing?.savedAt ?? now, updatedAt: now };
  const next = [entry, ...lib.filter((s) => s.id !== song.id)];
  return store.write(LIBRARY_KEY, next);
}

export function deleteSong(id: string, store: SafeStore = getStore()): SaveResult {
  return store.write(
    LIBRARY_KEY,
    loadLibrary(store).filter((s) => s.id !== id),
  );
}

export function isInLibrary(id: string, store: SafeStore = getStore()): boolean {
  return loadLibrary(store).some((s) => s.id === id);
}

export function savedToSong(saved: SavedSong): Song {
  const { savedAt: _a, updatedAt: _b, ...song } = saved;
  return { ...song, warnings: [] };
}

// ---------------------------------------------------------------- mood diary

export interface DiaryEntry {
  /** Local date, YYYY-MM-DD. */
  date: string;
  at: number;
  songId: string;
  title: string;
  artist: string;
  dominant: Emotion;
  breakdown: Record<Emotion, number>;
}

function isDiaryArray(v: unknown): v is DiaryEntry[] {
  return Array.isArray(v) && v.every((e) => e && typeof e.date === 'string' && typeof e.songId === 'string' && typeof e.dominant === 'string');
}

export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadDiary(store: SafeStore = getStore()): DiaryEntry[] {
  return store.read<DiaryEntry[]>(DIARY_KEY, [], isDiaryArray);
}

/** Log a listen. The same song on the same day is counted once (the latest listen wins). */
export function logListen(song: Song, store: SafeStore = getStore(), now = Date.now()): SaveResult {
  const date = localDate(now);
  const entry: DiaryEntry = {
    date,
    at: now,
    songId: song.id,
    title: song.title,
    artist: song.artist,
    dominant: song.analysis.dominant,
    breakdown: song.analysis.breakdown,
  };
  const others = loadDiary(store).filter((e) => !(e.songId === song.id && e.date === date));
  return store.write(DIARY_KEY, [...others, entry].slice(-MAX_DIARY_ENTRIES));
}

export interface DiaryDay {
  date: string;
  entries: DiaryEntry[];
  breakdown: Record<Emotion, number>;
  dominant: Emotion | null;
}

/** Group the diary into the last `days` calendar days (oldest first), averaging the mood of each day. */
export function diaryByDay(entries: DiaryEntry[], days: number, now = Date.now()): DiaryDay[] {
  const out: DiaryDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const date = localDate(d.getTime());
    const dayEntries = entries.filter((e) => e.date === date).sort((a, b) => a.at - b.at);
    const breakdown = emptyEmotionRecord();
    for (const e of dayEntries) for (const em of EMOTIONS) breakdown[em] += (e.breakdown[em] ?? 0) / dayEntries.length;
    let dominant: Emotion | null = null;
    for (const em of EMOTIONS) if (breakdown[em] > 0 && (!dominant || breakdown[em] > breakdown[dominant])) dominant = em;
    out.push({ date, entries: dayEntries, breakdown, dominant });
  }
  return out;
}
