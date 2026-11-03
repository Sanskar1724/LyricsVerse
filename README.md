# LyricVerse 🎶

Drop in a song and its lyrics, then watch them come alive in a DJ-studio light show: words that land on the beat, a live frequency histogram, stage lights, a heart-monitor trace, and a shareable Song DNA card.

Everything runs locally in your browser. No backend, no login, no uploads.

## Run it

Requires Node.js 18+ (tested on Node 22).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) and click **✨ Try the sample song**. No files needed.

Production build: `npm run build`, then `npm run preview`.

## Using it

1. **Audio (optional):** drop an MP3/WAV on the drop zone. Without audio, lyrics play on a silent clock with a gentle synthetic beat.
   With audio and plain lyrics, **✨ Auto-sync** (on by default) listens to the song offline and lines each lyric up with the singing.
2. **Lyrics:** paste either
   - LRC with timestamps: `[00:12.50] a lyric line` (metadata `[ti:]`, `[ar:]`, `[offset:]` and stacked timestamps are understood), or
   - plain text, one line per row. Lines are spread evenly across the song; use **⏱ Sync** to record real timings by pressing <kbd>Space</kbd> as each line starts (<kbd>Backspace</kbd> undoes, <kbd>Esc</kbd> cancels).
3. Click **Start the show ▶**, then the big play button (browsers require a click before audio can start).

### Beat detection (offline)

Whenever you load audio, LyricVerse finds the tempo and every beat (kick-drum and loudness onsets, autocorrelation for the BPM, then dynamic-programming beat tracking) plus beat 1 of each bar. The ✨ Stars mode lands each word on the nearest beat or half-beat. Songs without audio use a steady 92 BPM grid.

### Auto-sync (offline)

LyricVerse decodes the audio in your browser, separates the centre of the stereo mix (where lead vocals usually sit) from instruments panned to the sides, filters to the vocal range, and finds the sung phrases. Each lyric line is then matched to a phrase using its syllable count. The detected singing is drawn as purple bars on the seek bar. You can re-run it from **🎚 Timing → ✨ Auto-sync to the singing**.

It works best on songs with clear lead vocals in the centre. It can't tell a repeated chorus from new lines, so if your lyrics write a chorus once but the singer sings it three times, paste it three times (or use ⏱ Sync).

### Lyrics out of sync?

Open **🎚 Timing** in the player. Changes apply live while the song plays:

- **🐢 Slower / 🐇 Faster** changes the lyric pace (lines too fast → Slower).
- **◀ Earlier / Later ▶** shifts every line by 0.25 s.
- **Quick fit:** click **① First line starts now** the moment the singer starts. For an exact pace, also click **② Last line starts now** when the last line begins.
- **✓ Done** keeps the new timings (and updates the library copy if the song is saved); **Cancel** restores the old ones.

For songs with long instrumental breaks or repeated choruses, **⏱ Sync** (tap Space on every line) gives the most accurate result.

### Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause (continue in tap-sync) |
| 1–4 | Stars, Kinetic, Karaoke, Tunnel |
| F | Full screen |
| ← / → | Seek 5 s |
| N / P | Next / previous line |
| Esc | Close dialogs |

## Features

- **Emotion analysis (offline):** each line gets one of joy, sadness, anger, love, longing, hope, fear, calm with an intensity 0–1. Uses a weighted lexicon with simple stemming, negation ("not happy" → sadness; Hindi post-negation "ख़ुशी नहीं"), intensifiers ("so", "never… so", CAPS, "!"), emojis and a small Hindi/Hinglish vocabulary. Themes (heartbreak, freedom, nostalgia, love, struggle, party, hope) come from keyword groups plus the emotion mix.
- **Styles** (keys 1–4), all over a shared living background:
  - ✨ Stars: gold sparkle-stars on black. Every word pops in exactly on the beat, joined by fine lines; after seven words the set bursts away and a new one starts.
  - 🔠 Kinetic: every line gets a random look: one of 4 fonts (clean sans, serif italic, handwriting, poster caps), 8 entrances (pop, rise, drop, slide, flip, un-blur, wipe, zoom), 4 finishes (solid, gradient, outline, glow), a tilt, and sometimes sparks. Emotional words are highlighted. Consecutive lines never repeat a font or entrance.
  - 🎤 Karaoke: each word fills with colour as it's sung, with a bouncing ball and the next line underneath.
  - 🌀 Tunnel: fly through rings of light that speed up with the music; words zoom out of the vanishing point.
- **DJ-studio background**, shared by every style:
  - a live **frequency histogram** on a grid (like a photo histogram, but for sound), split into SUB · BASS · MIDS · HIGHS · AIR, with peak-hold markers. Without audio, a simulated spectrum moves with the beat;
  - **stage lights** that sweep from the ceiling and flare on the beat, with an occasional strobe on beat 1;
  - a **heart-monitor trace** that spikes on every beat, in a pulse style per line (heartbeat, lub-dub, seismograph spike, wave, zig-zag), each beat a little different;
  - a **deck readout** (BPM, beat-of-the-bar lights, time remaining), LED level meters and a spinning record;
  - a colour wash in the line's mood colours.

  Rolled at random for every line: histogram style (filled mountain, stepped bars, mirrored, glowing outline, LED dots), grid (diamonds, lines, none), panel colouring, light pattern (sweep, cross, strobe, still) and number of beams. A fresh set of looks is rolled every time you open a song (add `?seed=123` to the URL to pin one).
- **Song DNA:** donut of the emotion mix, top themes, the most emotional line, and a "mood heartbeat" graph. Download as a 1080×1350 PNG.
- **Library & Mood diary:** saved songs (lyrics, timings, analysis; not the audio) and a day-by-day view of the moods you've listened to, in `localStorage`. If storage is full or blocked, you get a friendly message and the app keeps working in memory.

## Project layout

```
src/
  App.tsx                 screen routing + session (song + player)
  types.ts                Song, LyricLine, Emotion, Theme…
  lib/
    lyrics.ts             LRC / plain parsing, timeline cleanup, even spread, timing adjust
    autosync.ts           offline vocal detection + lyric alignment
    analysis/             lexicon.ts, lexiconAnalyzer.ts, themes.ts, index.ts (LyricAnalyzer interface)
    songBuilder.ts        lyrics + duration → analysed Song
    player.ts             audio file (Web Audio AnalyserNode, beat detection) or silent clock
    looks.ts              random per-line looks (fonts, entrances, palettes, DJ background)
    storage.ts            safe localStorage, library, mood diary
    dna.ts                Song DNA stats + canvas card
    sample.ts             original sample song
  modes/                  types.ts (ModeProps), registry.ts, words.ts, and one file per mode
  components/             Home, PlayerScreen, Transport, TapSync, TimingPanel, DnaModal, Library, Diary
tests/
  unit/                   Vitest
  e2e/                    Playwright
```

### Adding a display mode

Write a component that takes `ModeProps` (`song`, `index`, `player`), read `player.currentTime` and `player.sampleEnergy()` inside your own `requestAnimationFrame` loop, cancel it on unmount, and add an entry to `src/modes/registry.ts`.

### Swapping in an LLM analyser

Implement `LyricAnalyzer` from `src/lib/analysis/index.ts` (`analyze(lines): Promise<SongAnalysis>`; the `summarize()` helper builds the song-level summary from per-line results) and pass it as `analyzer` to `buildSong()`.

## Tests

```bash
npm test              # Vitest unit tests
npx playwright install chromium   # first time only
npm run test:e2e      # Playwright end-to-end (starts its own dev server on port 5199)
npm run test:all      # build + unit + e2e
```

E2E tests fail if the browser console logs any error or warning.

## Known limitations

- The emotion analyser is a lexicon. It understands common English words, emojis and a little Hindi, but it doesn't get sarcasm or metaphor, and lines with no emotional words borrow the previous line's mood.
- Audio files are not stored in the library (browser storage is too small). Reopened songs play on the silent clock until you click **🎵 Add audio**.
- Beat detection is a simple bass-energy heuristic. It works well on music with a clear kick drum, less well on ambient tracks.
