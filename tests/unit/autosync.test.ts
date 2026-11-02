import { describe, expect, it } from 'vitest';
import { AutoSyncError, autoSync, countSyllables, detectVocals, vocalFeatures } from '../../src/lib/autosync';

const SR = 16000;

/**
 * A fake stereo song: constant bass in the centre, a guitar panned hard left (vocal range, should be ignored),
 * and "vocals" (harmonic stack with vibrato and syllable pulses) in the centre during `sung` intervals.
 */
function fakeSong(seconds: number, sung: [number, number][], opts: { guitar?: boolean; vocals?: boolean } = {}) {
  const n = Math.floor(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bass = 0.3 * Math.sin(2 * Math.PI * 70 * t) * (0.6 + 0.4 * Math.exp(-((t * 2) % 1) * 5));
    let vox = 0;
    if (opts.vocals !== false && sung.some(([a, b]) => t >= a && t < b)) {
      const f0 = 220 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t));
      const syll = 0.65 + 0.35 * Math.sin(2 * Math.PI * 4 * t);
      for (let h = 1; h <= 6; h++) vox += Math.sin(2 * Math.PI * f0 * h * t) / h;
      vox *= 0.12 * syll;
    }
    const guitar = opts.guitar === false ? 0 : 0.12 * Math.sin(2 * Math.PI * 523 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 1.3 * t));
    left[i] = bass + vox + guitar;
    right[i] = bass + vox;
  }
  return [left, right];
}

describe('syllable counting', () => {
  it('counts English, Hindi and CJK roughly', () => {
    expect(countSyllables('hello')).toBe(2);
    expect(countSyllables('I love you')).toBe(3);
    expect(countSyllables('beautiful')).toBe(3);
    expect(countSyllables('time')).toBe(1);
    expect(countSyllables('दिल')).toBe(2);
    expect(countSyllables('雨が降る')).toBe(4);
    expect(countSyllables('🎉')).toBe(1); // never zero
    expect(countSyllables('la la la la la la')).toBe(6);
  });
});

describe('vocal detection', () => {
  it('finds sung phrases and ignores bass and a side-panned guitar', () => {
    const sung: [number, number][] = [
      [2, 4.5],
      [6, 8],
      [10, 13],
    ];
    const det = detectVocals(vocalFeatures(fakeSong(15, sung), SR));
    expect(det.segments).toHaveLength(3);
    det.segments.forEach((s, i) => {
      expect(Math.abs(s.start - sung[i][0])).toBeLessThan(0.25);
      expect(Math.abs(s.end - sung[i][1])).toBeLessThan(0.35);
    });
  });

  it('finds nothing in an instrumental', () => {
    const det = detectVocals(vocalFeatures(fakeSong(8, [], { vocals: false }), SR));
    const sungTotal = det.segments.reduce((s, x) => s + x.end - x.start, 0);
    expect(sungTotal).toBeLessThan(1);
  });

  it('handles empty audio', () => {
    expect(vocalFeatures([], SR).score.length).toBe(0);
    expect(detectVocals(vocalFeatures([new Float32Array(0)], SR)).segments).toEqual([]);
  });
});

describe('auto-sync alignment', () => {
  it('lines up lyric lines with sung phrases, including an instrumental break', () => {
    const sung: [number, number][] = [
      [1.5, 4],
      [4.6, 7],
      [12, 14.5], // after an instrumental break
      [15.2, 18],
    ];
    const texts = ['la la la la la la la la', 'la la la la la la la la', 'la la la la la la la la', 'la la la la la la la la la'];
    const res = autoSync(texts, fakeSong(20, sung), SR, 20);
    expect(res.lines).toHaveLength(4);
    res.lines.forEach((l, i) => {
      expect(Math.abs(l.start - sung[i][0])).toBeLessThan(0.3);
      expect(l.end).toBeGreaterThan(l.start);
    });
    // The line before the break ends when the singing stops, not when the next line starts.
    expect(res.lines[1].end).toBeLessThan(8.5);
    expect(res.confidence).toBeGreaterThan(0.5);
    expect(res.segments).toHaveLength(4);
  });

  it('gives longer lines more time and keeps starts increasing', () => {
    const sung: [number, number][] = [
      [1, 3],
      [3.6, 9.6], // one long phrase that holds two lines
      [10.5, 12.5],
    ];
    const texts = ['short line here', 'this line has a lot more words to sing', 'and so does this one with many words', 'the end now'];
    const res = autoSync(texts, fakeSong(14, sung, { guitar: false }), SR, 14);
    const starts = res.lines.map((l) => l.start);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    expect(Math.abs(starts[0] - 1)).toBeLessThan(0.3);
    expect(Math.abs(starts[1] - 3.6)).toBeLessThan(0.3);
    expect(starts[2]).toBeGreaterThan(4.5);
    expect(starts[2]).toBeLessThan(9.6);
    expect(Math.abs(starts[3] - 10.5)).toBeLessThan(0.3);
  });

  it('explains when there is no singing', () => {
    expect(() => autoSync(['hello'], fakeSong(6, [], { vocals: false }), SR, 6)).toThrow(AutoSyncError);
    expect(() => autoSync([], fakeSong(2, [[0.5, 1.5]]), SR, 2)).toThrow(/no lyric lines/);
  });
});
