import { describe, expect, it } from 'vitest';
import {
  DIARY_KEY,
  LIBRARY_KEY,
  SafeStore,
  browserBackend,
  deleteSong,
  diaryByDay,
  isInLibrary,
  isQuotaError,
  loadDiary,
  loadLibrary,
  localDate,
  logListen,
  saveSong,
  savedToSong,
  type KeyValueBackend,
} from '../../src/lib/storage';
import { buildSong } from '../../src/lib/songBuilder';
import { SAMPLE_SONG } from '../../src/lib/sample';

class MemoryBackend implements KeyValueBackend {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class FullBackend extends MemoryBackend {
  setItem(): void {
    const err = new Error('full');
    err.name = 'QuotaExceededError';
    throw err;
  }
}

class BrokenBackend extends MemoryBackend {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('SecurityError');
  }
}

const sample = () => buildSong({ title: '', artist: '', rawLyrics: SAMPLE_SONG.lyrics, audioDuration: null, fallbackDuration: 60 });

describe('library save/load', () => {
  it('saves, lists, updates and deletes songs', async () => {
    const store = new SafeStore(new MemoryBackend());
    const song = await sample();
    expect(loadLibrary(store)).toEqual([]);

    expect(saveSong(song, store, 1000)).toEqual({ ok: true, persisted: true });
    const lib = loadLibrary(store);
    expect(lib).toHaveLength(1);
    expect(lib[0]).toMatchObject({ id: song.id, title: 'Paper Lanterns', savedAt: 1000, updatedAt: 1000 });
    expect(lib[0].lines).toHaveLength(16);
    expect(lib[0].analysis.dominant).toBe(song.analysis.dominant);
    expect('warnings' in lib[0]).toBe(false);
    expect(isInLibrary(song.id, store)).toBe(true);

    // Re-saving updates in place and keeps the original savedAt.
    saveSong({ ...song, title: 'Renamed' }, store, 2000);
    const again = loadLibrary(store);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ title: 'Renamed', savedAt: 1000, updatedAt: 2000 });

    const restored = savedToSong(again[0]);
    expect(restored.warnings).toEqual([]);
    expect(restored.lines).toEqual(song.lines);

    deleteSong(song.id, store);
    expect(loadLibrary(store)).toEqual([]);
  });

  it('sorts most recently updated first', async () => {
    const store = new SafeStore(new MemoryBackend());
    const a = await sample();
    const b = { ...(await sample()), id: 'b', title: 'B' };
    saveSong(a, store, 1);
    saveSong(b, store, 2);
    expect(loadLibrary(store).map((s) => s.title)).toEqual(['B', 'Paper Lanterns']);
  });

  it('survives corrupted or wrong-shaped data', () => {
    const backend = new MemoryBackend();
    const store = new SafeStore(backend);
    backend.setItem(LIBRARY_KEY, '{not json');
    expect(loadLibrary(store)).toEqual([]);
    backend.setItem(LIBRARY_KEY, JSON.stringify([{ nope: true }]));
    expect(loadLibrary(store)).toEqual([]);
    backend.setItem(DIARY_KEY, JSON.stringify('string'));
    expect(loadDiary(store)).toEqual([]);
  });

  it('reports a friendly error when storage is full', async () => {
    const store = new SafeStore(new FullBackend());
    const res = saveSong(await sample(), store);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('quota');
      expect(res.message).toMatch(/storage is full/);
    }
  });

  it('falls back to memory when storage is unavailable', async () => {
    const none = new SafeStore(null);
    const song = await sample();
    expect(none.persistent).toBe(false);
    expect(saveSong(song, none)).toEqual({ ok: true, persisted: false });
    expect(loadLibrary(none)).toHaveLength(1);

    const broken = new SafeStore(new BrokenBackend());
    expect(loadLibrary(broken)).toEqual([]);
    expect(saveSong(song, broken)).toEqual({ ok: true, persisted: false });
    expect(loadLibrary(broken)).toHaveLength(1);
  });

  it('detects quota errors and missing localStorage', () => {
    expect(isQuotaError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(browserBackend()).toBeNull(); // node has no localStorage
  });
});

describe('mood diary', () => {
  it('logs a listen once per song per day and groups by day', async () => {
    const store = new SafeStore(new MemoryBackend());
    const song = await sample();
    const day1 = new Date(2026, 10, 1, 10).getTime();
    const day1Later = new Date(2026, 10, 1, 22).getTime();
    const day2 = new Date(2026, 10, 2, 9).getTime();

    logListen(song, store, day1);
    logListen(song, store, day1Later);
    logListen(song, store, day2);
    const entries = loadDiary(store);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.date)).toEqual([localDate(day1), localDate(day2)]);

    const days = diaryByDay(entries, 7, day2);
    expect(days).toHaveLength(7);
    expect(days[6].date).toBe(localDate(day2));
    expect(days[6].entries).toHaveLength(1);
    expect(days[6].dominant).toBe(song.analysis.dominant);
    expect(days[5].entries[0].at).toBe(day1Later);
    expect(days[0].entries).toHaveLength(0);
    expect(days[0].dominant).toBeNull();
  });
});
