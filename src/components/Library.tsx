import { useState, type CSSProperties } from 'react';
import { EMOTIONS } from '../types';
import { EMOTION_STYLES } from '../lib/emotions';
import { deleteSong, loadLibrary, type SavedSong } from '../lib/storage';
import { formatTime } from '../lib/lyrics';
import { useToast } from './Toasts';

interface Props {
  onOpen: (song: SavedSong) => void;
  onBack: () => void;
}

export function Library({ onOpen, onBack }: Props) {
  const [songs, setSongs] = useState(() => loadLibrary());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const toast = useToast();

  const remove = (id: string) => {
    const res = deleteSong(id);
    if (!res.ok) toast(res.message, 'error');
    setSongs(loadLibrary());
    setConfirming(null);
  };

  const q = query.trim().toLowerCase();
  const shown = q ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : songs;

  return (
    <div className="screen list-screen" data-testid="library">
      <header className="list-head">
        <button className="btn ghost small" onClick={onBack}>
          ← Home
        </button>
        <h1>📚 Library</h1>
        {songs.length > 3 && (
          <input className="search" placeholder="Search songs…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search songs" />
        )}
      </header>

      {songs.length === 0 ? (
        <div className="card narrow empty">
          <div className="empty-icon">🎶</div>
          <h2>No saved songs yet</h2>
          <p className="muted">Open a song and press 💾 Save. Lyrics, timings and the mood analysis are kept here (audio files aren't stored).</p>
          <button className="btn primary" onClick={onBack}>
            Find a song
          </button>
        </div>
      ) : (
        <div className="song-grid">
          {shown.map((s) => {
            const dom = EMOTION_STYLES[s.analysis.dominant];
            return (
              <article key={s.id} className="song-card" style={{ '--emo': dom.color } as CSSProperties} data-testid="library-item">
                <div className="mood-bar" aria-label="Emotion mix">
                  {EMOTIONS.filter((e) => s.analysis.breakdown[e] > 0).map((e) => (
                    <span
                      key={e}
                      style={{ flexGrow: s.analysis.breakdown[e], background: EMOTION_STYLES[e].color }}
                      title={`${EMOTION_STYLES[e].label} ${Math.round(s.analysis.breakdown[e])}%`}
                    />
                  ))}
                </div>
                <div className="song-card-body">
                  <div className="song-card-emoji" aria-hidden>
                    {dom.emoji}
                  </div>
                  <div className="song-card-text">
                    <h3>{s.title}</h3>
                    <div className="muted small">{s.artist}</div>
                    <div className="muted small">
                      {s.lines.length} lines · {formatTime(s.duration)} · mostly {dom.label.toLowerCase()}
                    </div>
                    <div className="tags">
                      {s.analysis.themes.slice(0, 3).map((t) => (
                        <span key={t.theme} className="tag small">
                          #{t.theme}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="song-card-actions">
                  {confirming === s.id ? (
                    <>
                      <span className="small">Delete?</span>
                      <button className="btn small danger" onClick={() => remove(s.id)} data-testid="confirm-delete">
                        Yes, delete
                      </button>
                      <button className="btn small ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn small primary" onClick={() => onOpen(s)} data-testid="library-open">
                        ▶ Open
                      </button>
                      <button className="btn small ghost" onClick={() => setConfirming(s.id)} aria-label={`Delete ${s.title}`}>
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
          {shown.length === 0 && <p className="muted">No songs match “{query}”.</p>}
        </div>
      )}
    </div>
  );
}
