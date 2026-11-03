/**
 * Playback for LyricVerse.
 *
 * One class covers both cases:
 *  - a real audio file, routed through Web Audio (AnalyserNode) so visuals can follow loudness and beats;
 *  - a silent clock, used when there's no audio (the sample song, or songs reopened from the library).
 *    It fakes a gentle beat so the visuals still pulse.
 *
 * The AudioContext is only created inside play(), which is always called from a click or key press,
 * so browsers' autoplay rules are respected.
 */

export interface EnergySample {
  /** Loudness, 0–1, normalised to the song's own recent peak. */
  level: number;
  /** Low-frequency energy, 0–1 (kick, bass). */
  bass: number;
  /** Mid-frequency energy, 0–1 (vocals, snare, guitars). */
  mid: number;
  /** High-frequency energy, 0–1 (hi-hats, cymbals, air). */
  high: number;
  /** True on the frame a beat is detected. */
  beat: boolean;
  /** 1 right after a beat, decaying to 0. Handy for "pop" animations. */
  pulse: number;
}

export type PlayerEvent = 'play' | 'pause' | 'ended' | 'seek' | 'blocked' | 'error' | 'rate';

export class PlayerError extends Error {}

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'webm', 'opus'];
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const SILENT_BPM = 92;

/** Returns a friendly message if the file can't be an audio file, otherwise null. */
export function validateAudioFile(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const looksAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext);
  if (!looksAudio) {
    return `"${file.name}" doesn't look like an audio file. Try an MP3 or WAV.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is too large (over 300 MB).`;
  return null;
}

let sharedContext: AudioContext | null = null;
function getContext(): AudioContext {
  if (!sharedContext) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new PlayerError('This browser does not support Web Audio.');
    sharedContext = new Ctor();
  }
  return sharedContext;
}

export class Player {
  private static nextUid = 1;
  /** Unique per instance, handy as a React key. */
  readonly uid = Player.nextUid++;
  readonly kind: 'audio' | 'silent';
  readonly fileName: string | null;
  /** The original file, kept so auto-sync can analyse it. */
  file: File | null = null;
  duration: number;

  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Uint8Array | null = null;
  private freqData: Uint8Array | null = null;

  // silent clock
  private vPlaying = false;
  private vPos = 0;
  private vWall = 0;
  private lastSilentBeat = -1;

  private _rate = 1;
  private destroyed = false;
  private listeners = new Set<(e: PlayerEvent) => void>();
  private audioListeners: [string, EventListener][] = [];

  private energy: EnergySample = { level: 0, bass: 0, mid: 0, high: 0, beat: false, pulse: 0 };
  private lastSampleAt = 0;
  private spec: Float32Array = new Float32Array(0);
  private specAt = 0;
  private bassHistory: number[] = [];
  private lastBeatAt = -Infinity;
  private runningPeak = 0.08;

  private constructor(kind: 'audio' | 'silent', duration: number, fileName: string | null) {
    this.kind = kind;
    this.duration = duration;
    this.fileName = fileName;
  }

  static silent(duration: number): Player {
    return new Player('silent', Math.max(1, duration), null);
  }

  /** Load an audio file. Rejects with a friendly PlayerError for wrong or corrupted files. */
  static async fromFile(file: File, timeoutMs = 15000): Promise<Player> {
    const problem = validateAudioFile(file);
    if (problem) throw new PlayerError(problem);

    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'auto';
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new PlayerError(`"${file.name}" took too long to load.`)), timeoutMs);
        audio.onloadedmetadata = () => {
          window.clearTimeout(timer);
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
            reject(new PlayerError(`Couldn't work out how long "${file.name}" is. It may be corrupted or still streaming.`));
          } else resolve(audio.duration);
        };
        audio.onerror = () => {
          window.clearTimeout(timer);
          reject(new PlayerError(`"${file.name}" couldn't be played. The file may be corrupted or in a format this browser doesn't support.`));
        };
        audio.src = url;
      });
      audio.onloadedmetadata = null;
      audio.onerror = null;
      const p = new Player('audio', duration, file.name);
      p.audio = audio;
      p.url = url;
      p.file = file;
      p.bindAudio();
      return p;
    } catch (err) {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      throw err instanceof PlayerError ? err : new PlayerError(`"${file.name}" couldn't be loaded.`);
    }
  }

  private bindAudio() {
    const a = this.audio!;
    const on = (type: string, fn: EventListener) => {
      a.addEventListener(type, fn);
      this.audioListeners.push([type, fn]);
    };
    on('ended', () => this.emit('ended'));
    on('play', () => this.emit('play'));
    on('pause', () => this.emit('pause'));
    on('error', () => this.emit('error'));
  }

  on(fn: (e: PlayerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: PlayerEvent) {
    for (const fn of [...this.listeners]) fn(e);
  }

  get currentTime(): number {
    if (this.audio) return this.audio.currentTime;
    if (!this.vPlaying) return this.vPos;
    return Math.min(this.duration, this.vPos + ((performance.now() - this.vWall) / 1000) * this._rate);
  }

  get playing(): boolean {
    if (this.audio) return !this.audio.paused && !this.audio.ended;
    return this.vPlaying;
  }

  get rate(): number {
    return this._rate;
  }

  set rate(r: number) {
    const clamped = Math.min(3, Math.max(0.25, r));
    if (this.audio) this.audio.playbackRate = clamped;
    else if (this.vPlaying) {
      this.vPos = this.currentTime;
      this.vWall = performance.now();
    }
    this._rate = clamped;
    this.emit('rate');
  }

  /** Start or resume. Must be called from a user gesture the first time (autoplay rules). */
  async play(): Promise<void> {
    if (this.destroyed) return;
    if (this.currentTime >= this.duration - 0.05) this.seek(0); // replay from the top
    if (!this.audio) {
      if (this.vPlaying) return;
      this.vPlaying = true;
      this.vWall = performance.now();
      this.emit('play');
      return;
    }
    try {
      this.ensureGraph();
    } catch {
      // No Web Audio: play without visual analysis.
    }
    const ctx = sharedContext;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    try {
      await this.audio.play();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError') {
        this.emit('blocked');
        return;
      }
      if (name === 'AbortError') return; // paused before it started; harmless
      this.emit('error');
    }
  }

  pause(): void {
    if (this.audio) {
      this.audio.pause();
      return;
    }
    if (!this.vPlaying) return;
    this.vPos = this.currentTime;
    this.vPlaying = false;
    this.emit('pause');
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(t: number): void {
    const clamped = Math.min(this.duration, Math.max(0, Number.isFinite(t) ? t : 0));
    if (this.audio) this.audio.currentTime = clamped;
    else {
      this.vPos = clamped;
      this.vWall = performance.now();
    }
    this.bassHistory = [];
    this.emit('seek');
  }

  /** Call once per animation frame. Drives the silent clock's "ended" event. */
  tick(): void {
    if (!this.audio && this.vPlaying && this.currentTime >= this.duration) {
      this.vPos = this.duration;
      this.vPlaying = false;
      this.emit('pause');
      this.emit('ended');
    }
  }

  private ensureGraph() {
    if (this.analyser || !this.audio) return;
    const ctx = getContext();
    this.source = ctx.createMediaElementSource(this.audio);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048; // finer low-end resolution for the spectrum display
    this.analyser.smoothingTimeConstant = 0.72;
    this.source.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Current loudness / beat reading. Cheap to call many times per frame (cached). */
  sampleEnergy(): EnergySample {
    const now = performance.now();
    if (now - this.lastSampleAt < 8) return this.energy;
    this.lastSampleAt = now;

    let level = 0;
    let bass = 0;
    let mid = 0;
    let high = 0;
    let beat = false;

    if (this.playing && this.analyser && this.timeData && this.freqData) {
      this.analyser.getByteTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const v = (this.timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.timeData.length);
      this.runningPeak = Math.max(rms, this.runningPeak * 0.997, 0.04);
      level = Math.min(1, rms / this.runningPeak);
      const bins = Math.max(2, Math.floor(this.freqData.length * 0.03));
      let b = 0;
      for (let i = 0; i < bins; i++) b += this.freqData[i];
      bass = b / bins / 255;
      const freq = this.freqData;
      const bandAvg = (from: number, to: number) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += freq[i];
        return sum / Math.max(1, to - from) / 255;
      };
      const len = freq.length;
      mid = Math.min(1, bandAvg(bins, Math.floor(len * 0.18)) * 1.4);
      high = Math.min(1, bandAvg(Math.floor(len * 0.18), Math.floor(len * 0.5)) * 2.2);

      this.bassHistory.push(bass);
      if (this.bassHistory.length > 43) this.bassHistory.shift();
      const avg = this.bassHistory.reduce((s, x) => s + x, 0) / this.bassHistory.length;
      if (bass > avg * 1.18 && bass > 0.3 && now - this.lastBeatAt > 280) beat = true;
    } else if (this.playing && !this.audio) {
      const t = this.currentTime;
      const beats = (t * SILENT_BPM) / 60;
      const phase = beats % 1;
      const beatIndex = Math.floor(beats);
      const pulse = Math.exp(-phase * 4);
      level = 0.35 + 0.4 * pulse + 0.1 * Math.sin(t * 0.7);
      bass = 0.25 + 0.6 * pulse;
      mid = 0.35 + 0.15 * Math.sin(t * 1.7);
      high = 0.2 + 0.6 * Math.exp(-((beats * 2) % 1) * 6); // hi-hat on the 8ths
      if (beatIndex !== this.lastSilentBeat) {
        this.lastSilentBeat = beatIndex;
        beat = true;
      }
    }

    if (beat) this.lastBeatAt = now;
    const smooth = level > this.energy.level ? 0.5 : 0.12;
    this.energy = {
      level: this.energy.level + (level - this.energy.level) * smooth,
      bass: this.energy.bass + (bass - this.energy.bass) * 0.4,
      mid: this.energy.mid + (mid - this.energy.mid) * 0.3,
      high: this.energy.high + (high - this.energy.high) * 0.5,
      beat,
      pulse: Math.max(0, 1 - (now - this.lastBeatAt) / 380),
    };
    return this.energy;
  }

  /** Stop playback and release the audio element, Web Audio nodes and object URL. Safe to call twice. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.vPlaying = false;
    this.listeners.clear();
    if (this.audio) {
      for (const [type, fn] of this.audioListeners) this.audio.removeEventListener(type, fn);
      this.audioListeners = [];
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
    } catch {
      // already disconnected
    }
    this.source = null;
    this.analyser = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.audio = null;
    this.file = null;
  }

  /** Lowest and highest frequency shown by spectrum(), in Hz. */
  static readonly SPECTRUM_MIN_HZ = 30;
  static readonly SPECTRUM_MAX_HZ = 16000;

  /** Frequency of the edge of band `i` out of `n` log-spaced bands. */
  static bandEdgeHz(i: number, n: number): number {
    return Player.SPECTRUM_MIN_HZ * Math.pow(Player.SPECTRUM_MAX_HZ / Player.SPECTRUM_MIN_HZ, i / n);
  }

  /**
   * The music's spectrum as `bands` log-spaced bands (0–1), smoothed for display.
   * Without audio (silent clock) a plausible spectrum is simulated from the beat: kick, a wandering voice, hi-hats.
   * The returned array is reused between calls; copy it if you need to keep it.
   */
  spectrum(bands: number): Float32Array {
    if (this.spec.length !== bands) this.spec = new Float32Array(bands);
    const now = performance.now();
    if (now - this.specAt < 8) return this.spec;
    this.specAt = now;
    const en = this.sampleEnergy(); // refreshes freqData too
    const out = this.spec;
    const playing = this.playing;

    if (playing && this.analyser && this.freqData) {
      const binHz = (sharedContext?.sampleRate ?? 44100) / this.analyser.fftSize;
      const data = this.freqData;
      for (let i = 0; i < bands; i++) {
        const lo = Math.max(1, Math.floor(Player.bandEdgeHz(i, bands) / binHz));
        const hi = Math.max(lo + 1, Math.ceil(Player.bandEdgeHz(i + 1, bands) / binHz));
        let peak = 0;
        for (let b = lo; b < Math.min(hi, data.length); b++) peak = Math.max(peak, data[b]);
        // Music gets quieter towards the treble: tilt it up a little so the highs are visible.
        const target = Math.min(1, (peak / 255) * (0.85 + (i / bands) * 0.5));
        out[i] += (target - out[i]) * (target > out[i] ? 0.6 : 0.15);
      }
      return out;
    }

    const t = this.currentTime;
    const beats = (t * SILENT_BPM) / 60;
    const kick = Math.exp(-(beats % 1) * 5);
    const hat = Math.exp(-((beats * 2) % 1) * 7);
    const voiceAt = 0.46 + 0.08 * Math.sin(t * 0.7);
    for (let i = 0; i < bands; i++) {
      const x = i / bands;
      let target = 0;
      if (playing) {
        target =
          0.32 * Math.exp(-((x - 0.3) ** 2) / 0.06) +
          0.18 * (1 - x) +
          0.75 * kick * Math.exp(-((x - 0.1) ** 2) / 0.004) +
          (0.42 + 0.15 * Math.sin(t * 2.1)) * Math.exp(-((x - voiceAt) ** 2) / 0.008) +
          0.3 * Math.exp(-((x - voiceAt - 0.12) ** 2) / 0.004) +
          0.38 * hat * Math.exp(-((x - 0.84) ** 2) / 0.006) +
          0.05 * Math.sin(i * 12.9898 + t * 9) +
          0.08 * en.level;
      }
      target = Math.max(0, Math.min(1, target));
      out[i] += (target - out[i]) * (target > out[i] ? 0.5 : 0.1);
    }
    return out;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}
