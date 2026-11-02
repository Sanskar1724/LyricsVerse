import type { Emotion } from '../types';
import { EMOTION_STYLES } from './emotions';

/**
 * A random "look" for each lyric line: font, entrance, finish, background scene and palette.
 * Variety is the point: consecutive lines never share the same font, entrance or scene.
 * Looks are generated once per playback session from a random seed, so every play feels fresh.
 */

export const FONTS = ['sans', 'serif', 'hand', 'display'] as const;
export const ENTRANCES = ['pop', 'rise', 'drop', 'slide', 'flip', 'unblur', 'wipe', 'zoom'] as const;
export const FINISHES = ['solid', 'gradient', 'outline', 'glow'] as const;
export const SCENES = ['aurora', 'nebula', 'sunset', 'prism', 'ocean'] as const;
export const ORNAMENTS = ['none', 'underline', 'sparkles'] as const;
/** Heartbeat-trace styles for the background graph. */
export const BEAT_SHAPES = ['ecg', 'lubdub', 'spike', 'wave', 'zigzag'] as const;

export type FontKey = (typeof FONTS)[number];
export type Entrance = (typeof ENTRANCES)[number];
export type Finish = (typeof FINISHES)[number];
export type Scene = (typeof SCENES)[number];
export type Ornament = (typeof ORNAMENTS)[number];
export type BeatShape = (typeof BEAT_SHAPES)[number];

export interface LineLook {
  font: FontKey;
  entrance: Entrance;
  finish: Finish;
  scene: Scene;
  ornament: Ornament;
  /** How beats are drawn on the heartbeat graph while this line plays. */
  beat: BeatShape;
  upper: boolean;
  italic: boolean;
  weight: number;
  /** Letter spacing in em. */
  tracking: number;
  /** Degrees. */
  tilt: number;
  /** Vertical nudge, in vh. */
  offsetY: number;
  align: 'center' | 'left' | 'right';
  /** Three colours (hex): main, partner, deep. */
  palette: [string, string, string];
}

export const FONT_FAMILIES: Record<FontKey, string> = {
  sans: "'Outfit Variable', 'Segoe UI', 'Nirmala UI', system-ui, sans-serif",
  serif: "'Playfair Display Variable', Georgia, 'Nirmala UI', serif",
  hand: "'Caveat Variable', 'Segoe Print', 'Nirmala UI', cursive",
  display: "'Bebas Neue', 'Outfit Variable', 'Nirmala UI', sans-serif",
};

/** xorshift PRNG: deterministic for a given seed. */
export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, list: readonly T[], avoid?: T): T {
  const pool = list.length > 1 && avoid !== undefined ? list.filter((x) => x !== avoid) : list;
  return pool[Math.floor(rand() * pool.length)];
}

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** A palette built around the mood colour, with a random twist. */
export function paletteFor(emotion: Emotion, rand: () => number): [string, string, string] {
  const [h] = hexToHsl(EMOTION_STYLES[emotion].color);
  const main = h + (rand() - 0.5) * 50;
  const partner = main + (rand() < 0.5 ? 1 : -1) * (45 + rand() * 110);
  return [
    hslToHex(main, 75 + rand() * 20, 58 + rand() * 10),
    hslToHex(partner, 70 + rand() * 25, 55 + rand() * 12),
    hslToHex(main + 20, 60 + rand() * 20, 18 + rand() * 10),
  ];
}

export function makeLooks(emotions: Emotion[], seed: number): LineLook[] {
  const rand = rng(seed);
  const looks: LineLook[] = [];
  let prev: LineLook | null = null;
  for (const emotion of emotions) {
    const font = pick(rand, FONTS, prev?.font);
    const look: LineLook = {
      font,
      entrance: pick(rand, ENTRANCES, prev?.entrance),
      finish: pick(rand, FINISHES, prev?.finish),
      scene: pick(rand, SCENES, prev?.scene),
      ornament: pick(rand, ORNAMENTS),
      beat: pick(rand, BEAT_SHAPES, prev?.beat),
      upper: font === 'display' || (font === 'sans' && rand() < 0.3),
      italic: font === 'serif' && rand() < 0.6,
      weight: font === 'sans' ? (rand() < 0.5 ? 800 : 300) : font === 'serif' ? (rand() < 0.5 ? 700 : 500) : font === 'hand' ? 700 : 400,
      tracking: font === 'display' ? 0.04 + rand() * 0.06 : font === 'sans' && rand() < 0.3 ? 0.08 : 0,
      tilt: (rand() - 0.5) * 6,
      offsetY: (rand() - 0.5) * 14,
      align: rand() < 0.7 ? 'center' : rand() < 0.5 ? 'left' : 'right',
      palette: paletteFor(emotion, rand),
    };
    looks.push(look);
    prev = look;
  }
  return looks;
}

/** A fresh seed per session; tests can pin it with ?seed=123 in the URL. */
export function sessionSeed(): number {
  const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;
  if (fromUrl && /^\d+$/.test(fromUrl)) return parseInt(fromUrl, 10);
  return Math.floor(Math.random() * 2 ** 31);
}
