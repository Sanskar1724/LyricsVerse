import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Emotion, LyricLine, Song } from '../types';
import { Player, PlayerError } from '../lib/player';
import { lastStartedIndex } from '../lib/lyrics';
import { gameReducer, initialGame, makeOptions } from '../lib/game';
import { getStore, isInLibrary, logListen, PREFS_KEY, saveSong } from '../lib/storage';
import { analyzeSongAudio, autoSyncSong, retimeForAudio, FriendlyError } from '../lib/songBuilder';
import { usePlayback } from '../hooks/usePlayback';
import { MODES, findMode } from '../modes/registry';
import { Backdrop } from '../modes/Backdrop';
import { makeLooks, sessionSeed } from '../lib/looks';
import { Transport } from './Transport';
import { TapSync } from './TapSync';
import { TimingPanel } from './TimingPanel';
import { DnaModal } from './DnaModal';
import { GameSetup } from './game/GameSetup';
import { GameOverlay, Scoreboard } from './game/GameOverlay';
import { GameResults } from './game/GameResults';
import { useToast } from './Toasts';

interface Props {
  song: Song;
  player: Player;
  onSongChange: (song: Song) => void;
  onReplace: (song: Song, player: Player) => void;
  onExit: () => void;
}

type Overlay = null | 'dna' | 'gameSetup' | 'results';

interface Prefs {
  mode?: string;
  playerNames?: string[];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range';
}

export function PlayerScreen({ song, player, onSongChange, onReplace, onExit }: Props) {
  const toast = useToast();
  const store = getStore();
  const [prefs] = useState<Prefs>(() => store.read<Prefs>(PREFS_KEY, {}));
  const [modeId, setModeId] = useState(() => findMode(prefs.mode ?? 'stars').id);
  const [seed] = useState(sessionSeed);
  const looks = useMemo(
    () =>
      makeLooks(
        song.analysis.lines.map((l) => l.emotion),
        seed,
      ),
    [song.analysis, seed],
  );
  const [game, dispatch] = useReducer(gameReducer, initialGame);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tapping, setTapping] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [hideEstimateHint, setHideEstimateHint] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [started, setStarted] = useState(player.playing);
  const [blocked, setBlocked] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [names, setNames] = useState<string[]>(prefs.playerNames?.length ? prefs.playerNames : ['', '']);
  const [inLibrary, setInLibrary] = useState(() => isInLibrary(song.id, store));
  const [rate, setRate] = useState(player.rate);

  const rootRef = useRef<HTMLDivElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const songRef = useRef(song);
  songRef.current = song;
  const tappingRef = useRef(tapping);
  tappingRef.current = tapping;
  const askedRef = useRef(-1);
  const loggedRef = useRef(false);
  const idleTimer = useRef(0);

  // --- Game: pause right as an unanswered line starts, and ask about it.
  const checkGame = useCallback(() => {
    const g = gameRef.current;
    if ((g.phase !== 'playing' && g.phase !== 'reveal') || !player.playing) return;
    const s = songRef.current;
    const t = player.currentTime;
    const idx = lastStartedIndex(s.lines, t);
    if (idx < 0 || askedRef.current === idx || g.answeredLines.includes(idx) || t >= s.lines[idx].end) return;
    askedRef.current = idx;
    player.pause();
    const correct = s.analysis.lines[idx].emotion;
    if (g.phase === 'reveal') dispatch({ type: 'continue' });
    dispatch({ type: 'ask', lineIndex: idx, correctEmotion: correct, options: makeOptions(correct, idx + hashString(s.id)) });
  }, [player]);

  const playback = usePlayback(player, song.lines, checkGame);
  const displayIndex = game.phase === 'question' ? game.lineIndex - 1 : playback.index;

  // --- Player events
  useEffect(
    () =>
      player.on((e) => {
        if (e === 'play') {
          setStarted(true);
          setBlocked(false);
          if (!loggedRef.current) {
            loggedRef.current = true;
            const res = logListen(songRef.current);
            if (!res.ok) toast(res.message, 'warning');
          }
        } else if (e === 'blocked') {
          setStarted(false);
          setBlocked(true);
        } else if (e === 'error') {
          toast('The audio stopped unexpectedly. The file may be damaged.', 'error');
        } else if (e === 'ended') {
          const g = gameRef.current;
          if (g.phase !== 'off' && g.phase !== 'finished') {
            dispatch({ type: 'finish' });
            setOverlay('results');
          } else if (!tappingRef.current && g.phase === 'off') {
            setOverlay('dna');
          }
        }
      }),
    [player, toast],
  );

  // --- Actions
  const savePrefs = (next: Prefs) => store.write(PREFS_KEY, { ...store.read<Prefs>(PREFS_KEY, {}), ...next });

  const switchMode = (id: string) => {
    setModeId(id);
    savePrefs({ mode: id });
  };

  const togglePlay = () => {
    if (gameRef.current.phase === 'question' || tappingRef.current) return;
    if (player.playing) player.pause();
    else void player.play();
  };

  const seek = (t: number) => {
    if (gameRef.current.phase === 'question') return;
    player.seek(t);
  };

  const prevLine = () => {
    const t = player.currentTime;
    const i = lastStartedIndex(song.lines, t);
    if (i >= 0 && t - song.lines[i].start > 1.5) seek(song.lines[i].start);
    else seek(i > 0 ? song.lines[i - 1].start : 0);
  };

  const nextLine = () => {
    const g = gameRef.current;
    if (g.phase === 'question') return;
    const i = lastStartedIndex(song.lines, player.currentTime);
    const next = song.lines[i + 1];
    if (g.phase === 'playing' || g.phase === 'reveal') {
      if (!next) {
        player.pause();
        dispatch({ type: 'finish' });
        setOverlay('results');
        return;
      }
      player.seek(next.start);
      void player.play();
      return;
    }
    player.seek(next ? next.start : song.duration);
  };

  const changeRate = (r: number) => {
    player.rate = r;
    setRate(player.rate);
  };

  const startGame = (playerNames: string[]) => {
    setNames(playerNames);
    savePrefs({ playerNames });
    setOverlay(null);
    askedRef.current = -1;
    dispatch({ type: 'start', names: playerNames });
    player.pause();
    player.seek(0);
    void player.play();
  };

  const guess = (e: Emotion) => {
    if (gameRef.current.phase !== 'question') return;
    dispatch({ type: 'guess', emotion: e });
    void player.play(); // the revealed line plays while the result shows
  };

  const quitGame = () => {
    dispatch({ type: 'quit' });
    setOverlay(null);
  };

  const save = () => {
    const res = saveSong(songRef.current, store);
    if (res.ok) {
      setInLibrary(true);
      toast(res.persisted ? 'Saved to your library 💾' : "Saved for this session only (your browser isn't allowing storage).", res.persisted ? 'success' : 'warning');
    } else toast(res.message, 'error');
  };

  /** Keep user-made timings: update the song, and the library copy if there is one. */
  const commitTimings = (lines: LyricLine[]) => {
    const next: Song = { ...songRef.current, lines, timing: 'tapped' };
    onSongChange(next);
    if (inLibrary) {
      const res = saveSong(next, store);
      toast(res.ok ? 'New timings saved to your library ⏱' : res.message, res.ok ? 'success' : 'error');
    } else {
      toast('New timings applied! Press 💾 Save to keep them in your library.', 'success');
    }
  };

  const saveTimings = (lines: LyricLine[]) => {
    setTapping(false);
    commitTimings(lines);
    player.seek(0);
  };

  const previewTimings = (lines: LyricLine[]) => onSongChange({ ...songRef.current, lines });

  const runAutoSync = async () => {
    if (!player.file || syncing) return;
    setSyncing(true);
    try {
      const res = await autoSyncSong(songRef.current, player.file, player.duration);
      setAdjusting(false);
      onSongChange(res.song);
      if (inLibrary) saveSong(res.song, store);
      toast(`✨ Auto-synced ${res.song.lines.length} lines to the singing. If a line is off, use 🎚 Timing.`, 'success');
    } catch (err) {
      toast(err instanceof FriendlyError ? err.message : 'Auto-sync failed.', 'warning');
    } finally {
      setSyncing(false);
    }
  };

  const attachAudio = async (file: File | undefined) => {
    if (!file) return;
    let p: Player | null = null;
    try {
      p = await Player.fromFile(file);
      const retimed = await retimeForAudio(songRef.current, p.duration);
      const fitted = (await analyzeSongAudio(retimed, file, p.duration, { autoSync: false })).song;
      for (const w of fitted.warnings) toast(w, 'warning');
      onReplace(fitted, p);
      toast(`Playing with ${file.name} 🎵`, 'success');
    } catch (err) {
      p?.destroy();
      toast(err instanceof PlayerError || err instanceof FriendlyError ? err.message : "Couldn't open that file.", 'error');
    } finally {
      if (audioInput.current) audioInput.current.value = '';
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      toast("Full screen isn't available in this window.", 'warning');
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // --- Keyboard shortcuts (bound once; reads the latest handlers through a ref)
  const handlers = useRef({ togglePlay, switchMode, toggleFullscreen, seek, nextLine, prevLine, guess });
  handlers.current = { togglePlay, switchMode, toggleFullscreen, seek, nextLine, prevLine, guess };
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || tappingRef.current) return;
      const h = handlers.current;
      const g = gameRef.current;
      const isSpace = e.code === 'Space' || e.key === ' ';
      if (g.phase === 'question') {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= g.options.length) {
          e.preventDefault();
          h.guess(g.options[n - 1]);
        } else if (isSpace) e.preventDefault();
        return;
      }
      if (overlayRef.current) return; // modals handle their own keys
      const onSlider = e.target instanceof HTMLInputElement && e.target.type === 'range';
      if (isSpace) {
        e.preventDefault();
        h.togglePlay();
        return;
      }
      const mode = MODES.find((m) => m.hotkey === e.key);
      if (mode) {
        h.switchMode(mode.id);
        return;
      }
      if (e.key === 'f' || e.key === 'F') void h.toggleFullscreen();
      else if (e.key === 'ArrowRight' && !onSlider) h.seek(player.currentTime + 5);
      else if (e.key === 'ArrowLeft' && !onSlider) h.seek(player.currentTime - 5);
      else if (e.key === 'n' || e.key === 'N') h.nextLine();
      else if (e.key === 'p' || e.key === 'P') h.prevLine();
    };
    // Stop Space from also "clicking" whichever button has focus.
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === ' ') && !isTypingTarget(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [player]);

  // --- Hide the controls while the music plays and the mouse is still (party mode).
  const wake = () => {
    if (idle) setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 3000);
  };
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);
  const chromeHidden = idle && playback.playing && !overlay && !tapping && !adjusting && game.phase !== 'question';

  const mode = findMode(modeId);
  const ModeComponent = mode.Component;
  const gameActive = game.phase !== 'off';

  return (
    <div
      ref={rootRef}
      className={`screen player-screen ${chromeHidden ? 'idle' : ''} ${fullscreen ? 'is-fullscreen' : ''} ${game.phase === 'reveal' ? 'revealing' : ''}`}
      onMouseMove={wake}
      data-testid="player-screen"
      data-mode={mode.id}
    >
      <div className="stage">
        <Backdrop song={song} index={displayIndex} player={player} looks={looks} tone={mode.backdrop} />
        <ModeComponent key={mode.id} song={song} index={displayIndex} player={player} looks={looks} />
      </div>

      <header className="topbar">
        <button className="btn ghost small" onClick={onExit} data-testid="exit">
          ← Home
        </button>
        <div className="song-meta">
          <div className="song-title" data-testid="song-title">
            {song.title}
          </div>
          <div className="song-artist muted small">
            {song.artist}
            {player.kind === 'silent' ? ' · no audio (silent clock)' : ''}
          </div>
        </div>
        <nav className="mode-tabs" role="tablist" aria-label="Display mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === mode.id}
              className={`mode-tab ${m.id === mode.id ? 'active' : ''}`}
              onClick={() => switchMode(m.id)}
              title={`${m.label}: ${m.description} (key ${m.hotkey})`}
              aria-label={m.label}
              data-testid={`mode-tab-${m.id}`}
            >
              <span aria-hidden>{m.icon}</span>
              <span className="mode-tab-label">{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button
            className={`btn small ${gameActive ? 'active' : ''}`}
            onClick={() => (gameActive ? quitGame() : setOverlay('gameSetup'))}
            disabled={tapping}
            data-testid="open-game"
          >
            {gameActive ? '✖ End game' : '🎮 Game'}
          </button>
          <button className="btn small" onClick={() => setOverlay('dna')} disabled={game.phase === 'question'} data-testid="open-dna">
            🧬 DNA
          </button>
          <button className="btn small" onClick={save} data-testid="save-song">
            {inLibrary ? '💾 Saved ✓' : '💾 Save'}
          </button>
          <button
            className="btn small"
            onClick={() => {
              player.pause();
              setTapping(true);
            }}
            disabled={gameActive || tapping || adjusting}
            title="Record line timings by tapping Space"
            data-testid="open-tapsync"
          >
            ⏱ Sync
          </button>
          <button
            className={`btn small ${adjusting ? 'active' : ''}`}
            onClick={() => setAdjusting(true)}
            disabled={gameActive || tapping || adjusting}
            title="Lyrics too fast, slow, early or late? Fix them while the song plays"
            data-testid="open-timing"
          >
            🎚 Timing
          </button>
          <button className="btn small" onClick={() => audioInput.current?.click()} title="Play this song with an audio file" data-testid="attach-audio">
            🎵 {player.kind === 'silent' ? 'Add audio' : 'Change audio'}
          </button>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
            hidden
            onChange={(e) => void attachAudio(e.target.files?.[0])}
            data-testid="attach-audio-input"
          />
          <button className="icon-btn" onClick={() => void toggleFullscreen()} aria-label="Full screen" title="Full screen (F)" data-testid="fullscreen">
            {fullscreen ? '🗗' : '⛶'}
          </button>
        </div>
      </header>

      {gameActive && <Scoreboard game={game} />}
      <GameOverlay game={game} song={song} onGuess={guess} onNext={nextLine} onQuit={quitGame} />

      {tapping && <TapSync lines={song.lines} player={player} onSave={saveTimings} onCancel={() => setTapping(false)} />}
      {adjusting && (
        <TimingPanel
          lines={song.lines}
          player={player}
          onPreview={previewTimings}
          onDone={(lines) => {
            setAdjusting(false);
            commitTimings(lines);
          }}
          onCancel={(original) => {
            setAdjusting(false);
            previewTimings(original);
          }}
          onAutoSync={player.file ? () => void runAutoSync() : undefined}
          syncing={syncing}
        />
      )}
      {song.timing === 'spread' && !hideEstimateHint && !adjusting && !tapping && !gameActive && (
        <div className="estimate-hint" role="note" data-testid="estimate-hint">
          <span>
            ⏱ These lyrics had no timestamps, so their timing is <strong>estimated</strong>.{' '}
            {player.file ? (
              <>
                Let LyricVerse find the singing:{' '}
                <button className="btn primary small" onClick={() => void runAutoSync()} disabled={syncing} data-testid="hint-autosync">
                  {syncing ? '🎧 Listening…' : '✨ Auto-sync'}
                </button>
              </>
            ) : (
              <>
                Add the song's audio (🎵) to auto-sync, or fix it with <strong>🎚 Timing</strong> / <strong>⏱ Sync</strong>.
              </>
            )}
          </span>
          <button className="toast-close" onClick={() => setHideEstimateHint(true)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <Transport
        song={song}
        time={playback.time}
        index={displayIndex}
        playing={playback.playing}
        rate={rate}
        disabled={game.phase === 'question' || tapping}
        onToggle={togglePlay}
        onSeek={seek}
        onPrev={prevLine}
        onNext={nextLine}
        onRate={changeRate}
      />

      {!started && !overlay && !tapping && !gameActive && (
        <div className="start-overlay">
          <button className="start-btn" onClick={() => void player.play()} data-testid="start-overlay">
            <span className="start-icon">▶</span>
            <span>{blocked ? 'Your browser paused the audio. Click to start' : 'Click to start the show'}</span>
            <span className="muted small">Space = play/pause · 1/2/3 = modes · F = full screen</span>
          </button>
        </div>
      )}

      {overlay === 'dna' && <DnaModal song={song} onClose={() => setOverlay(null)} />}
      {overlay === 'gameSetup' && <GameSetup initialNames={names} onStart={startGame} onClose={() => setOverlay(null)} />}
      {overlay === 'results' && (
        <GameResults game={game} onPlayAgain={() => startGame(names)} onShowDna={() => setOverlay('dna')} onClose={quitGame} />
      )}
    </div>
  );
}
