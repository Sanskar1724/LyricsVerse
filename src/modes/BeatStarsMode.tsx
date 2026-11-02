import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { Emotion, Song } from '../types';
import { EMOTION_STYLES, hexToRgb } from '../lib/emotions';
import { beatIndexAt, snapToBeat } from '../lib/beats';
import { wordEmotion } from '../lib/analysis';
import type { ModeProps } from './types';
import { AdaptiveQuality, autoSizeCanvas, makeGlowSprite, prefersReducedMotion } from './canvas';
import { beatGridFor, seeded, wordTimes } from './words';

/** Words per set: when the 8th word arrives, a new set pops in. */
export const SET_SIZE = 7;
const GOLD = '#ecd9a8';
const GOLD_RGB = hexToRgb(GOLD);

interface StreamWord {
  text: string;
  /** When the word pops in, snapped onto the beat. */
  start: number;
  line: number;
  emotional: boolean;
}

/** Every word of the song in order, each landing on the nearest beat or half-beat. */
export function wordStream(song: Song): StreamWord[] {
  const grid = beatGridFor(song);
  const out: StreamWord[] = [];
  let prev = -Infinity;
  song.lines.forEach((line, li) => {
    for (const w of wordTimes(line)) {
      const start = Math.max(snapToBeat(w.start, grid, 0.2), prev + 0.12);
      prev = start;
      out.push({ text: w.text, start, line: li, emotional: wordEmotion(w.text) !== null });
    }
  });
  return out;
}

/** Seven spread-out spots for a set, inside the middle of the screen. Stable per set. */
function layoutSet(set: number, W: number, H: number): { x: number; y: number; seed: number }[] {
  const rand = seeded(set * 104729 + 7);
  const pts: { x: number; y: number; seed: number }[] = [];
  const minDist = Math.min(W, H) * 0.12;
  for (let k = 0; k < SET_SIZE; k++) {
    let best = { x: W / 2, y: H / 2 };
    let bestD = -1;
    // Best of 30 random tries: keeps words apart so labels don't collide.
    for (let tries = 0; tries < 30; tries++) {
      const c = { x: W * (0.3 + rand() * 0.4), y: H * (0.3 + rand() * 0.34) };
      const d = pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, p.y - c.y)), Infinity);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
      if (d >= minDist && tries > 4) break;
    }
    pts.push({ ...best, seed: rand() * 1000 });
  }
  // Visit the spots nearest-neighbour first, starting from the left, so the joining line flows
  // like a constellation instead of criss-crossing.
  const ordered = [pts.reduce((a, p) => (p.x < a.x ? p : a))];
  const rest = pts.filter((p) => p !== ordered[0]);
  while (rest.length) {
    const cur = ordered[ordered.length - 1];
    let bi = 0;
    for (let i = 1; i < rest.length; i++) {
      if (Math.hypot(rest[i].x - cur.x, rest[i].y - cur.y) < Math.hypot(rest[bi].x - cur.x, rest[bi].y - cur.y)) bi = i;
    }
    ordered.push(rest.splice(bi, 1)[0]);
  }
  // 2-opt: reverse any stretch that makes the path shorter. A shortest path never crosses itself.
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let improved = true, guard = 0; improved && guard < 50; guard++) {
    improved = false;
    for (let i = 0; i < ordered.length - 2; i++) {
      for (let j = i + 2; j < ordered.length - 1; j++) {
        const before = d(ordered[i], ordered[i + 1]) + d(ordered[j], ordered[j + 1]);
        const after = d(ordered[i], ordered[j]) + d(ordered[i + 1], ordered[j + 1]);
        if (after < before - 0.5) {
          ordered.splice(i + 1, j - i, ...ordered.slice(i + 1, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return ordered;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function easeOutBack(x: number): number {
  const c1 = 1.9;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Words appear one by one as gold sparkle-stars, exactly on the beat, joined by fine lines.
 * Seven words make a set; the eighth word sweeps the old set away and starts a new one.
 * Kick/bass pulses the stars, downbeats push harder, mids brighten the lines, highs twinkle the dust.
 */
export function BeatStarsMode({ song, index, player }: ModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stream = useMemo(() => wordStream(song), [song]);
  const grid = useMemo(() => beatGridFor(song), [song]);
  const live = useRef({ index, stream, grid, song });
  live.current = { index, stream, grid, song };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    const aq = new AdaptiveQuality();
    let W = 1;
    let H = 1;
    let S = 1;
    const layouts = new Map<number, ReturnType<typeof layoutSet>>();
    const sizer = autoSizeCanvas(
      canvas,
      (w, h, s) => {
        W = w;
        H = h;
        S = s;
        layouts.clear();
      },
      () => aq.quality,
    );
    const glowSprites = new Map<Emotion | 'gold', HTMLCanvasElement>();
    const glow = (key: Emotion | 'gold') => {
      let sp = glowSprites.get(key);
      if (!sp) {
        const rgb = key === 'gold' ? GOLD_RGB : hexToRgb(EMOTION_STYLES[key].color);
        glowSprites.set(key, (sp = makeGlowSprite(rgb, 64)));
      }
      return sp;
    };
    const dust = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, s: Math.random() * 10, v: 0.004 + Math.random() * 0.01 }));
    const layoutFor = (set: number) => {
      let l = layouts.get(set);
      if (!l) layouts.set(set, (l = layoutSet(set, W, H)));
      return l;
    };
    let lastSet = -2;
    let lastCount = -1;
    let lastBeatInBar = -1;
    let raf = 0;
    let last = performance.now();

    const drawSet = (set: number, upTo: number, now: number, t: number, pulse: number, mid: number, fade: number, scatter: number, newestEmotion: Emotion | null) => {
      const { stream: words } = live.current;
      const pts = layoutFor(set);
      const first = set * SET_SIZE;
      const motion = reduced ? 0.2 : 1;
      const placed: { x: number; y: number; pop: number }[] = [];
      let cx = 0;
      let cy = 0;
      for (const p of pts) {
        cx += p.x / pts.length;
        cy += p.y / pts.length;
      }
      for (let k = first; k <= upTo; k++) {
        const p = pts[k - first];
        const age = t - words[k].start;
        const pop = fade < 1 ? 1 : easeOutBack(Math.min(1, Math.max(0, age / 0.35)));
        // Words keep floating; the whole set breathes out from its centre on each beat.
        const drift = 10 * motion;
        const breathe = 1 + pulse * 0.035 * motion + scatter * 0.9;
        const x = cx + (p.x - cx) * breathe + Math.sin(now / 2300 + p.seed) * drift;
        const y = cy + (p.y - cy) * breathe + Math.cos(now / 2900 + p.seed * 1.7) * drift - scatter * 20;
        placed.push({ x, y, pop });
      }
      // Lines: the newest segment draws itself in.
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1;
      for (let i = 1; i < placed.length; i++) {
        const a = placed[i - 1];
        const b = placed[i];
        const draw = Math.min(1, Math.max(0, (t - words[first + i].start) / 0.25));
        const f = fade < 1 ? 1 : draw;
        ctx.globalAlpha = fade * (0.3 + mid * 0.35 + pulse * 0.2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        ctx.stroke();
      }
      // Stars and words.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < placed.length; i++) {
        const k = first + i;
        const w = words[k];
        const { x, y, pop } = placed[i];
        const newest = k === upTo && fade === 1;
        const size = (newest ? 11 : w.emotional ? 7.5 : 6) * pop * (1 + pulse * 0.25);
        if (newest) {
          const halo = 16 + pulse * 10;
          ctx.globalAlpha = 0.85 * fade;
          const g = halo * 2.4;
          ctx.drawImage(glow('gold'), x - g, y - g, g * 2, g * 2);
          // The mood shows only as a thin coloured ring; everything else stays gold.
          ctx.strokeStyle = newestEmotion ? EMOTION_STYLES[newestEmotion].color : GOLD;
          ctx.globalAlpha = 0.55 * fade;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, halo * pop, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = fade * (newest ? 1 : 0.8);
        ctx.fillStyle = GOLD;
        sparkle(ctx, x, y, size);
        const font = newest ? 30 * (1 + pulse * 0.08) : w.emotional ? 19 : 15;
        ctx.font = `${newest ? 700 : 500} ${Math.round(font * Math.max(0.3, pop))}px 'Outfit Variable', system-ui, sans-serif`;
        ctx.globalAlpha = fade * (newest ? 1 : w.emotional ? 0.85 : 0.6) * Math.min(1, pop + 0.2);
        ctx.fillStyle = newest ? '#fff6dc' : GOLD;
        // Labels sit above or below their star, alternating, so neighbours don't collide.
        const off = (newest ? 32 : 18) * (i % 2 === 0 ? -1 : 1);
        ctx.fillText(w.text, x, y + off);
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      if (aq.update(now - last)) sizer.resize();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { index: idx, stream: words, grid: g, song: s } = live.current;
      const t = player.currentTime;
      const en = player.sampleEnergy();

      // Beat from the song's beat map: exact, no detection lag.
      const bi = beatIndexAt(g.times, t);
      let pulse = 0;
      let beatInBar = -1;
      if (bi >= 0 && t - g.times[bi] < 2) {
        beatInBar = (((bi - g.downbeat) % 4) + 4) % 4;
        const strength = beatInBar === 0 ? 1 : 0.6;
        pulse = Math.exp(-(t - g.times[bi]) / 0.14) * strength;
      }
      if (player.kind === 'audio') pulse = Math.max(pulse, en.pulse * 0.5);
      if (!player.playing) pulse *= 0.3;

      // Which word is the newest one we may show? (During the game, upcoming lines stay hidden.)
      let k = -1;
      let lo = 0;
      let hi = words.length - 1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (words[m].start <= t) {
          k = m;
          lo = m + 1;
        } else hi = m - 1;
      }
      while (k >= 0 && words[k].line > idx) k--;

      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Dust twinkles with the hi-hats.
      ctx.fillStyle = GOLD;
      for (const d of dust) {
        d.y -= d.v * dt * (player.playing ? 1 : 0.2);
        if (d.y < -0.02) d.y = 1.02;
        ctx.globalAlpha = 0.08 + 0.35 * en.high * (0.5 + 0.5 * Math.sin(now / 160 + d.s));
        ctx.fillRect(d.x * W, d.y * H, d.r, d.r);
      }
      ctx.globalAlpha = 1;

      const set = k >= 0 ? Math.floor(k / SET_SIZE) : -1;
      if (set >= 0) {
        const newestEmotion = s.analysis.lines[words[k].line]?.emotion ?? null;
        const setStart = words[set * SET_SIZE].start;
        const since = t - setStart;
        // The previous set drifts up and fades as the new one pops in.
        if (set > 0 && since < 0.5) {
          const p = since / 0.5;
          drawSet(set - 1, set * SET_SIZE - 1, now, t, pulse, en.mid, (1 - p) * (1 - p), p, null); // bursts outward and clears fast
        }
        drawSet(set, k, now, t, pulse, en.mid, 1, 0, newestEmotion);
      }

      // Keep the DOM bits in sync, touching them only when something changes.
      const count = set >= 0 ? k - set * SET_SIZE + 1 : 0;
      if (set !== lastSet || count !== lastCount) {
        lastSet = set;
        lastCount = count;
        rootRef.current?.setAttribute('data-set', String(set));
        rootRef.current?.setAttribute('data-words', String(count));
        const dots = dotsRef.current?.children;
        if (dots) for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < count);
      }
      if (beatInBar !== lastBeatInBar) {
        lastBeatInBar = beatInBar;
        const bars = barRef.current?.children;
        if (bars) for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i === beatInBar);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sizer.stop();
      layouts.clear();
      glowSprites.clear();
    };
  }, [player]);

  const line = index >= 0 ? song.lines[index] : null;
  const an = index >= 0 ? song.analysis.lines[index] : null;
  const st = an ? EMOTION_STYLES[an.emotion] : null;

  return (
    <div className="mode stars-mode" ref={rootRef} data-testid="mode-stars" data-set="-1" data-words="0">
      <canvas ref={canvasRef} className="mode-canvas" aria-hidden />
      <div className="stars-dots" ref={dotsRef} aria-hidden>
        {Array.from({ length: SET_SIZE }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="stars-tempo" aria-label={`${Math.round(grid.bpm)} beats per minute`}>
        <div className="stars-bar" ref={barRef} aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <span>♩ {Math.round(grid.bpm)} BPM</span>
      </div>
      {line && (
        <p className="stars-caption" key={index} data-testid="current-line" dir="auto" style={{ '--emo': st?.color ?? GOLD } as CSSProperties}>
          {line.text}
        </p>
      )}
    </div>
  );
}
