import { useMemo, useState, type CSSProperties } from 'react';
import { EMOTIONS, type Emotion } from '../types';
import { EMOTION_STYLES, emptyEmotionRecord } from '../lib/emotions';
import { diaryByDay, loadDiary } from '../lib/storage';

interface Props {
  onBack: () => void;
}

const RANGES = [7, 14, 30];

function dayLabel(date: string): { short: string; long: string } {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    short: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    long: dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

export function Diary({ onBack }: Props) {
  const [range, setRange] = useState(14);
  const entries = useMemo(() => loadDiary(), []);
  const days = useMemo(() => diaryByDay(entries, range), [entries, range]);
  const [hover, setHover] = useState<string | null>(null);

  const totals = useMemo(() => {
    const t = emptyEmotionRecord();
    let n = 0;
    for (const d of days) {
      if (!d.entries.length) continue;
      n++;
      for (const e of EMOTIONS) t[e] += d.breakdown[e];
    }
    let top: Emotion | null = null;
    for (const e of EMOTIONS) if (t[e] > 0 && (!top || t[e] > t[top])) top = e;
    return { top, activeDays: n };
  }, [days]);

  const listened = days.filter((d) => d.entries.length).reverse();
  const usedEmotions = EMOTIONS.filter((e) => days.some((d) => d.breakdown[e] > 0));

  return (
    <div className="screen list-screen" data-testid="diary">
      <header className="list-head">
        <button className="btn ghost small" onClick={onBack}>
          ← Home
        </button>
        <h1>📔 Mood diary</h1>
        <div className="range-tabs" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} className={`chip-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {r} days
            </button>
          ))}
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="card narrow empty">
          <div className="empty-icon">🌙</div>
          <h2>Your diary is empty</h2>
          <p className="muted">Every song you play is logged here with its mood, so you can see how your listening feels over the days.</p>
          <button className="btn primary" onClick={onBack}>
            Play something
          </button>
        </div>
      ) : (
        <>
          <section className="card diary-summary">
            {totals.top ? (
              <p className="diary-headline">
                Over the last {range} days you mostly listened to{' '}
                <strong style={{ color: EMOTION_STYLES[totals.top].color }}>
                  {EMOTION_STYLES[totals.top].emoji} {EMOTION_STYLES[totals.top].label.toLowerCase()}
                </strong>{' '}
                songs, on {totals.activeDays} day{totals.activeDays === 1 ? '' : 's'}.
              </p>
            ) : (
              <p className="diary-headline">Nothing logged in the last {range} days.</p>
            )}

            <div className="diary-chart" role="img" aria-label="Daily mood mix" data-testid="diary-chart">
              {days.map((d) => {
                const label = dayLabel(d.date);
                return (
                  <div
                    key={d.date}
                    className={`diary-col ${hover === d.date ? 'hover' : ''}`}
                    onMouseEnter={() => setHover(d.date)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className="diary-stack">
                      {d.entries.length ? (
                        EMOTIONS.filter((e) => d.breakdown[e] > 0.5).map((e) => (
                          <span key={e} style={{ flexGrow: d.breakdown[e], background: EMOTION_STYLES[e].color }} />
                        ))
                      ) : (
                        <span className="diary-empty" />
                      )}
                    </div>
                    <div className="diary-day muted small">{range <= 14 ? label.short : label.short[0]}</div>
                    {hover === d.date && (
                      <div className="diary-tip" role="tooltip">
                        <strong>{label.long}</strong>
                        {d.entries.length ? (
                          <>
                            <div className="muted small">
                              {d.entries.length} song{d.entries.length === 1 ? '' : 's'}
                            </div>
                            {EMOTIONS.filter((e) => d.breakdown[e] > 0.5)
                              .sort((a, b) => d.breakdown[b] - d.breakdown[a])
                              .map((e) => (
                                <div key={e} className="tip-row">
                                  <span className="swatch" style={{ background: EMOTION_STYLES[e].color }} />
                                  {EMOTION_STYLES[e].label}
                                  <span className="num">{Math.round(d.breakdown[e])}%</span>
                                </div>
                              ))}
                          </>
                        ) : (
                          <div className="muted small">No listening</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legend">
              {usedEmotions.map((e) => (
                <span key={e} className="legend-item">
                  <span className="swatch" style={{ background: EMOTION_STYLES[e].color }} aria-hidden /> {EMOTION_STYLES[e].label}
                </span>
              ))}
            </div>
          </section>

          <section className="diary-list">
            {listened.map((d) => (
              <div key={d.date} className="diary-day-group">
                <h3>{dayLabel(d.date).long}</h3>
                {d.entries
                  .slice()
                  .reverse()
                  .map((e) => {
                    const st = EMOTION_STYLES[e.dominant];
                    return (
                      <div key={e.songId + e.at} className="diary-entry" style={{ '--emo': st.color } as CSSProperties} data-testid="diary-entry">
                        <span className="diary-emoji" aria-hidden>
                          {st.emoji}
                        </span>
                        <span className="diary-title">
                          <strong>{e.title}</strong> <span className="muted">· {e.artist}</span>
                        </span>
                        <span className="muted small">
                          {st.label} · {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
