import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { EMOTION_STYLES } from '../lib/emotions';
import type { ModeProps } from './types';
import { wordTimes } from './words';
import { prefersReducedMotion } from './canvas';
import { FONT_FAMILIES } from '../lib/looks';

/**
 * Sing-along: each word fills with colour as it's sung, a ball bounces from word to word,
 * the next line waits underneath and the previous one fades above.
 */
export function KaraokeMode({ song, index, player, looks }: ModeProps) {
  const look = index >= 0 ? looks[index] : undefined;
  const line = index >= 0 ? song.lines[index] : null;
  const next = song.lines[index + 1] ?? null;
  const prev = index > 0 ? song.lines[index - 1] : null;
  const an = index >= 0 ? song.analysis.lines[index] : null;
  const st = EMOTION_STYLES[an?.emotion ?? 'calm'];
  const schedule = useMemo(() => (line ? wordTimes(line) : []), [line]);

  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lineRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const centers = useRef<{ x: number; y: number }[]>([]);
  const live = useRef({ schedule, index });
  live.current = { schedule, index };

  // Measure word positions once per line (and on resize) instead of every frame.
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = lineRef.current?.parentElement?.getBoundingClientRect();
      if (!wrap) return;
      centers.current = wordRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        // y = top of the letters (a line box has ~20% padding above the glyphs).
        return { x: r.left - wrap.left + r.width / 2, y: r.top - wrap.top + r.height * 0.18 };
      });
    };
    measure();
    const settle = window.setTimeout(measure, 600);
    const ro = new ResizeObserver(measure);
    if (lineRef.current) ro.observe(lineRef.current);
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
    };
  }, [index]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const lastFill: number[] = [];
    let filledFor = -2;
    let raf = 0;
    const frame = () => {
      const { schedule: sched, index: idx } = live.current;
      if (idx !== filledFor) {
        // New line, new word elements: forget what was painted on the old ones.
        filledFor = idx;
        lastFill.length = 0;
      }
      const t = player.currentTime;
      const en = player.sampleEnergy();
      let active = -1;
      for (let k = 0; k < sched.length; k++) {
        const w = sched[k];
        const fill = Math.min(1, Math.max(0, (t - w.start) / Math.max(0.05, w.end - w.start)));
        if (t >= w.start) active = k;
        if (Math.abs((lastFill[k] ?? -1) - fill) > 0.004) {
          lastFill[k] = fill;
          wordRefs.current[k]?.style.setProperty('--fill', fill.toFixed(3));
        }
      }
      const ball = ballRef.current;
      const c = centers.current;
      if (ball && sched.length && c.length) {
        // Before the first word the ball waits above it; then it hops from word to word.
        const k = Math.max(0, active);
        const w = sched[k];
        const p = active < 0 ? 0 : Math.min(1, (t - w.start) / Math.max(0.05, w.end - w.start));
        const from = c[k];
        const to = c[Math.min(c.length - 1, k + 1)];
        const x = from.x + (to.x - from.x) * (active < 0 ? 0 : p);
        const hop = reduced ? 0 : Math.sin(Math.PI * p) * 34;
        const y = from.y + (to.y - from.y) * p - 24 - hop;
        ball.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + en.pulse * 0.3).toFixed(3)})`;
        ball.style.opacity = t > (sched[sched.length - 1]?.end ?? 0) + 0.4 ? '0' : '1';
      }
      if (spotRef.current) spotRef.current.style.opacity = (0.45 + en.level * 0.4 + en.pulse * 0.15).toFixed(3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [player]);

  wordRefs.current.length = schedule.length;

  return (
    <div className="mode karaoke-mode" style={{ '--emo': st.color } as CSSProperties} data-testid="mode-karaoke">
      <div className="kara-spot" ref={spotRef} aria-hidden />
      <div className="kara-stage">
        <p className="kara-prev" dir="auto" aria-hidden>
          {prev?.text ?? ''}
        </p>
        <div className="kara-line-wrap">
          <div
            className="kara-line"
            ref={lineRef}
            key={index}
            data-testid={line ? 'current-line' : undefined}
            dir="auto"
            style={look ? { fontFamily: FONT_FAMILIES[look.font], fontStyle: look.italic ? 'italic' : 'normal', textTransform: look.upper ? 'uppercase' : 'none' } : undefined}
          >
            {schedule.length ? (
              schedule.map((w, k) => (
                <span key={k} ref={(el) => (wordRefs.current[k] = el)} className="kara-word" style={{ '--fill': 0 } as CSSProperties}>
                  {w.text}
                  {k < schedule.length - 1 ? ' ' : ''}
                </span>
              ))
            ) : (
              <span className="kara-wait">♪ get ready…</span>
            )}
          </div>
          {schedule.length > 0 && <div className="kara-ball" ref={ballRef} aria-hidden />}
        </div>
        <p className="kara-next" dir="auto">
          {next ? next.text : line ? '♪' : (song.lines[0]?.text ?? '')}
        </p>
      </div>
      {an && (
        <div className="emotion-chip kara-chip" key={`chip-${index}`}>
          {st.emoji} {st.label}
        </div>
      )}
    </div>
  );
}
