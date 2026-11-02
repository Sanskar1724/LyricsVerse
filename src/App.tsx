import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from './types';
import { Player } from './lib/player';
import { getStore, savedToSong, type SavedSong } from './lib/storage';
import { Home } from './components/Home';
import { PlayerScreen } from './components/PlayerScreen';
import { Library } from './components/Library';
import { Diary } from './components/Diary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useToast } from './components/Toasts';

type Screen = 'home' | 'player' | 'library' | 'diary';

interface Session {
  song: Song;
  player: Player;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!getStore().persistent) {
      toast("Your browser isn't letting LyricVerse save data, so the library will only last until you close this tab.", 'warning');
    }
  }, [toast]);

  /** Start a new session, releasing the previous player's audio. */
  const openSession = useCallback((song: Song, player: Player) => {
    if (sessionRef.current && sessionRef.current.player !== player) sessionRef.current.player.destroy();
    sessionRef.current = { song, player };
    setSession({ song, player });
    setScreen('player');
  }, []);

  const closeSession = useCallback((next: Screen = 'home') => {
    sessionRef.current?.player.destroy();
    sessionRef.current = null;
    setSession(null);
    setScreen(next);
  }, []);

  const updateSong = useCallback((song: Song) => {
    if (!sessionRef.current) return;
    sessionRef.current = { ...sessionRef.current, song };
    setSession(sessionRef.current);
  }, []);

  const openSaved = useCallback(
    (saved: SavedSong) => {
      const song = savedToSong(saved);
      openSession(song, Player.silent(song.duration));
    },
    [openSession],
  );

  useEffect(() => () => sessionRef.current?.player.destroy(), []);

  return (
    <div className="app">
      {screen === 'home' && <Home onStart={openSession} onNavigate={setScreen} />}
      {screen === 'library' && <Library onOpen={openSaved} onBack={() => setScreen('home')} />}
      {screen === 'diary' && <Diary onBack={() => setScreen('home')} />}
      {screen === 'player' && session && (
        <ErrorBoundary onReset={() => closeSession('home')}>
          <PlayerScreen
            key={session.player.uid}
            song={session.song}
            player={session.player}
            onSongChange={updateSong}
            onReplace={openSession}
            onExit={() => closeSession('home')}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
