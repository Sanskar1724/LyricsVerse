import { useEffect, useRef, type CSSProperties } from 'react';
import type { Song } from '../types';
import { Player } from '../lib/player';
import { beatIndexAt } from '../lib/beats';
import { formatTime, lastStartedIndex } from '../lib/lyrics';
import type { LineLook, Scene } from '../lib/looks';
import { AdaptiveQuality, autoSizeCanvas, prefersReducedMotion } from './canvas';
import { beatGridFor } from './words';
import { beatShape, variationFor } from './beatShapes';

export type BackdropTone = 'vivid' | 'dark';

interface Props {
  song: Song;
  index: number;
  player: Player;
  looks: LineLook[];
  tone: BackdropTone;
}

/** The soft layer is drawn at a fraction of screen resolution: cheap, and the upscale makes it dreamy. */
const SOFT_SCALE = 0.3;
const ECG_WINDOW = 5;
const FADE_SECONDS = 1.2;
const BANDS = 96;
const GOLD = '#ecd9a8';
const NEUTRAL: [string, string, string] = ['#45b39d', '#7a6cff', '#14202a'];
/** Audio zones, like the Blacks / Shadows / Midtones / Highlights / Whites of a photo histogram. */
const ZONES: { label: string; from: number; to: number }[] = [
  { label: 'SUB', from: 30, to: 60 },
  { label: 'BASS', from: 60, to: 250 },
  { label: 'MIDS', from: 250, to: 2000 },
  { label: 'HIGHS', from: 2000, to: 6000 },
  { label: 'AIR', from: 6000, to: 16000 },
];

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

/** 0–1 position of a frequency on the log axis. */
function freqX(hz: number): number {
  return Math.log(hz / Player.SPECTRUM_MIN_HZ) / Math.log(Player.SPECTRUM_MAX_HZ / Player.SPECTRUM_MIN_HZ);
}

function drawWash(c: CanvasRenderingContext2D, scene: Scene, pal: [string, string, string], w: number, h: number, time: number, alpha: number) {
  if (alpha <= 0.01) return;
  const big = Math.max(w, h);
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a * alpha));
    g.addColorStop(1, hexA(color, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  switch (scene) {
    case 'aurora':
    case 'nebula':
      for (let i = 0; i < 3; i++) blob(w * (0.5 + 0.35 * Math.sin(time * 0.13 + i * 2.1)), h * (0.3 + 0.2 * Math.sin(time * 0.11 + i)), big * 0.45, pal[i % 2], 0.45);
      break;
    case 'sunset':
      blob(w * 0.5, h * 0.95, big * 0.6, pal[0], 0.5);
      blob(w * 0.2, h * 0.2, big * 0.4, pal[1], 0.3);
      break;
    case 'prism': {
      const cg = c.createConicGradient(time * 0.08, w / 2, h * 0.4);
      cg.addColorStop(0, hexA(pal[0], 0.3 * alpha));
      cg.addColorStop(0.5, hexA(pal[1], 0.3 * alpha));
      cg.addColorStop(1, hexA(pal[0], 0.3 * alpha));
      c.fillStyle = cg;
      c.fillRect(0, 0, w, h);
      break;
    }
    case 'ocean':
      blob(w * 0.2, h * 0.7, big * 0.5, pal[0], 0.4);
      blob(w * 0.85, h * 0.4, big * 0.45, pal[1], 0.35);
      break;
  }
}

/** Moving stage lights sweeping down from the ceiling. */
function drawBeams(c: CanvasRenderingContext2D, look: LineLook, w: number, h: number, time: number, pulse: number, alpha: number) {
  const n = look.beams;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x0 = w * ((i + 0.5) / n);
    const phase = i * 1.7;
    let swing = 0;
    switch (look.lights) {
      case 'sweep':
      case 'strobe':
        swing = 0.55 * Math.sin(time * 0.9 + phase * 0.4);
        break;
      case 'cross':
        swing = (i % 2 ? 1 : -1) * 0.6 * Math.sin(time * 1.1);
        break;
      case 'still':
        swing = (i - (n - 1) / 2) * 0.12 + 0.04 * Math.sin(time * 0.5 + phase);
        break;
    }
    const len = h * 1.4;
    const spread = 0.16;
    const color = look.palette[i % 2];
    const a = alpha * (0.2 + pulse * 0.35);
    const g = c.createLinearGradient(x0, 0, x0 + Math.sin(swing) * len, Math.cos(swing) * len);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(1, hexA(color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, -2);
    c.lineTo(x0 + Math.sin(swing - spread) * len, Math.cos(swing - spread) * len);
    c.lineTo(x0 + Math.sin(swing + spread) * len, Math.cos(swing + spread) * len);
    c.closePath();
    c.fill();
  }
  c.globalCompositeOperation = 'source-over';
}

/** The grid panel behind the histogram, drawn once per look and size, then reused. */
function renderPanel(look: LineLook | null, tone: BackdropTone, W: number, H: number, S: number, top: number, bottom: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(W * S));
  cv.height = Math.max(1, Math.round(H * S));
  const c = cv.getContext('2d')!;
  c.setTransform(S, 0, 0, S, 0, 0);
  const color = tone === 'dark' ? GOLD : (look?.palette[0] ?? NEUTRAL[0]);
  const tinted = tone === 'vivid' && look?.panel === 'tinted';
  const strength = tone === 'dark' ? 0.4 : 1;

  // Panel fill: darker on the left (sub) to lighter on the right (air), like the photo histogram.
  const fill = c.createLinearGradient(0, 0, W, 0);
  fill.addColorStop(0, hexA(color, (tinted ? 0.08 : 0.02) * strength));
  fill.addColorStop(1, hexA(color, (tinted ? 0.3 : 0.06) * strength));
  c.fillStyle = fill;
  c.fillRect(0, top, W, bottom - top);

  const grid = look?.grid ?? 'diamond';
  const step = 30;
  if (grid !== 'none') {
    c.strokeStyle = hexA(color, 0.13 * strength);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= W; x += step) {
      c.moveTo(x + 0.5, top);
      c.lineTo(x + 0.5, bottom);
    }
    for (let y = bottom; y >= top; y -= step) {
      c.moveTo(0, y + 0.5);
      c.lineTo(W, y + 0.5);
    }
    c.stroke();
    if (grid === 'diamond') {
      c.fillStyle = hexA(color, 0.3 * strength);
      for (let x = 0; x <= W; x += step * 2) {
        for (let y = bottom; y >= top; y -= step * 2) {
          c.beginPath();
          c.moveTo(x, y - 3);
          c.lineTo(x + 3, y);
          c.lineTo(x, y + 3);
          c.lineTo(x - 3, y);
          c.fill();
        }
      }
    }
  }
  // Zone separators and labels.
  c.strokeStyle = hexA(color, 0.35 * strength);
  c.beginPath();
  for (const z of ZONES.slice(1)) {
    const x = Math.round(freqX(z.from) * W) + 0.5;
    c.moveTo(x, top);
    c.lineTo(x, bottom);
  }
  c.stroke();
  c.font = "600 11px 'Outfit Variable', system-ui, sans-serif";
  c.textAlign = 'center';
  c.fillStyle = hexA(color, 0.6 * strength + 0.15);
  for (const z of ZONES) {
    const x = ((freqX(z.from) + freqX(z.to)) / 2) * W;
    c.fillText(z.label.split('').join(' '), x, bottom - 10);
  }
  return cv;
}

/**
 * The DJ-studio background shared by every style: colour wash, moving stage lights, a live frequency
 * histogram on a grid, LED level meters, a heartbeat trace and a deck readout with a spinning record.
 * Many details are rolled again for every line (see LineLook).
 */
export function Backdrop({ song, index, player, looks, tone }: Props) {
  const softRef = useRef<HTMLCanvasElement>(null);
  const sharpRef = useRef<HTMLCanvasElement>(null);
  const vinylRef = useRef<HTMLDivElement>(null);
  const ledsRef = useRef<HTMLSpanElement>(null);
  const remainRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ song, index, looks, tone });
  live.current = { song, index, looks, tone };
  const grid = beatGridFor(song);
  const look = index >= 0 ? looks[index] : undefined;

  useEffect(() => {
    const soft = softRef.current;
    const sharp = sharpRef.current;
    const sc = soft?.getContext('2d');
    const fx = sharp?.getContext('2d');
    if (!soft || !sharp || !sc || !fx) return;
    const reduced = prefersReducedMotion();
    const salt = Math.floor(Math.random() * 1e9); // fresh beat variations every session

    let sw = 1;
    let sh = 1;
    const resizeSoft = () => {
      sw = Math.max(1, Math.round(soft.clientWidth * SOFT_SCALE));
      sh = Math.max(1, Math.round(soft.clientHeight * SOFT_SCALE));
      soft.width = sw;
      soft.height = sh;
    };
    resizeSoft();
    const ro = new ResizeObserver(resizeSoft);
    ro.observe(soft);

    const aq = new AdaptiveQuality();
    let W = 1;
    let H = 1;
    let S = 1;
    const panels = new Map<string, HTMLCanvasElement>();
    const sizer = autoSizeCanvas(
      sharp,
      (w, h, s) => {
        W = w;
        H = h;
        S = s;
        panels.clear();
      },
      () => aq.quality,
    );

    const peaks = new Float32Array(BANDS);
    const heights = new Float32Array(BANDS);
    const history: { t: number; level: number }[] = [];
    let lastT = 0;
    let shownIdx = -2;
    let prevLook: LineLook | null = null;
    let changedAt = -Infinity;
    let strobe = 0;
    let vinylAngle = 0;
    let lastBeatLed = -2;
    let lastRemain = '';
    let lastBeatSeen = -1;
    let raf = 0;
    let last = performance.now();

    const levelAt = (t: number) => {
      if (!history.length) return 0.6;
      let lo = 0;
      let hi = history.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (history[m].t < t) lo = m + 1;
        else hi = m;
      }
      return history[lo].level;
    };
    const panelFor = (lk: LineLook | null, tn: BackdropTone, top: number, bottom: number) => {
      const key = `${tn}|${lk?.grid}|${lk?.panel}|${lk?.palette[0]}|${Math.round(W)}x${Math.round(H)}x${S}`;
      let p = panels.get(key);
      if (!p) {
        if (panels.size > 6) panels.clear();
        p = renderPanel(lk, tn, W, H, S, top, bottom);
        panels.set(key, p);
      }
      return p;
    };

    const frame = (now: number) => {
      if (aq.update(now - last)) sizer.resize();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { song: s, index: idx, looks: ls, tone: tn } = live.current;
      const t = player.currentTime;
      const playing = player.playing;
      const en = player.sampleEnergy();
      const g = beatGridFor(s);
      const secs = (now / 1000) * (reduced ? 0.3 : 1);
      const dark = tn === 'dark';

      // Beat from the beat map.
      const bi = beatIndexAt(g.times, t);
      let pulse = 0;
      let beatInBar = -1;
      if (bi >= 0) {
        beatInBar = (((bi - g.downbeat) % 4) + 4) % 4;
        pulse = Math.exp(-(t - g.times[bi]) / 0.15) * (beatInBar === 0 ? 1 : 0.6);
      }
      if (!playing) pulse *= 0.3;

      if (Math.abs(t - lastT) > 0.6) history.length = 0;
      lastT = t;
      if (playing) {
        history.push({ t, level: player.kind === 'audio' ? 0.35 + en.level * 0.75 : 0.75 });
        while (history.length && history[0].t < t - ECG_WINDOW - 1) history.shift();
      }

      if (idx !== shownIdx) {
        prevLook = ls[shownIdx] ?? null;
        shownIdx = idx;
        changedAt = now;
      }
      const look = idx >= 0 ? (ls[idx] ?? null) : null;
      const mix = Math.min(1, (now - changedAt) / 1000 / FADE_SECONDS);

      // Strobe on beat 1 of the bar, for "strobe" lines, now and then.
      if (look?.lights === 'strobe' && playing && !reduced && bi !== lastBeatSeen && beatInBar === 0 && Math.random() < 0.6) strobe = 1;
      lastBeatSeen = bi;
      strobe = Math.max(0, strobe - dt * 6);

      // ---------------- soft layer: colour wash + stage lights
      sc.globalAlpha = 1;
      sc.fillStyle = dark ? '#000000' : '#05060a';
      sc.fillRect(0, 0, sw, sh);
      const washAlpha = (dark ? 0.15 : 0.55) * (0.85 + pulse * 0.25);
      if (prevLook && mix < 1) drawWash(sc, prevLook.scene, prevLook.palette, sw, sh, secs, washAlpha * (1 - mix));
      if (look) drawWash(sc, look.scene, look.palette, sw, sh, secs, washAlpha * mix);
      if (look && !dark) drawBeams(sc, look, sw, sh, secs, pulse, mix);
      if (strobe > 0 && !dark) {
        sc.fillStyle = `rgba(255,255,255,${strobe * 0.22})`;
        sc.fillRect(0, 0, sw, sh);
      }
      const vg = sc.createRadialGradient(sw / 2, sh * 0.45, Math.min(sw, sh) * 0.2, sw / 2, sh * 0.45, Math.max(sw, sh) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0.15)');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      sc.fillStyle = vg;
      sc.fillRect(0, 0, sw, sh);

      // ---------------- sharp layer
      fx.setTransform(1, 0, 0, 1, 0, 0);
      fx.clearRect(0, 0, sharp.width, sharp.height);
      const top = H * 0.46;
      const bottom = H - 92;
      const panel = panelFor(look ?? ls[0] ?? null, tn, top, bottom);
      fx.globalAlpha = dark ? 0.6 : 1;
      fx.drawImage(panel, 0, 0);
      fx.globalAlpha = 1;
      fx.setTransform(S, 0, 0, S, 0, 0);

      // Live frequency histogram.
      const spec = player.spectrum(BANDS);
      const style = look?.spectrum ?? 'mountain';
      const pal = look?.palette ?? NEUTRAL;
      const c1 = dark ? GOLD : pal[0];
      const c2 = dark ? GOLD : pal[1];
      const maxH = (bottom - top) * 0.92;
      const bw = W / BANDS;
      const boost = 0.92 + pulse * 0.1;
      for (let i = 0; i < BANDS; i++) {
        heights[i] = Math.min(1, spec[i] * boost) * maxH;
        peaks[i] = Math.max(peaks[i] - dt * maxH * 0.25, heights[i]);
      }
      const tintedPanel = !dark && look?.panel === 'tinted';
      const grad = fx.createLinearGradient(0, bottom - maxH, 0, bottom);
      grad.addColorStop(0, hexA(c2, dark ? 0.35 : 0.75));
      grad.addColorStop(1, hexA(c1, dark ? 0.15 : 0.35));
      // A dark mountain on a coloured grid, like the photo histogram, or a glowing one on a dark grid.
      const fillStyle: string | CanvasGradient = tintedPanel ? 'rgba(22, 25, 31, 0.86)' : grad;
      fx.globalAlpha = dark ? 0.55 : 1;

      if (style === 'mountain' || style === 'mirror') {
        const mid = style === 'mirror' ? (top + bottom) / 2 : bottom;
        const scale = style === 'mirror' ? 0.5 : 1;
        fx.fillStyle = fillStyle;
        fx.beginPath();
        fx.moveTo(0, mid);
        for (let i = 0; i < BANDS; i++) {
          const y = mid - heights[i] * scale;
          fx.lineTo(i * bw, y);
          fx.lineTo((i + 1) * bw, y); // stepped edge, like a histogram
        }
        if (style === 'mirror') {
          for (let i = BANDS - 1; i >= 0; i--) {
            const y = mid + heights[i] * scale;
            fx.lineTo((i + 1) * bw, y);
            fx.lineTo(i * bw, y);
          }
        } else fx.lineTo(W, mid);
        fx.closePath();
        fx.fill();
        fx.strokeStyle = hexA(c1, 0.9);
        fx.lineWidth = 1.2;
        fx.stroke();
      } else if (style === 'bars') {
        fx.fillStyle = fillStyle;
        for (let i = 0; i < BANDS; i++) {
          const hgt = heights[i];
          if (hgt < 1) continue;
          fx.beginPath();
          fx.roundRect(i * bw + 1, bottom - hgt, Math.max(1, bw - 2), hgt, [3, 3, 0, 0]);
          fx.fill();
        }
      } else if (style === 'outline') {
        fx.beginPath();
        fx.moveTo(0, bottom - heights[0]);
        for (let i = 1; i < BANDS; i++) {
          const xm = i * bw;
          fx.quadraticCurveTo((i - 0.5) * bw, bottom - heights[i - 1], xm, bottom - (heights[i - 1] + heights[i]) / 2);
        }
        fx.lineTo(W, bottom - heights[BANDS - 1]);
        fx.strokeStyle = hexA(c1, 0.25);
        fx.lineWidth = 8;
        fx.stroke();
        fx.strokeStyle = hexA(c1, 0.95);
        fx.lineWidth = 2;
        fx.stroke();
        fx.lineTo(W, bottom);
        fx.lineTo(0, bottom);
        fx.closePath();
        fx.fillStyle = hexA(c2, 0.12);
        fx.fill();
      } else {
        // LED columns
        const cell = 7;
        for (let i = 0; i < BANDS; i += 2) {
          const lit = Math.floor(Math.max(heights[i], heights[i + 1] ?? 0) / cell);
          for (let k = 0; k < lit; k++) {
            const f = (k * cell) / maxH;
            fx.fillStyle = f > 0.8 ? '#ffffff' : f > 0.5 ? hexA(c2, 0.95) : hexA(c1, 0.85);
            fx.fillRect(i * bw + 1, bottom - (k + 1) * cell, bw * 2 - 3, cell - 2);
          }
        }
      }
      // Peak-hold markers.
      if (style !== 'mirror') {
        fx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < BANDS; i++) if (peaks[i] > 4) fx.fillRect(i * bw + 1, bottom - peaks[i] - 2, Math.max(1, bw - 2), 2);
      }
      fx.globalAlpha = 1;

      // LED level meters on both edges.
      const segs = 18;
      const segH = (bottom - top) / segs;
      const lvl = playing ? Math.min(1, en.level * 0.9 + pulse * 0.2) : 0;
      const levels = [lvl, Math.min(1, lvl * (0.9 + 0.2 * Math.sin(secs * 7)))];
      [8, W - 16].forEach((x, side) => {
        const litN = Math.round(levels[side] * segs);
        fx.globalAlpha = dark ? 0.45 : 0.9;
        for (let k = 0; k < segs; k++) {
          const color = k >= segs - 2 ? '#ff4d5a' : k >= segs - 6 ? '#ffc83d' : '#7cf29a';
          fx.fillStyle = k < litN ? color : 'rgba(255,255,255,0.06)';
          fx.fillRect(x, bottom - (k + 1) * segH + 1, 8, segH - 2);
        }
      });
      fx.globalAlpha = 1;

      // Heartbeat trace across the upper part of the screen.
      const baseY = H * 0.26;
      const amp = H * 0.07;
      const span = W * 0.94;
      const ecgColor = dark ? GOLD : pal[0];
      const pts: number[] = [];
      for (let x = 0; x <= span; x += 3) {
        const tx = t - (1 - x / span) * ECG_WINDOW;
        let v = 0;
        if (tx >= 0) {
          const k = beatIndexAt(g.times, tx + 0.3);
          for (let j = k - 1; j <= k + 1; j++) {
            const tb = g.times[j];
            if (tb === undefined || tb > t) continue;
            const down = (((j - g.downbeat) % 4) + 4) % 4 === 0;
            const lineAt = lastStartedIndex(s.lines, tb);
            const kind = (ls[lineAt] ?? ls[0])?.beat ?? 'ecg';
            v += beatShape(kind, tx - tb, variationFor(j, salt)) * (down ? 1 : 0.7) * levelAt(tb);
          }
          v += Math.sin(tx * 37) * 0.012 + Math.sin(tx * 91) * 0.008;
        }
        pts.push(x, baseY - v * amp);
      }
      const fade = fx.createLinearGradient(0, 0, span, 0);
      fade.addColorStop(0, hexA(ecgColor, 0));
      fade.addColorStop(0.75, hexA(ecgColor, dark ? 0.35 : 0.45));
      fade.addColorStop(1, hexA(ecgColor, dark ? 0.7 : 0.9));
      for (const [width, a] of [
        [6, 0.15],
        [1.4, 1],
      ]) {
        fx.globalAlpha = a;
        fx.strokeStyle = fade;
        fx.lineWidth = width;
        fx.lineJoin = 'round';
        fx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) fx.moveTo(pts[i], pts[i + 1]);
          else fx.lineTo(pts[i], pts[i + 1]);
        }
        fx.stroke();
      }
      fx.globalAlpha = 1;
      const hx = pts[pts.length - 2];
      const hy = pts[pts.length - 1];
      const hr = 4 + pulse * 6;
      const hg = fx.createRadialGradient(hx, hy, 0, hx, hy, hr * 4);
      hg.addColorStop(0, hexA(ecgColor, 0.9));
      hg.addColorStop(1, hexA(ecgColor, 0));
      fx.fillStyle = hg;
      fx.fillRect(hx - hr * 4, hy - hr * 4, hr * 8, hr * 8);

      // ---------------- deck readout + record
      if (vinylRef.current) {
        if (playing && !reduced) vinylAngle = (vinylAngle + dt * 200) % 360; // 33⅓ rpm
        vinylRef.current.style.transform = `rotate(${vinylAngle.toFixed(1)}deg)`;
      }
      if (beatInBar !== lastBeatLed && ledsRef.current) {
        lastBeatLed = beatInBar;
        const kids = ledsRef.current.children;
        for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === beatInBar && playing);
      }
      const remain = `-${formatTime(Math.max(0, s.duration - t))}`;
      if (remain !== lastRemain && remainRef.current) {
        lastRemain = remain;
        remainRef.current.textContent = remain;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sizer.stop();
      panels.clear();
    };
  }, [player]);

  return (
    <div
      className={`backdrop tone-${tone}`}
      aria-hidden
      data-testid="backdrop"
      style={
        (tone === 'dark'
          ? { '--c1': GOLD, '--c2': '#8a7d5c' }
          : { '--c1': look?.palette[0] ?? NEUTRAL[0], '--c2': look?.palette[1] ?? NEUTRAL[1] }) as CSSProperties
      }
    >
      <canvas ref={softRef} className="backdrop-soft" />
      {/* The record sits between the soft wash and the histogram, so the histogram plays in front of it. */}
      <div className="dj-vinyl-wrap">
        <div className="dj-vinyl" ref={vinylRef}>
          <div className="dj-label" />
        </div>
      </div>
      <canvas ref={sharpRef} className="backdrop-sharp" />
      <div className="dj-hud">
        <span className="dj-live">● LIVE</span>
        <span className="dj-deck">DECK A</span>
        <span className="dj-bpm" data-testid="dj-bpm">
          {grid.bpm.toFixed(1)} BPM
        </span>
        <span className="dj-leds" ref={ledsRef}>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="dj-remain" ref={remainRef} />
      </div>
    </div>
  );
}
