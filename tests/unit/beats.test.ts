import { describe, expect, it } from 'vitest';
import { beatIndexAt, detectBeats, snapToBeat, syntheticGrid } from '../../src/lib/beats';

const SR = 16000;

/** A drum loop: kick on every beat (stronger on beat 1), hi-hat on 8ths, a quiet pad underneath. */
function drumLoop(bpm: number, seconds: number, start = 0.5): { channels: Float32Array[]; beats: number[] } {
  const n = Math.floor(seconds * SR);
  const x = new Float32Array(n);
  const step = 60 / bpm;
  const beats: number[] = [];
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let b = 0; start + b * step < seconds - 0.2; b++) {
    const t0 = start + b * step;
    beats.push(t0);
    const amp = b % 4 === 0 ? 0.9 : 0.6;
    for (let i = 0; i < 0.15 * SR; i++) {
      const t = i / SR;
      const idx = Math.floor(t0 * SR) + i;
      if (idx < n) x[idx] += amp * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18);
    }
    for (const off of [0, step / 2]) {
      const h0 = Math.floor((t0 + off) * SR);
      for (let i = 0; i < 0.03 * SR; i++) if (h0 + i < n) x[h0 + i] += 0.12 * noise() * Math.exp(-i / (0.008 * SR));
    }
  }
  for (let i = 0; i < n; i++) x[i] += 0.05 * Math.sin((2 * Math.PI * 220 * i) / SR);
  return { channels: [x, x], beats };
}

function matchRate(found: number[], truth: number[], tol = 0.05): number {
  const inner = truth.slice(2, -2);
  return inner.filter((b) => found.some((f) => Math.abs(f - b) <= tol)).length / inner.length;
}

describe('beat tracking', () => {
  for (const bpm of [96, 120, 140]) {
    it(`finds the tempo and beats of a ${bpm} BPM drum loop`, () => {
      const { channels, beats } = drumLoop(bpm, 24);
      const grid = detectBeats(channels, SR);
      expect(grid).not.toBeNull();
      expect(Math.abs(grid!.bpm - bpm)).toBeLessThan(3);
      expect(matchRate(grid!.times, beats)).toBeGreaterThan(0.9);
    });
  }

  it('finds beat 1 of the bar from the stronger kick', () => {
    const { channels, beats } = drumLoop(120, 20);
    const grid = detectBeats(channels, SR)!;
    const downbeats = grid.times.filter((_, i) => i % 4 === grid.downbeat);
    const trueDownbeats = beats.filter((_, i) => i % 4 === 0);
    const hits = downbeats.filter((d) => trueDownbeats.some((b) => Math.abs(b - d) < 0.05)).length;
    expect(hits / downbeats.length).toBeGreaterThan(0.8);
  });

  it('returns null for silence and very short audio', () => {
    expect(detectBeats([new Float32Array(SR * 10)], SR)).toBeNull();
    expect(detectBeats([new Float32Array(SR)], SR)).toBeNull();
    expect(detectBeats([], SR)).toBeNull();
  });
});

describe('beat helpers', () => {
  const grid = syntheticGrid(10, 120); // beats every 0.5 s

  it('builds a steady synthetic grid', () => {
    expect(grid.times.slice(0, 4)).toEqual([0, 0.5, 1, 1.5]);
    expect(grid.bpm).toBe(120);
  });

  it('finds the beat at a time', () => {
    expect(beatIndexAt(grid.times, 0.74)).toBe(1);
    expect(beatIndexAt(grid.times, -1)).toBe(-1);
  });

  it('snaps to the nearest beat or half-beat within the window', () => {
    expect(snapToBeat(1.08, grid)).toBe(1);
    expect(snapToBeat(1.3, grid)).toBe(1.25); // half-beat
    expect(snapToBeat(1.12, grid, 0.05)).toBe(1.12); // too far: unchanged
  });
});
