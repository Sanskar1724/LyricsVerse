import { EMOTIONS, type Emotion } from '../types';

export interface EmotionStyle {
  label: string;
  emoji: string;
  /** Main colour, readable on dark backgrounds. */
  color: string;
  /** Deep colour used for the weather sky. */
  sky: [string, string];
  weather: string;
}

export const EMOTION_STYLES: Record<Emotion, EmotionStyle> = {
  joy: { label: 'Joy', emoji: '😄', color: '#ffc83d', sky: ['#3a2a06', '#8a5a12'], weather: 'Golden sparks' },
  sadness: { label: 'Sadness', emoji: '😢', color: '#4a83ff', sky: ['#060d22', '#1b2f5c'], weather: 'Rain' },
  anger: { label: 'Anger', emoji: '😠', color: '#ff4d5a', sky: ['#1c0306', '#5a0c14'], weather: 'Lightning' },
  love: { label: 'Love', emoji: '❤️', color: '#ff6fb5', sky: ['#22061a', '#6a1747'], weather: 'Petals' },
  longing: { label: 'Longing', emoji: '🌙', color: '#c9a6ff', sky: ['#0d0820', '#33215f'], weather: 'Falling stars' },
  hope: { label: 'Hope', emoji: '🌅', color: '#7cf29a', sky: ['#051a14', '#1d5a46'], weather: 'Dawn sparks' },
  fear: { label: 'Fear', emoji: '😨', color: '#e0894a', sky: ['#0a0603', '#2a1a0c'], weather: 'Dark mist' },
  calm: { label: 'Calm', emoji: '🍃', color: '#5ed6e0', sky: ['#04161a', '#164a52'], weather: 'Fog' },
};

export function emotionColor(e: Emotion): string {
  return EMOTION_STYLES[e].color;
}

export function emptyEmotionRecord(): Record<Emotion, number> {
  const r = {} as Record<Emotion, number>;
  for (const e of EMOTIONS) r[e] = 0;
  return r;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
