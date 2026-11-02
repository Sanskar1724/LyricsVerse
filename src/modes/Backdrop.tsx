import { useEffect, useRef } from 'react';
import type { Song } from '../types';
import type { Player } from '../lib/player';
import { beatIndexAt } from '../lib/beats';
import type { LineLook, Scene } from '../lib/looks';
import { AdaptiveQuality, autoSizeCanvas, prefersReducedMotion } from './canvas';
import { beatGridFor } from './words';
import { beatShape, variationFor } from './beatShapes';
import { lastStartedIndex } from '../lib/lyrics';

export type BackdropTone = 'vivid' | 'dark';

interface Props {
  song: Song;
  index: number;
  player: Player;
  looks: LineLook[];
  tone: BackdropTone;
}

/** The scene layer is drawn at a fraction of screen resolution: cheap, and the upscale makes it dreamy-soft. */
const SCENE_SCALE = 0.3;
/** Seconds of music shown across the heartbeat trace. */
const ECG_WINDOW = 5;
const FADE_SECONDS = 1.2;
const NEUTRAL: [string, string, string] = ['#7a6cff', '#ff6fb5', '#1a1530'];

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}


function drawScene(c: CanvasRenderingContext2D, scene: Scene, pal: [string, string, string], w: number, h: number, time: number, alpha: number) {
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
      for (let i = 0; i < 3; i++) {
        blob(
          w * (0.5 + 0.35 * Math.sin(time * 0.13 + i * 2.1)),
          h * (0.35 + 0.25 * Math.sin(time * 0.11 + i * 1.3)),
          big * (0.45 + 0.08 * Math.sin(time * 0.2 + i)),
          pal[i % 2],
          0.55,
        );
      }
      break;
    case 'nebula':
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = time * 0.05 + i * 1.256;
        blob(w * (0.5 + 0.3 * Math.cos(a)), h * (0.45 + 0.28 * Math.sin(a * 1.3)), big * 0.26, pal[i % 2], 0.35);
      }
      c.globalCompositeOperation = 'source-over';
      break;
    case 'sunset': {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(pal[2], 0.9 * alpha));
      g.addColorStop(0.6, hexA(pal[1], 0.45 * alpha));
      g.addColorStop(1, hexA(pal[0], 0.6 * alpha));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      blob(w * 0.5, h * (0.72 + 0.02 * Math.sin(time * 0.3)), Math.min(w, h) * 0.32, pal[0], 0.8);
      break;
    }
    case 'prism': {
      const cg = c.createConicGradient(time * 0.08, w / 2, h / 2);
      cg.addColorStop(0, hexA(pal[0], 0.45 * alpha));
      cg.addColorStop(0.33, hexA(pal[1], 0.4 * alpha));
      cg.addColorStop(0.66, hexA(pal[2], 0.5 * alpha));
      cg.addColorStop(1, hexA(pal[0], 0.45 * alpha));
      c.fillStyle = cg;
      c.fillRect(0, 0, w, h);
      break;
    }
    case 'ocean': {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(pal[2], 0.85 * alpha));
      g.addColorStop(1, hexA(pal[0], 0.35 * alpha));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let b = 0; b < 4; b++) {
        c.fillStyle = hexA(b % 2 ? pal[1] : pal[0], 0.18 * alpha);
        c.beginPath();
        const base = h * (0.45 + b * 0.13);
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) c.lineTo(x, base + Math.sin(x * 0.03 + time * (0.6 + b * 0.2) + b) * h * 0.04);
        c.lineTo(w, h);
        c.fill();
      }
      break;
    }
  }
}

/**
 * The living background shared by every mode:
 * a scene that changes with every line (cross-fading), and a heartbeat trace that spikes on every beat.
 */
export function Backdrop({ song, index, player, looks, tone }: Props) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const ecgRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ song, index, looks, tone });
  live.current = { song, index, looks, tone };

  useEffect(() => {
    const sceneCanvas = sceneRef.current;
    const ecgCanvas = ecgRef.current;
    const sc = sceneCanvas?.getContext('2d');
    const ec = ecgCanvas?.getContext('2d');
    if (!sceneCanvas || !ecgCanvas || !sc || !ec) return;
    const reduced = prefersReducedMotion();
    // New random beat variations every time the player opens.
    const salt = Math.floor(Math.random() * 1e9);

    let sw = 1;
    let sh = 1;
    const resizeScene = () => {
      sw = Math.max(1, Math.round(sceneCanvas.clientWidth * SCENE_SCALE));
      sh = Math.max(1, Math.round(sceneCanvas.clientHeight * SCENE_SCALE));
      sceneCanvas.width = sw;
      sceneCanvas.height = sh;
    };
    resizeScene();
    const ro = new ResizeObserver(resizeScene);
    ro.observe(sceneCanvas);

    const aq = new AdaptiveQuality();
    let W = 1;
    let H = 1;
    let S = 1;
    const sizer = autoSizeCanvas(
      ecgCanvas,
      (w, h, s) => {
        W = w;
        H = h;
        S = s;
      },
      () => aq.quality,
    );

    // Loudness history (song time → level) so each heartbeat's height matches how loud that beat was.
    const history: { t: number; level: number }[] = [];
    let lastT = 0;
    let shownIdx = -2;
    let prevLook: LineLook | null = null;
    let changedAt = -Infinity;
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

    const frame = (now: number) => {
      if (aq.update(now - last)) sizer.resize();
      last = now;
      const { song: s, index: idx, looks: ls, tone: tn } = live.current;
      const t = player.currentTime;
      const en = player.sampleEnergy();
      const grid = beatGridFor(s);
      const secs = (now / 1000) * (reduced ? 0.3 : 1);

      // Beat pulse straight from the beat map.
      const bi = beatIndexAt(grid.times, t);
      let pulse = 0;
      if (bi >= 0) {
        const down = (((bi - grid.downbeat) % 4) + 4) % 4 === 0;
        pulse = Math.exp(-(t - grid.times[bi]) / 0.15) * (down ? 1 : 0.6);
      }
      if (!player.playing) pulse *= 0.3;

      if (Math.abs(t - lastT) > 0.6) history.length = 0; // seeked: old history no longer lines up
      lastT = t;
      if (player.playing) {
        history.push({ t, level: player.kind === 'audio' ? 0.35 + en.level * 0.75 : 0.75 });
        while (history.length && history[0].t < t - ECG_WINDOW - 1) history.shift();
      }

      // ---- scene (cross-fades when the line changes)
      if (idx !== shownIdx) {
        prevLook = ls[shownIdx] ?? null;
        shownIdx = idx;
        changedAt = now;
      }
      const look = ls[idx] ?? ls[0] ?? null;
      const mix = Math.min(1, (now - changedAt) / 1000 / FADE_SECONDS);
      const strength = (tn === 'dark' ? 0.22 : 1) * (0.85 + pulse * 0.25);
      sc.globalAlpha = 1;
      sc.fillStyle = tn === 'dark' ? '#000000' : '#06040c';
      sc.fillRect(0, 0, sw, sh);
      if (prevLook && mix < 1) drawScene(sc, prevLook.scene, prevLook.palette, sw, sh, secs, strength * (1 - mix));
      if (look) drawScene(sc, look.scene, idx >= 0 ? look.palette : NEUTRAL, sw, sh, secs, strength * (idx >= 0 ? mix : 0.5));
      // Keep the middle calm so words stay readable.
      const vg = sc.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.15, sw / 2, sh / 2, Math.max(sw, sh) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0.25)');
      vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      sc.fillStyle = vg;
      sc.fillRect(0, 0, sw, sh);

      // ---- heartbeat trace
      ec.setTransform(S, 0, 0, S, 0, 0);
      ec.clearRect(0, 0, W, H);
      const color = tn === 'dark' ? '#ecd9a8' : (look?.palette[0] ?? '#ffffff');
      const baseY = H * 0.8;
      const span = W * 0.94; // leave room so the glowing head sits inside the screen
      const amp = H * 0.11;
      // Faint markers at each beat, scrolling with the trace.
      ec.strokeStyle = hexA(color, 0.07);
      ec.lineWidth = 1;
      ec.beginPath();
      for (let k = Math.max(0, beatIndexAt(grid.times, t - ECG_WINDOW)); k <= bi && k >= 0; k++) {
        const x = span * (1 - (t - grid.times[k]) / ECG_WINDOW);
        ec.moveTo(x, baseY - amp * 1.2);
        ec.lineTo(x, baseY + amp * 0.5);
      }
      ec.stroke();

      const pts: number[] = [];
      for (let x = 0; x <= span; x += 3) {
        const tx = t - (1 - x / span) * ECG_WINDOW;
        let v = 0;
        if (tx >= 0) {
          const k = beatIndexAt(grid.times, tx + 0.3);
          for (let j = k - 1; j <= k + 1; j++) {
            const tb = grid.times[j];
            if (tb === undefined || tb > t) continue; // never draw beats that haven't happened yet
            const down = (((j - grid.downbeat) % 4) + 4) % 4 === 0;
            // Each beat is drawn in the style of the line playing at that moment, with its own variation.
            const lineAt = lastStartedIndex(s.lines, tb);
            const kind = (ls[lineAt] ?? ls[0])?.beat ?? 'ecg';
            v += beatShape(kind, tx - tb, variationFor(j, salt)) * (down ? 1 : 0.7) * levelAt(tb);
          }
          v += Math.sin(tx * 37) * 0.012 + Math.sin(tx * 91) * 0.008; // a little life on the flat line
        }
        pts.push(x, baseY - v * amp);
      }
      const fade = ec.createLinearGradient(0, 0, span, 0);
      fade.addColorStop(0, hexA(color, 0));
      fade.addColorStop(0.75, hexA(color, 0.5));
      fade.addColorStop(1, hexA(color, 0.95));
      const stroke = (width: number, style: string | CanvasGradient, a: number) => {
        ec.globalAlpha = a;
        ec.strokeStyle = style;
        ec.lineWidth = width;
        ec.lineJoin = 'round';
        ec.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) ec.moveTo(pts[i], pts[i + 1]);
          else ec.lineTo(pts[i], pts[i + 1]);
        }
        ec.stroke();
      };
      stroke(7, fade, 0.18); // soft glow
      stroke(1.6, fade, 1); // sharp trace
      ec.globalAlpha = 1;
      // Glowing head of the trace, like a heart monitor.
      const hx = pts[pts.length - 2];
      const hy = pts[pts.length - 1];
      const hr = 4 + pulse * 6;
      const hg = ec.createRadialGradient(hx, hy, 0, hx, hy, hr * 4);
      hg.addColorStop(0, hexA(color, 0.9));
      hg.addColorStop(1, hexA(color, 0));
      ec.fillStyle = hg;
      ec.fillRect(hx - hr * 4, hy - hr * 4, hr * 8, hr * 8);
      ec.fillStyle = '#ffffff';
      ec.beginPath();
      ec.arc(hx, hy, 2.2, 0, Math.PI * 2);
      ec.fill();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sizer.stop();
    };
  }, [player]);

  return (
    <div className="backdrop" aria-hidden data-testid="backdrop">
      <canvas ref={sceneRef} className="backdrop-scene" />
      <canvas ref={ecgRef} className="backdrop-ecg" />
    </div>
  );
}
