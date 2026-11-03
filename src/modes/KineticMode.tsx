import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { EMOTION_STYLES } from '../lib/emotions';
import { snapToBeat } from '../lib/beats';
import { FONT_FAMILIES, type LineLook } from '../lib/looks';
import type { ModeProps } from './types';
import { prefersReducedMotion } from './canvas';
import { beatGridFor, wordTimes } from './words';

const ENTRANCE_SECONDS = 0.5;
const EXIT_SECONDS = 0.45;
const BURST_DOTS = 8;

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function fontSizeClass(count: number, look: LineLook | null): string {
  const bump = look?.font === 'display' || look?.font === 'hand' ? 1 : 0; // these faces read smaller
  const n = Math.max(1, count - bump * 2);
  if (n <= 4) return 'kin-xl';
  if (n <= 8) return 'kin-lg';
  if (n <= 14) return 'kin-md';
  return 'kin-sm';
}

/**
 * The showpiece: every line gets its own random look (font, entrance, finish, tilt, sparkles).
 * Words land on the beat, emotional words are highlighted and burst with sparks, the line bows out with a drift.
 */
export function KineticMode({ song, index, player, looks }: ModeProps) {
  const line = index >= 0 ? song.lines[index] : null;
  const an = index >= 0 ? song.analysis.lines[index] : null;
  const look = index >= 0 ? (looks[index] ?? null) : null;
  const grid = useMemo(() => beatGridFor(song), [song]);
  const schedule = useMemo(() => {
    if (!line) return [];
    let prev = -Infinity;
    return wordTimes(line).map((w) => {
      const start = Math.max(snapToBeat(w.start, grid, 0.15), prev + 0.08);
      prev = start;
      return { ...w, start };
    });
  }, [line, grid]);
  const accents = useMemo(() => schedule.map((_, k) => an?.words[k]?.emotion != null), [schedule, an]);

  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef({ line, look, schedule, accents, index });
  live.current = { line, look, schedule, accents, index };

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const burst = new Set<number>();
    let burstFor = -2;
    let raf = 0;
    const frame = (now: number) => {
      const { line: ln, look: lk, schedule: sched, accents: acc, index: idx } = live.current;
      if (idx !== burstFor) {
        burst.clear();
        burstFor = idx;
      }
      if (ln && lk) {
        const t = player.currentTime;
        const en = player.sampleEnergy();
        const motion = reduced ? 0.3 : 1;
        const secs = now / 1000;
        const exitQ = t > ln.end ? Math.min(1, (t - ln.end) / EXIT_SECONDS) : 0;

        for (let k = 0; k < sched.length; k++) {
          const el = wordRefs.current[k];
          if (!el) continue;
          const age = t - sched[k].start;
          if (age < 0) {
            el.style.opacity = '0';
            continue;
          }
          const p = Math.min(1, age / ENTRANCE_SECONDS);
          const e = easeOutCubic(p);
          let x = 0;
          let y = 0;
          let scale = 1;
          let rotX = 0;
          let opacity = 1;
          let blur = 0;
          let clip = 0;
          switch (reduced ? 'rise' : lk.entrance) {
            case 'pop':
              scale = easeOutBack(p);
              opacity = Math.min(1, p * 3);
              break;
            case 'rise':
              y = (1 - e) * 60;
              opacity = e;
              blur = (1 - e) * 4;
              break;
            case 'drop':
              y = -(1 - easeOutBounce(p)) * 110;
              opacity = Math.min(1, p * 4);
              break;
            case 'slide':
              x = (k % 2 ? 1 : -1) * (1 - e) * 160;
              opacity = e;
              break;
            case 'flip':
              rotX = (1 - e) * 95;
              opacity = Math.min(1, p * 2);
              break;
            case 'unblur':
              blur = (1 - e) * 16;
              scale = 1.18 - 0.18 * e;
              opacity = e;
              break;
            case 'wipe':
              clip = 1 - e;
              break;
            case 'zoom':
              scale = 3 - 2 * e;
              opacity = e;
              break;
          }
          // After landing: float gently, bounce on the beat (accent words more).
          const settle = Math.min(1, Math.max(0, (age - ENTRANCE_SECONDS) / 0.4));
          y += Math.sin(secs * 1.3 + k * 0.9) * 3 * motion * settle;
          scale *= 1 + en.pulse * (acc[k] ? 0.1 : 0.04) * motion * settle;
          if (acc[k] && an?.emotion === 'anger') {
            x += (Math.random() - 0.5) * 3 * motion * settle;
            y += (Math.random() - 0.5) * 3 * motion * settle;
          }
          // Bow out when the line is over.
          if (exitQ > 0) {
            opacity *= 1 - exitQ;
            y -= exitQ * 34;
            blur = Math.max(blur, exitQ * 8);
          }
          el.style.opacity = opacity.toFixed(3);
          el.style.transform =
            `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})` + (rotX ? ` perspective(600px) rotateX(${rotX.toFixed(1)}deg)` : '');
          el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : '';
          el.style.clipPath = clip > 0.001 ? `inset(-20% ${(clip * 100).toFixed(1)}% -20% -5%)` : '';

          // Sparks fly off accent words (and every word on "sparkles" lines) the moment they land.
          if ((acc[k] || lk.ornament === 'sparkles') && !burst.has(k) && age < 0.6) {
            burst.add(k);
            el.classList.remove('burst');
            void el.offsetWidth; // restart the CSS animation
            el.classList.add('burst');
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [player, an]);

  wordRefs.current.length = schedule.length;
  const st = EMOTION_STYLES[an?.emotion ?? 'calm'];
  const lineStyle: CSSProperties | undefined = look
    ? ({
        fontFamily: FONT_FAMILIES[look.font],
        fontWeight: look.weight,
        fontStyle: look.italic ? 'italic' : 'normal',
        letterSpacing: `${look.tracking}em`,
        textTransform: look.upper ? 'uppercase' : 'none',
        transform: `translateY(${look.offsetY}vh) rotate(${look.tilt}deg)`,
        '--c1': look.palette[0],
        '--c2': look.palette[1],
        '--c3': look.palette[2],
      } as CSSProperties)
    : undefined;

  return (
    <div className="mode kinetic-mode" data-testid="mode-kinetic">
      {line && look ? (
        <div
          key={index}
          className={`kin-line ${fontSizeClass(schedule.length, look)} finish-${look.finish} align-${look.align} font-${look.font}`}
          style={lineStyle}
          data-testid="current-line"
          data-entrance={look.entrance}
          data-font={look.font}
          data-finish={look.finish}
          dir="auto"
        >
          {schedule.map((w, k) => (
            <span key={k} className={`kin-word ${accents[k] ? 'accent' : ''}`} ref={(el) => (wordRefs.current[k] = el)} style={{ opacity: 0 }}>
              <span className="kin-text">{w.text}</span>
              {(accents[k] || look.ornament === 'sparkles') && (
                <span className="kin-burst" aria-hidden>
                  {Array.from({ length: BURST_DOTS }, (_, i) => (
                    <i key={i} style={{ '--a': `${(i / BURST_DOTS) * 360}deg` } as CSSProperties} />
                  ))}
                </span>
              )}
              {k < schedule.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
      ) : (
        <div className="kin-idle" aria-hidden>
          ♪
        </div>
      )}
      {an && (
        <div className="emotion-chip kin-chip" key={`chip-${index}`} style={{ '--emo': st.color } as CSSProperties}>
          {st.emoji} {st.label}
        </div>
      )}
    </div>
  );
}
