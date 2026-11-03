import { describe, expect, it } from 'vitest';
import { ENTRANCES, FONTS, hexToHsl, hslToHex, LIGHTS, makeLooks, paletteFor, rng, SCENES, SPECTRUM_STYLES } from '../../src/lib/looks';
import { EMOTIONS, type Emotion } from '../../src/types';

const emotions: Emotion[] = Array.from({ length: 200 }, (_, i) => EMOTIONS[i % EMOTIONS.length]);

describe('line looks', () => {
  it('is deterministic for a seed and different across seeds', () => {
    expect(makeLooks(emotions, 42)).toEqual(makeLooks(emotions, 42));
    expect(makeLooks(emotions, 42)).not.toEqual(makeLooks(emotions, 43));
  });

  it('never repeats the font, entrance or scene on consecutive lines', () => {
    const looks = makeLooks(emotions, 7);
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i].font).not.toBe(looks[i - 1].font);
      expect(looks[i].entrance).not.toBe(looks[i - 1].entrance);
      expect(looks[i].scene).not.toBe(looks[i - 1].scene);
      expect(looks[i].beat).not.toBe(looks[i - 1].beat);
      expect(looks[i].spectrum).not.toBe(looks[i - 1].spectrum);
      expect(looks[i].lights).not.toBe(looks[i - 1].lights);
    }
  });

  it('uses the whole variety over a song', () => {
    const looks = makeLooks(emotions, 99);
    expect(new Set(looks.map((l) => l.font)).size).toBe(FONTS.length);
    expect(new Set(looks.map((l) => l.entrance)).size).toBe(ENTRANCES.length);
    expect(new Set(looks.map((l) => l.scene)).size).toBe(SCENES.length);
    expect(new Set(looks.map((l) => l.spectrum)).size).toBe(SPECTRUM_STYLES.length);
    expect(new Set(looks.map((l) => l.lights)).size).toBe(LIGHTS.length);
    expect(looks.some((l) => (l.ornament as string) === 'underline')).toBe(false);
    for (const l of looks) expect(l.beams).toBeGreaterThanOrEqual(2), expect(l.beams).toBeLessThanOrEqual(5);
  });

  it('keeps tilt and offset gentle and the poster font in capitals', () => {
    for (const l of makeLooks(emotions, 3)) {
      expect(Math.abs(l.tilt)).toBeLessThanOrEqual(3);
      expect(Math.abs(l.offsetY)).toBeLessThanOrEqual(7);
      if (l.font === 'display') expect(l.upper).toBe(true);
      for (const c of l.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(makeLooks([], 1)).toEqual([]);
  });

  it('builds palettes around the mood colour', () => {
    const [h] = hexToHsl(paletteFor('sadness', rng(5))[0]);
    const [base] = hexToHsl('#4a83ff');
    const diff = Math.min(Math.abs(h - base), 360 - Math.abs(h - base));
    expect(diff).toBeLessThanOrEqual(26);
  });

  it('round-trips colours through HSL', () => {
    for (const hex of ['#ff6fb5', '#4a83ff', '#7cf29a', '#000000', '#ffffff']) {
      const [h, s, l] = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
  });
});
