import { useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import { dnaFileName, dnaStats, drawDnaCard } from '../lib/dna';
import { EMOTION_STYLES } from '../lib/emotions';
import { Modal } from './Modal';
import { useToast } from './Toasts';

interface Props {
  song: Song;
  onClose: () => void;
}

export function DnaModal({ song, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const toast = useToast();
  const stats = dnaStats(song);

  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled || !canvasRef.current) return;
      drawDnaCard(canvasRef.current, song);
      setReady(true);
    };
    // Make sure the web font is ready so the card isn't drawn in a fallback font.
    Promise.all([document.fonts.load("700 40px 'Outfit Variable'"), document.fonts.ready]).then(draw, draw);
    return () => {
      cancelled = true;
    };
  }, [song]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("Couldn't create the image. Try again?", 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dnaFileName(song);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Song DNA card saved as PNG 🧬', 'success');
    }, 'image/png');
  }

  const summary = stats.slices
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .map((s) => `${EMOTION_STYLES[s.emotion].label} ${Math.round(s.pct)}%`)
    .join(', ');

  return (
    <Modal title="🧬 Song DNA" onClose={onClose} className="dna-modal">
      <div className="dna-body" data-testid="dna-card">
        <canvas
          ref={canvasRef}
          className="dna-canvas"
          role="img"
          aria-label={`Song DNA for ${song.title}: ${summary}. Themes: ${stats.themes.join(', ') || 'none'}.`}
        />
        <aside className="dna-side">
          <h3>Emotion mix</h3>
          <table className="dna-table" data-testid="dna-table">
            <tbody>
              {stats.slices
                .slice()
                .sort((a, b) => b.pct - a.pct)
                .map((s) => (
                  <tr key={s.emotion}>
                    <td>
                      <span className="swatch" style={{ background: EMOTION_STYLES[s.emotion].color }} aria-hidden />
                      {EMOTION_STYLES[s.emotion].emoji} {EMOTION_STYLES[s.emotion].label}
                    </td>
                    <td className="num">{s.pct.toFixed(1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <h3>Themes</h3>
          <div className="tags">
            {stats.themes.length ? stats.themes.map((t) => <span key={t} className="tag">#{t}</span>) : <span className="muted">No strong themes</span>}
          </div>
          <div className="modal-actions">
            <button className="btn primary" onClick={download} disabled={!ready} data-testid="dna-download">
              ⬇ Download PNG
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
