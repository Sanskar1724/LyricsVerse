import { describe, expect, it } from 'vitest';
import { beatShape, hash01, variationFor } from '../../src/modes/beatShapes';
import { BEAT_SHAPES } from '../../src/lib/looks';

const sample = (kind: (typeof BEAT_SHAPES)[number], beat: number, salt: number) =>
  Array.from({ length: 60 }, (_, i) => beatShape(kind, -0.2 + i * 0.01, variationFor(beat, salt)));

describe('heartbeat shapes', () => {
  it('every style peaks near the beat and stays in range', () => {
    for (const kind of BEAT_SHAPES) {
      const v = { amp: 1, width: 1, shift: 0, minor: 1, extra: 0.5 };
      const peak = Math.max(...Array.from({ length: 40 }, (_, i) => beatShape(kind, -0.02 + i * 0.001, v)));
      expect(peak).toBeGreaterThan(0.6);
      for (let d = -0.3; d < 0.4; d += 0.005) {
        const y = beatShape(kind, d, v);
        expect(y).toBeGreaterThan(-1);
        expect(y).toBeLessThan(1.5);
      }
      expect(Math.abs(beatShape(kind, -0.45, v))).toBeLessThan(0.01); // flat between beats
    }
  });

  it('the styles look different from each other', () => {
    const curves = BEAT_SHAPES.map((k) => sample(k, 3, 99).map((y) => y.toFixed(2)).join());
    expect(new Set(curves).size).toBe(BEAT_SHAPES.length);
  });

  it('each beat varies, and a new session gives new variations', () => {
    expect(sample('ecg', 1, 5)).not.toEqual(sample('ecg', 2, 5));
    expect(sample('ecg', 1, 5)).not.toEqual(sample('ecg', 1, 6));
    expect(sample('ecg', 1, 5)).toEqual(sample('ecg', 1, 5)); // stable while it scrolls across the screen
  });

  it('hash is spread over 0–1', () => {
    const xs = Array.from({ length: 500 }, (_, i) => hash01(i, 42));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.filter((x) => x < 0.5).length).toBeGreaterThan(200);
    expect(xs.filter((x) => x < 0.5).length).toBeLessThan(300);
  });
});
