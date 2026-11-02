import type { BeatShape } from '../lib/looks';

/** Per-beat variation, so no two beats on the heartbeat graph look copy-pasted. */
export interface BeatVariation {
  /** Overall height multiplier. */
  amp: number;
  /** Width multiplier for every wave. */
  width: number;
  /** Small timing nudge, seconds. */
  shift: number;
  /** Size of the little bumps around the main spike. */
  minor: number;
  /** Extra free parameter (e.g. ringing frequency). */
  extra: number;
}

/** Deterministic 0–1 random from two integers (beat index and a session salt). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export function variationFor(beat: number, salt: number): BeatVariation {
  const r = (k: number) => hash01(beat * 7 + k, salt);
  return {
    amp: 0.72 + r(1) * 0.56,
    width: 0.8 + r(2) * 0.55,
    shift: (r(3) - 0.5) * 0.02,
    minor: 0.5 + r(4) * 1.1,
    extra: r(5),
  };
}

/**
 * Height of the trace `d` seconds after a beat (roughly −0.5…1.3), for a given style and variation.
 */
export function beatShape(kind: BeatShape, d: number, v: BeatVariation): number {
  const x = d - v.shift;
  const w = v.width;
  const g = (mu: number, sig: number, a: number) => a * Math.exp(-((x - mu) ** 2) / (2 * (sig * w) ** 2));
  switch (kind) {
    case 'ecg': // classic P-QRS-T heartbeat
      return v.amp * (g(-0.16, 0.025, 0.12 * v.minor) + g(-0.03, 0.008, -0.18) + g(0, 0.011, 1) + g(0.03, 0.01, -0.35) + g(0.2, 0.045, 0.28 * v.minor));
    case 'lubdub': // two beats close together, like a real heart sound
      return v.amp * (g(0, 0.013, 0.95) + g(0.022, 0.01, -0.25) + g(0.11 + v.extra * 0.05, 0.014, 0.55 + 0.3 * v.minor) + g(0.14 + v.extra * 0.05, 0.012, -0.15));
    case 'spike': {
      // sharp hit that rings out, like a seismograph
      if (x < -0.01) return 0;
      const f = 14 + v.extra * 12;
      return v.amp * 1.15 * Math.exp(-Math.max(0, x) / (0.05 * w)) * Math.cos(2 * Math.PI * f * Math.max(0, x)) * (x < 0 ? (x + 0.01) / 0.01 : 1);
    }
    case 'wave': // soft swell
      return v.amp * (g(0, 0.05, 0.75) - g(0.14, 0.05, 0.28 * v.minor));
    case 'zigzag': // quick alternating jolts
      return v.amp * (g(0, 0.007, 1) + g(0.035, 0.007, -0.75) + g(0.07, 0.007, 0.55 * v.minor) + g(0.105, 0.007, -0.3 * v.minor));
  }
}
