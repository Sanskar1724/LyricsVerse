import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Song } from '../types';
import { SAMPLE_SONG } from '../lib/sample';
import { detectFormat, formatTime, parseLyrics } from '../lib/lyrics';
import { analyzeSongAudio, buildSong, FriendlyError } from '../lib/songBuilder';
import { Player, PlayerError, validateAudioFile } from '../lib/player';
import { useToast } from './Toasts';

interface Props {
  onStart: (song: Song, player: Player) => void;
  onNavigate: (screen: 'library' | 'diary') => void;
}

type AudioState =
  | { status: 'none' }
  | { status: 'loading'; name: string }
  | { status: 'ready'; name: string; player: Player }
  | { status: 'error'; message: string };

export function Home({ onStart, onNavigate }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [audio, setAudio] = useState<AudioState>({ status: 'none' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** null = decide from the lyrics: on for plain text, off for LRC (which already has timings). */
  const [autoSyncChoice, setAutoSyncChoice] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingPlayer = useRef<Player | null>(null);
  const handedOver = useRef(false);
  const loadToken = useRef(0);
  const toast = useToast();

  // Release a probed audio file if we leave without using it.
  useEffect(
    () => () => {
      if (!handedOver.current) pendingPlayer.current?.destroy();
    },
    [],
  );

  const info = useMemo(() => {
    if (!lyrics.trim()) return null;
    const parsed = parseLyrics(lyrics);
    const n = parsed.lines.length;
    if (detectFormat(lyrics) === 'lrc') return { kind: 'lrc' as const, text: `LRC detected · ${n} timed line${n === 1 ? '' : 's'}` };
    return {
      kind: 'plain' as const,
      text: `Plain text · ${n} line${n === 1 ? '' : 's'}. Timings will be spread evenly; you can tap to sync them later.`,
    };
  }, [lyrics]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    pendingPlayer.current?.destroy();
    pendingPlayer.current = null;
    const problem = validateAudioFile(file);
    if (problem) {
      setAudio({ status: 'error', message: problem });
      return;
    }
    const token = ++loadToken.current;
    setAudio({ status: 'loading', name: file.name });
    try {
      const player = await Player.fromFile(file);
      if (token !== loadToken.current) {
        player.destroy();
        return;
      }
      pendingPlayer.current = player;
      setAudio({ status: 'ready', name: file.name, player });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    } catch (err) {
      if (token !== loadToken.current) return;
      setAudio({ status: 'error', message: err instanceof PlayerError ? err.message : "That file couldn't be opened." });
    }
  }

  function clearAudio() {
    loadToken.current++;
    pendingPlayer.current?.destroy();
    pendingPlayer.current = null;
    setAudio({ status: 'none' });
    if (fileInput.current) fileInput.current.value = '';
  }

  const useAutoSync = autoSyncChoice ?? info?.kind !== 'lrc';

  async function start() {
    setError(null);
    if (audio.status === 'loading') {
      setError('Hang on, the audio is still loading…');
      return;
    }
    setBusy(true);
    try {
      const player = audio.status === 'ready' ? audio.player : null;
      let song = await buildSong({
        title,
        artist,
        rawLyrics: lyrics,
        audioDuration: player ? player.duration : null,
      });
      for (const w of song.warnings) toast(w, 'warning');
      if (player?.file) {
        setStatus(useAutoSync ? '🎧 Listening for the beat and the singing…' : '🥁 Listening for the beat…');
        const res = await analyzeSongAudio(song, player.file, player.duration, { autoSync: useAutoSync });
        song = res.song;
        if (song.beats) toast(`🥁 Found the beat: ${Math.round(song.beats.bpm)} BPM`, 'info');
        if (res.confidence !== null) {
          toast(
            `✨ Auto-synced ${song.lines.length} lines to the singing (${fitLabel(res.confidence)} fit). If a line is off, use 🎚 Timing.`,
            'success',
          );
        } else if (res.syncError) {
          toast(`${res.syncError} Using estimated timings for now.`, 'warning');
        }
      }
      handedOver.current = true;
      onStart(song, player ?? Player.silent(song.duration));
    } catch (err) {
      setError(err instanceof FriendlyError ? err.message : 'Something went wrong reading those lyrics.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function startSample() {
    setBusy(true);
    try {
      const song = await buildSong({
        title: SAMPLE_SONG.title,
        artist: SAMPLE_SONG.artist,
        rawLyrics: SAMPLE_SONG.lyrics,
        audioDuration: null,
        fallbackDuration: SAMPLE_SONG.duration,
        isSample: true,
        id: 'sample-paper-lanterns',
      });
      onStart(song, Player.silent(song.duration));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    const audioFile = files.find((f) => !/\.(lrc|txt)$/i.test(f.name));
    const lyricFile = files.find((f) => /\.(lrc|txt)$/i.test(f.name));
    if (lyricFile) void lyricFile.text().then(setLyrics);
    if (audioFile) void pickFile(audioFile);
  }

  return (
    <div className="screen home">
      <div className="aurora" aria-hidden />
      <header className="hero">
        <h1 className="logo">
          Lyric<span>Verse</span>
        </h1>
        <p className="tagline">Drop in a song. Watch its feelings come alive.</p>
        <div className="hero-actions">
          <button className="btn primary big" onClick={startSample} disabled={busy} data-testid="sample-button">
            ✨ Try the sample song
          </button>
          <button className="btn ghost" onClick={() => onNavigate('library')} data-testid="nav-library">
            📚 Library
          </button>
          <button className="btn ghost" onClick={() => onNavigate('diary')} data-testid="nav-diary">
            📔 Mood diary
          </button>
        </div>
      </header>

      <section className="card setup" aria-label="Load your own song">
        <h2>Your own song</h2>
        <div className="setup-grid">
          <div className="setup-col">
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" maxLength={120} />
            </label>
            <label className="field">
              <span>Artist</span>
              <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Who sings it?" maxLength={120} />
            </label>

            <div
              className={`dropzone ${dragging ? 'dragging' : ''} ${audio.status}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInput.current?.click())}
              data-testid="dropzone"
            >
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                hidden
                data-testid="audio-input"
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
              {audio.status === 'none' && (
                <>
                  <div className="dz-icon">🎵</div>
                  <div>
                    <strong>Drop an audio file</strong> or click to choose (MP3, WAV)
                  </div>
                  <div className="muted small">Optional: without audio, lyrics play on a silent clock.</div>
                </>
              )}
              {audio.status === 'loading' && <div>⏳ Loading {audio.name}…</div>}
              {audio.status === 'ready' && (
                <div data-testid="audio-ready">
                  ✅ <strong>{audio.name}</strong> · {formatTime(audio.player.duration)}
                </div>
              )}
              {audio.status === 'error' && (
                <div className="dz-error" data-testid="audio-error">
                  😕 {audio.message}
                </div>
              )}
            </div>
            {(audio.status === 'ready' || audio.status === 'error') && (
              <button className="btn link" onClick={clearAudio}>
                Remove audio
              </button>
            )}
          </div>

          <div className="setup-col">
            <label className="field grow">
              <span>Lyrics</span>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={'Paste lyrics here.\n\nLRC with timestamps:\n[00:12.50] First line\n[00:16.00] Second line\n\n…or plain text, one line per row.'}
                spellCheck={false}
                data-testid="lyrics-input"
              />
            </label>
            {info && (
              <div className={`format-info ${info.kind}`} data-testid="format-info">
                {info.text}
              </div>
            )}
            <button className="btn link" onClick={() => setLyrics(SAMPLE_SONG.lyrics)}>
              Paste the sample lyrics
            </button>
          </div>
        </div>
        {audio.status === 'ready' && (
          <label className="autosync-option" data-testid="autosync-option">
            <input type="checkbox" checked={useAutoSync} onChange={(e) => setAutoSyncChoice(e.target.checked)} data-testid="autosync-checkbox" />
            <span>
              <strong>✨ Auto-sync lyrics to the singing</strong>
              <span className="muted small">
                {' '}
                LyricVerse listens to the song (offline) and lines each lyric up with the vocals.
                {info?.kind === 'lrc' ? ' Your LRC already has timings, so this is off unless you want to replace them.' : ''}
              </span>
            </span>
          </label>
        )}
        {status && (
          <div className="sync-status" role="status" data-testid="sync-status">
            <span className="spinner" aria-hidden /> {status}
          </div>
        )}
        {error && (
          <div className="form-error" role="alert" data-testid="form-error">
            {error}
          </div>
        )}
        <div className="setup-actions">
          <button className="btn primary" onClick={start} disabled={busy} data-testid="start-button">
            Start the show ▶
          </button>
        </div>
      </section>
      <footer className="home-foot muted small">Everything stays on your computer. No uploads, no accounts.</footer>
    </div>
  );
}

function fitLabel(confidence: number): string {
  if (confidence >= 0.75) return 'good';
  if (confidence >= 0.5) return 'fair';
  return 'rough';
}
