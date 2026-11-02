import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { EMOTIONS, type Emotion } from '../types';
import { EMOTION_STYLES, hexToRgb } from '../lib/emotions';
import type { ModeProps } from './types';
import { AdaptiveQuality, autoSizeCanvas, lerpRgb, prefersReducedMotion, rgbStr } from './canvas';
import { wordTimes } from './words';

type RGB = [number, number, number];
const COLORS = Object.fromEntries(EMOTIONS.map((e) => [e, hexToRgb(EMOTION_STYLES[e].color)])) as Record<Emotion, RGB>;
const RINGS = 26;
const WARP = 140;

/**
 * Fly through a tunnel of light. Rings rush past faster when the music is louder; each word of the
 * current line zooms out of the vanishing point into its place.
 */
export function TunnelMode({ song, index, player }: ModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const offsets = useRef<{ dx: number; dy: number }[]>([]);
  const line = index >= 0 ? song.lines[index] : null;
  const schedule = useMemo(() => (line ? wordTimes(line) : []), [line]);
  const live = useRef({ song, index, schedule });
  live.current = { song, index, schedule };

  // Where each word sits relative to the screen centre, so it can fly out from there.
  useLayoutEffect(() => {
    const measure = () => {
      const box = lineRef.current?.parentElement?.getBoundingClientRect();
      if (!box) return;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      offsets.current = wordRefs.current.map((el) => {
        if (!el) return { dx: 0, dy: 0 };
        const r = el.getBoundingClientRect();
        return { dx: cx - (r.left + r.width / 2), dy: cy - (r.top + r.height / 2) };
      });
    };
    // Measure with transforms cleared, then let the frame loop take over.
    for (const el of wordRefs.current) if (el) el.style.transform = 'none';
    measure();
    const ro = new ResizeObserver(measure);
    if (lineRef.current) ro.observe(lineRef.current);
    return () => ro.disconnect();
  }, [index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    const aq = new AdaptiveQuality();
    let W = 1;
    let H = 1;
    let S = 1;
    const sizer = autoSizeCanvas(
      canvas,
      (w, h, s) => {
        W = w;
        H = h;
        S = s;
      },
      () => aq.quality,
    );
    const rings = Array.from({ length: RINGS }, (_, i) => ({ z: (i + 1) / RINGS }));
    const warp = Array.from({ length: WARP }, () => ({ a: Math.random() * Math.PI * 2, z: Math.random(), d: 0.6 + Math.random() * 0.8 }));
    let color: RGB = [...COLORS.calm];
    let spin = 0;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      if (aq.update(now - last)) sizer.resize();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { song: s, index: idx, schedule: sched } = live.current;
      const t = player.currentTime;
      const en = player.sampleEnergy();
      const an = idx >= 0 ? s.analysis.lines[idx] : null;
      const intensity = an?.intensity ?? 0.2;
      const playing = player.playing;
      color = lerpRgb(color, COLORS[an?.emotion ?? 'calm'], 1 - Math.exp(-dt * 2));
      const motion = reduced ? 0.25 : 1;
      const speed = (playing ? 0.18 + en.level * 0.5 + intensity * 0.25 : 0.03) * motion;
      spin += dt * (0.08 + intensity * 0.25) * motion * (an?.emotion === 'anger' ? 3 : 1);

      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(4, 3, 10, 0.55)'; // let the shared backdrop glow through
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2 + Math.sin(now / 3200) * W * 0.03 * motion;
      const cy = H / 2 + Math.cos(now / 4100) * H * 0.03 * motion;
      const r0 = Math.min(W, H) * 0.045;
      const sides = an?.emotion === 'love' || an?.emotion === 'calm' ? 40 : an?.emotion === 'anger' ? 3 : 6;

      // Rings, far to near.
      rings.sort((a, b) => b.z - a.z);
      for (const ring of rings) {
        ring.z -= speed * dt;
        if (ring.z <= 0.04) ring.z += 1;
        const r = r0 / ring.z;
        if (r > Math.hypot(W, H)) continue;
        const near = 1 - ring.z;
        ctx.strokeStyle = rgbStr(color, Math.min(1, near * near * 0.9 + en.pulse * 0.25));
        ctx.lineWidth = Math.min(10, 1 + near * 3 + en.pulse * 3 * near);
        ctx.beginPath();
        const rot = spin + ring.z * 2.2;
        for (let k = 0; k <= sides; k++) {
          const a = rot + (k / sides) * Math.PI * 2;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r * 0.8;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Warp streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of warp) {
        const zPrev = p.z;
        p.z -= speed * dt * 1.6;
        if (p.z <= 0.02) {
          p.z = 1;
          p.a = Math.random() * Math.PI * 2;
          continue;
        }
        const r1 = (r0 * p.d * 1.5) / zPrev;
        const r2 = (r0 * p.d * 1.5) / p.z;
        ctx.moveTo(cx + Math.cos(p.a) * r1, cy + Math.sin(p.a) * r1);
        ctx.lineTo(cx + Math.cos(p.a) * r2, cy + Math.sin(p.a) * r2);
      }
      ctx.stroke();

      // Glow at the vanishing point
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 4);
      g.addColorStop(0, rgbStr(color, 0.5 + en.pulse * 0.3));
      g.addColorStop(1, rgbStr(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r0 * 4, cy - r0 * 4, r0 * 8, r0 * 8);

      // Words fly out of the tunnel into place as they're sung.
      const offs = offsets.current;
      for (let k = 0; k < sched.length; k++) {
        const el = wordRefs.current[k];
        if (!el) continue;
        const p = Math.min(1, Math.max(0, (t - sched[k].start + 0.25) / 0.5));
        const e = 1 - Math.pow(1 - p, 3);
        const o = offs[k] ?? { dx: 0, dy: 0 };
        el.style.opacity = e.toFixed(3);
        el.style.transform = `translate(${(o.dx * (1 - e)).toFixed(1)}px, ${(o.dy * (1 - e)).toFixed(1)}px) scale(${(0.05 + 0.95 * e + en.pulse * 0.04 * e).toFixed(3)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sizer.stop();
    };
  }, [player]);

  const an = index >= 0 ? song.analysis.lines[index] : null;
  const st = an ? EMOTION_STYLES[an.emotion] : null;
  wordRefs.current.length = schedule.length;

  return (
    <div className="mode tunnel-mode" data-testid="mode-tunnel">
      <canvas ref={canvasRef} className="mode-canvas" aria-hidden />
      <div className="tunnel-center">
        <div className="tunnel-line" ref={lineRef} key={index} data-testid={line ? 'current-line' : undefined} dir="auto" style={{ '--emo': st?.color ?? '#fff' } as CSSProperties}>
          {schedule.map((w, k) => (
            <span key={k} ref={(el) => (wordRefs.current[k] = el)} className="tunnel-word" style={{ opacity: 0 }}>
              {w.text}
              {k < schedule.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
        {st && (
          <div className="emotion-chip" key={`chip-${index}`} style={{ '--emo': st.color } as CSSProperties}>
            {st.emoji} {st.label}
          </div>
        )}
      </div>
    </div>
  );
}
