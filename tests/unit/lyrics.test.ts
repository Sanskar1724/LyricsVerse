import { describe, expect, it } from 'vitest';
import {
  adjustTiming,
  buildTimeline,
  fitTiming,
  detectFormat,
  lastStartedIndex,
  linesFromStarts,
  parseLrc,
  parseLyrics,
  parsePlain,
  placeholderDuration,
  spreadEvenly,
  toLrc,
} from '../../src/lib/lyrics';
import { buildSong, FriendlyError, retimeForAudio } from '../../src/lib/songBuilder';
import { SAMPLE_SONG } from '../../src/lib/sample';

describe('LRC parsing', () => {
  it('parses timestamps with 2- and 3-digit fractions and no fraction', () => {
    const p = parseLrc('[00:12.50] first\n[01:02.123]second\n[02:03] third');
    expect(p.lines).toEqual([
      { text: 'first', start: 12.5 },
      { text: 'second', start: 62.123 },
      { text: 'third', start: 123 },
    ]);
    expect(p.warnings).toEqual([]);
  });

  it('reads metadata tags and applies offset', () => {
    const p = parseLrc('[ti:Song]\n[ar:Band]\n[offset:+500]\n[00:10.00] hello');
    expect(p.meta.title).toBe('Song');
    expect(p.meta.artist).toBe('Band');
    expect(p.lines[0].start).toBeCloseTo(9.5);
  });

  it('expands stacked timestamps for repeated lines', () => {
    const p = parseLrc('[00:05.00][00:30.00] chorus line');
    expect(p.lines.map((l) => l.start)).toEqual([5, 30]);
    expect(p.lines.every((l) => l.text === 'chorus line')).toBe(true);
  });

  it('skips bad lines and impossible timestamps with friendly warnings', () => {
    const p = parseLrc('[00:01.00] ok\nthis has no timestamp\n[00:75.00] bad seconds\n[xx:yy] junk\n[Chorus]\n[00:04.00] fine');
    expect(p.lines.map((l) => l.text)).toEqual(['ok', 'fine']);
    expect(p.warnings.join(' ')).toMatch(/Skipped 2 lines/);
    expect(p.warnings.join(' ')).toMatch(/impossible timestamp/);
  });

  it('treats empty timed lines as breaks that end the previous line', () => {
    const p = parseLrc('[00:01.00] sing\n[00:03.00]\n[00:10.00] again');
    expect(p.breaks).toEqual([3]);
    const t = buildTimeline(p.lines, p.breaks, null);
    expect(t.lines[0].end).toBe(3);
    expect(t.lines[1].start).toBe(10);
  });

  it('sorts out-of-order timestamps and warns', () => {
    const p = parseLrc('[00:20.00] c\n[00:05.00] a\n[00:10.00] b');
    const t = buildTimeline(p.lines, p.breaks, null);
    expect(t.lines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
    expect(t.lines.map((l) => l.id)).toEqual([0, 1, 2]);
    expect(t.warnings[0]).toMatch(/Re-ordered/);
  });

  it('drops lines beyond the song length when audio duration is known', () => {
    const p = parseLrc('[00:05.00] a\n[00:50.00] b\n[03:00.00] way too late');
    const t = buildTimeline(p.lines, p.breaks, 60);
    expect(t.lines.map((l) => l.text)).toEqual(['a', 'b']);
    expect(t.duration).toBe(60);
    expect(t.warnings[0]).toMatch(/after the song ends/);
    expect(t.lines[1].end).toBeLessThanOrEqual(60);
  });

  it('merges lines with identical timestamps', () => {
    const t = buildTimeline(
      [
        { text: 'x', start: 2 },
        { text: 'y', start: 2 },
      ],
      [],
      null,
    );
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0].text).toBe('x / y');
  });

  it('round-trips through toLrc', () => {
    const lines = buildTimeline(parseLrc(SAMPLE_SONG.lyrics).lines, [], null).lines;
    const again = buildTimeline(parseLrc(toLrc(lines)).lines, [], null).lines;
    expect(again.map((l) => [l.text, l.start])).toEqual(lines.map((l) => [l.text, l.start]));
  });
});

describe('format detection', () => {
  it('detects LRC vs plain text', () => {
    expect(detectFormat(SAMPLE_SONG.lyrics)).toBe('lrc');
    expect(detectFormat('just\nplain\nlines')).toBe('plain');
    expect(detectFormat('')).toBe('plain');
    expect(detectFormat('[00:01.00] one\nplain two\nplain three\nplain four')).toBe('plain');
  });

  it('plain parsing trims, drops blanks and section headers', () => {
    const p = parsePlain('  hello   world \n\n[Chorus]\nsecond\n   \n');
    expect(p.lines.map((l) => l.text)).toEqual(['hello world', 'second']);
    expect(p.warnings[0]).toMatch(/section label/);
  });

  it('keeps emoji and non-English text intact', () => {
    const p = parseLyrics('दिल में प्यार है ❤️\n雨が降る 🌧️\nCafé au lait');
    expect(p.lines.map((l) => l.text)).toEqual(['दिल में प्यार है ❤️', '雨が降る 🌧️', 'Café au lait']);
  });
});

describe('plain-text timing spread', () => {
  it('spreads lines evenly with an intro and outro, in order, inside the song', () => {
    const lines = spreadEvenly(['a', 'b', 'c', 'd'], 100);
    expect(lines).toHaveLength(4);
    expect(lines[0].start).toBeGreaterThan(0);
    const gaps = lines.slice(1).map((l, i) => l.start - lines[i].start);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 5);
    for (const l of lines) {
      expect(l.end).toBeGreaterThan(l.start);
      expect(l.end).toBeLessThanOrEqual(100);
    }
    expect(lines[3].end).toBeLessThan(100);
  });

  it('handles empty input and very long lyrics', () => {
    expect(spreadEvenly([], 60)).toEqual([]);
    const many = spreadEvenly(
      Array.from({ length: 250 }, (_, i) => `line ${i}`),
      180,
    );
    expect(many).toHaveLength(250);
    expect(many[249].end).toBeLessThanOrEqual(180);
    for (let i = 1; i < many.length; i++) expect(many[i].start).toBeGreaterThan(many[i - 1].start);
  });

  it('uses a placeholder duration when there is no audio', () => {
    expect(placeholderDuration(16)).toBe(60);
    expect(placeholderDuration(1)).toBeGreaterThanOrEqual(10);
  });

  it('builds lines from tapped start times', () => {
    const lines = linesFromStarts(['a', 'b', 'c'], [1, 4, 9], 12);
    expect(lines.map((l) => [l.start, l.end])).toEqual([
      [1, 4],
      [4, 9],
      [9, 12],
    ]);
  });
});

describe('timing adjustment', () => {
  const base = linesFromStarts(['a', 'b', 'c', 'd'], [2, 4, 6, 8], 20);

  it('shifts every line by the offset', () => {
    const out = adjustTiming(base, { offset: 1.5, stretch: 1 }, 20);
    expect(out.map((l) => l.start)).toEqual([3.5, 5.5, 7.5, 9.5]);
    expect(out[0].end).toBe(5.5);
  });

  it('stretch slows the pace while keeping the first line in place', () => {
    const out = adjustTiming(base, { offset: 0, stretch: 1.5 }, 20);
    expect(out.map((l) => l.start)).toEqual([2, 5, 8, 11]);
    const faster = adjustTiming(base, { offset: 0, stretch: 0.5 }, 20);
    expect(faster.map((l) => l.start)).toEqual([2, 3, 4, 5]);
  });

  it('clamps inside the song and keeps ends after starts', () => {
    const out = adjustTiming(base, { offset: -5, stretch: 4 }, 20);
    expect(out[0].start).toBe(0);
    for (const l of out) {
      expect(l.start).toBeLessThanOrEqual(20);
      expect(l.end).toBeGreaterThan(l.start);
    }
    expect(adjustTiming([], { offset: 1, stretch: 1 }, 20)).toEqual([]);
  });

  it('fits first and last line to tapped moments', () => {
    const one = fitTiming(base, 5, null, 1.2);
    expect(one).toEqual({ offset: 3, stretch: 1.2 });
    const two = fitTiming(base, 5, 17, 1);
    expect(two.stretch).toBe(2); // 6 s of lyrics now span 12 s
    const fitted = adjustTiming(base, two, 20);
    expect(fitted[0].start).toBe(5);
    expect(fitted[3].start).toBe(17);
    // A last point before the first is ignored rather than producing a negative pace.
    expect(fitTiming(base, 5, 3, 1).stretch).toBe(1);
  });
});

describe('lastStartedIndex', () => {
  const lines = spreadEvenly(['a', 'b', 'c'], 30);
  it('finds the current line by binary search', () => {
    expect(lastStartedIndex(lines, 0)).toBe(-1);
    expect(lastStartedIndex(lines, lines[0].start)).toBe(0);
    expect(lastStartedIndex(lines, lines[1].start + 0.1)).toBe(1);
    expect(lastStartedIndex(lines, 999)).toBe(2);
    expect(lastStartedIndex([], 5)).toBe(-1);
  });
});

describe('buildSong', () => {
  it('builds the sample song with LRC timings', async () => {
    const song = await buildSong({ title: '', artist: '', rawLyrics: SAMPLE_SONG.lyrics, audioDuration: null, fallbackDuration: 60 });
    expect(song.title).toBe('Paper Lanterns');
    expect(song.lines).toHaveLength(16);
    expect(song.timing).toBe('lrc');
    expect(song.duration).toBe(60);
    expect(song.analysis.lines).toHaveLength(16);
  });

  it('rejects empty lyrics with a friendly error', async () => {
    await expect(buildSong({ title: '', artist: '', rawLyrics: '   \n ', audioDuration: null })).rejects.toBeInstanceOf(FriendlyError);
    await expect(buildSong({ title: '', artist: '', rawLyrics: '[Chorus]\n[Verse]', audioDuration: null })).rejects.toThrow(/empty/);
  });

  it('rejects LRC where every line is past the end of the audio', async () => {
    await expect(
      buildSong({ title: 't', artist: 'a', rawLyrics: '[05:00.00] late\n[06:00.00] later', audioDuration: 30 }),
    ).rejects.toThrow(/after the end/);
  });

  it('re-spreads plain lyrics when audio is attached later', async () => {
    const song = await buildSong({ title: 't', artist: 'a', rawLyrics: 'one\ntwo\nthree', audioDuration: null });
    expect(song.timing).toBe('spread');
    const fitted = await retimeForAudio(song, 200);
    expect(fitted.duration).toBe(200);
    expect(fitted.lines[2].end).toBeLessThanOrEqual(200);
    expect(fitted.lines[2].start).toBeGreaterThan(song.lines[2].start);
  });
});
