import { EMOTIONS, type Emotion, type Song } from '../types';
import { EMOTION_STYLES, rgba } from './emotions';
import { formatTime } from './lyrics';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const SURFACE = '#0c0a16';
const INK = '#f4f1ff';
const INK_2 = '#b9b3d1';
const INK_3 = '#7d7799';
const GRID = 'rgba(255,255,255,0.08)';
const FONT = `'Outfit Variable', 'Segoe UI', 'Nirmala UI', 'Noto Sans Devanagari', system-ui, sans-serif`;

export interface DnaStats {
  slices: { emotion: Emotion; pct: number }[];
  dominant: Emotion;
  dominantPct: number;
  themes: string[];
  peak: { text: string; emotion: Emotion; intensity: number; time: number } | null;
  heartbeat: { t: number; intensity: number; emotion: Emotion }[];
  duration: number;
}

export function dnaStats(song: Song): DnaStats {
  const a = song.analysis;
  const slices = EMOTIONS.map((emotion) => ({ emotion, pct: a.breakdown[emotion] })).filter((s) => s.pct > 0);
  const peakIdx = a.peakLine;
  return {
    slices,
    dominant: a.dominant,
    dominantPct: a.breakdown[a.dominant],
    themes: a.themes.map((t) => t.theme),
    peak:
      peakIdx >= 0 && song.lines[peakIdx]
        ? {
            text: song.lines[peakIdx].text,
            emotion: a.lines[peakIdx].emotion,
            intensity: a.lines[peakIdx].intensity,
            time: song.lines[peakIdx].start,
          }
        : null,
    heartbeat: song.lines.map((l, i) => ({ t: l.start, intensity: a.lines[i]?.intensity ?? 0, emotion: a.lines[i]?.emotion ?? 'calm' })),
    duration: song.duration,
  };
}

function font(size: number, weight = 400): string {
  return `${weight} ${size}px ${FONT}`;
}

/** Break text into lines that fit maxWidth; adds an ellipsis if it needs more than maxLines. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  // A single very long word (or a script without spaces) can still overflow: hard-trim it.
  return lines.map((l) => {
    let s = l;
    while (s.length > 1 && ctx.measureText(s).width > maxWidth) s = s.slice(0, -1);
    return s === l ? l : s + '…';
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sectionLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = INK_3;
  ctx.font = font(22, 600);
  ctx.letterSpacing = '4px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

/** Draw the shareable Song DNA card onto a canvas (resized to the card's size). */
export function drawDnaCard(canvas: HTMLCanvasElement, song: Song, now = new Date()): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = dnaStats(song);
  const dom = EMOTION_STYLES[s.dominant];
  const pad = 80;

  // Background with a glow in the dominant colour.
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow = ctx.createRadialGradient(CARD_WIDTH * 0.8, 120, 40, CARD_WIDTH * 0.8, 120, 900);
  glow.addColorStop(0, rgba(dom.color, 0.32));
  glow.addColorStop(1, rgba(dom.color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow2 = ctx.createRadialGradient(80, CARD_HEIGHT, 40, 80, CARD_HEIGHT, 700);
  glow2.addColorStop(0, 'rgba(201,166,255,0.16)');
  glow2.addColorStop(1, 'rgba(201,166,255,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Header
  sectionLabel(ctx, '🧬 Song DNA', pad, 110);
  ctx.fillStyle = INK;
  ctx.font = font(68, 700);
  const titleLines = wrapText(ctx, song.title, CARD_WIDTH - pad * 2, 1);
  ctx.fillText(titleLines[0] ?? '', pad, 190);
  ctx.fillStyle = INK_2;
  ctx.font = font(34, 400);
  ctx.fillText(wrapText(ctx, song.artist, CARD_WIDTH - pad * 2, 1)[0] ?? '', pad, 240);

  // Donut
  const cx = pad + 200;
  const cy = 480;
  const rOuter = 190;
  const rInner = 122;
  let angle = -Math.PI / 2;
  const total = s.slices.reduce((sum, x) => sum + x.pct, 0) || 1;
  for (const slice of s.slices) {
    const sweep = (slice.pct / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, angle, angle + sweep);
    ctx.arc(cx, cy, rInner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = EMOTION_STYLES[slice.emotion].color;
    ctx.fill();
    if (s.slices.length > 1) {
      ctx.strokeStyle = SURFACE; // 2px surface gap between segments
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    angle += sweep;
  }
  if (s.slices.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, (rOuter + rInner) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = rOuter - rInner;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = font(64, 400);
  ctx.fillText(dom.emoji, cx, cy - 6);
  ctx.fillStyle = INK;
  ctx.font = font(44, 700);
  ctx.fillText(`${Math.round(s.dominantPct)}%`, cx, cy + 48);
  ctx.fillStyle = INK_2;
  ctx.font = font(24, 500);
  ctx.fillText(dom.label, cx, cy + 80);

  // Legend (always labelled, so colour is never the only cue)
  ctx.textAlign = 'left';
  const legendX = 560;
  const sorted = [...s.slices].sort((a, b) => b.pct - a.pct);
  const rowH = Math.min(52, 420 / Math.max(1, sorted.length));
  let ly = cy - (sorted.length * rowH) / 2 + rowH * 0.7;
  for (const slice of sorted) {
    const st = EMOTION_STYLES[slice.emotion];
    ctx.beginPath();
    ctx.arc(legendX + 10, ly - 9, 10, 0, Math.PI * 2);
    ctx.fillStyle = st.color;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = font(30, 500);
    ctx.fillText(`${st.emoji}  ${st.label}`, legendX + 34, ly);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK_2;
    ctx.font = font(30, 600);
    ctx.fillText(`${slice.pct.toFixed(0)}%`, CARD_WIDTH - pad, ly);
    ctx.textAlign = 'left';
    ly += rowH;
  }

  // Themes
  let y = 750;
  sectionLabel(ctx, 'Top themes', pad, y);
  y += 26;
  let tx = pad;
  ctx.font = font(28, 600);
  const themes = s.themes.length ? s.themes : ['a mood of its own'];
  for (const t of themes) {
    const label = `#${t}`;
    const w = ctx.measureText(label).width + 44;
    if (tx + w > CARD_WIDTH - pad) break;
    roundRect(ctx, tx, y, w, 54, 27);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label, tx + 22, y + 37);
    tx += w + 14;
  }

  // Most emotional line
  y = 890;
  sectionLabel(ctx, 'Most emotional line', pad, y);
  if (s.peak) {
    const st = EMOTION_STYLES[s.peak.emotion];
    ctx.font = font(38, 500);
    const lines = wrapText(ctx, `“${s.peak.text}”`, CARD_WIDTH - pad * 2 - 60, 2);
    const boxH = 40 + lines.length * 50 + 44;
    roundRect(ctx, pad, y + 22, CARD_WIDTH - pad * 2, boxH, 22);
    ctx.fillStyle = rgba(st.color, 0.14);
    ctx.fill();
    ctx.fillStyle = st.color;
    ctx.fillRect(pad, y + 22 + 18, 6, boxH - 36);
    ctx.fillStyle = INK;
    lines.forEach((l, i) => ctx.fillText(l, pad + 36, y + 22 + 62 + i * 50));
    ctx.font = font(24, 500);
    ctx.fillStyle = INK_2;
    ctx.fillText(
      `${st.emoji} ${st.label} · ${Math.round(s.peak.intensity * 100)}% intensity · at ${formatTime(s.peak.time)}`,
      pad + 36,
      y + 22 + boxH - 22,
    );
  }

  // Mood heartbeat
  const gy = 1100;
  sectionLabel(ctx, 'Mood heartbeat', pad, gy);
  const gx0 = pad;
  const gx1 = CARD_WIDTH - pad;
  const gTop = gy + 24;
  const gBottom = gy + 130;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const yy = gBottom - (gBottom - gTop) * f;
    ctx.beginPath();
    ctx.moveTo(gx0, yy);
    ctx.lineTo(gx1, yy);
    ctx.stroke();
  }
  const dur = Math.max(1, s.duration);
  const pts = s.heartbeat.map((p) => ({
    x: gx0 + (Math.min(p.t, dur) / dur) * (gx1 - gx0),
    y: gBottom - p.intensity * (gBottom - gTop),
    e: p.emotion,
  }));
  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const mx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
    }
    ctx.strokeStyle = 'rgba(244,241,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const dotR = pts.length > 80 ? 3 : 7;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = EMOTION_STYLES[p.e].color;
    ctx.fill();
    ctx.strokeStyle = SURFACE; // surface ring keeps overlapping dots legible
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.font = font(20, 500);
  ctx.fillStyle = INK_3;
  ctx.fillText('0:00', gx0, gBottom + 30);
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(dur), gx1, gBottom + 30);

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = INK_3;
  ctx.font = font(22, 500);
  ctx.fillText(`Made with LyricVerse ✨ · ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, CARD_WIDTH / 2, CARD_HEIGHT - 40);
}

export function dnaFileName(song: Song): string {
  const slug = song.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'song'}-dna.png`;
}
