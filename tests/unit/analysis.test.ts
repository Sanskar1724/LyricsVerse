import { describe, expect, it } from 'vitest';
import { analyzeLine, analyzeLines, detectThemes, emotionBreakdown, lexiconAnalyzer, wordEmotion } from '../../src/lib/analysis';
import { emptyEmotionRecord } from '../../src/lib/emotions';
import { SAMPLE_SONG } from '../../src/lib/sample';
import { parseLyrics } from '../../src/lib/lyrics';
import { EMOTIONS } from '../../src/types';

describe('emotion analyser', () => {
  it('detects clear emotions', () => {
    expect(analyzeLine('I am so happy today').emotion).toBe('joy');
    expect(analyzeLine('Tears keep falling, I am alone').emotion).toBe('sadness');
    expect(analyzeLine('I hate your lies').emotion).toBe('anger');
    expect(analyzeLine('I love you darling').emotion).toBe('love');
    expect(analyzeLine('I miss you every night').emotion).toBe('longing');
    expect(analyzeLine('Tomorrow I believe in hope').emotion).toBe('hope');
    expect(analyzeLine("I'm scared and afraid of the dark").emotion).toBe('fear');
    expect(analyzeLine('Breathe slow, peaceful and calm').emotion).toBe('calm');
  });

  it('handles negation: "not happy" is not joy', () => {
    const r = analyzeLine("I'm not happy");
    expect(r.emotion).toBe('sadness');
    expect(r.scores.joy).toBe(0);
    expect(analyzeLine("I don't love you anymore").emotion).toBe('sadness');
    expect(analyzeLine("I'm not afraid").emotion).toBe('hope');
  });

  it('limits negation to its clause', () => {
    const r = analyzeLine("I'm not sad, I'm happy");
    expect(r.emotion).toBe('joy');
  });

  it('treats "never ... so" as intensity, not negation', () => {
    const r = analyzeLine('I never felt so lost');
    expect(['sadness', 'fear']).toContain(r.emotion);
    expect(r.scores.hope).toBe(0);
    expect(analyzeLine("I'll never be happy").emotion).toBe('sadness');
  });

  it('intensity words raise intensity', () => {
    const plain = analyzeLine('I am sad');
    const strong = analyzeLine('I am so sad');
    const stronger = analyzeLine('I am SO SAD!');
    expect(strong.intensity).toBeGreaterThan(plain.intensity);
    expect(stronger.intensity).toBeGreaterThan(strong.intensity);
    expect(analyzeLine('I am a little sad').intensity).toBeLessThan(plain.intensity);
  });

  it('keeps intensity within 0–1', () => {
    const r = analyzeLine('so so so very very happy happy happy joy joy joy laughing smiling!!!');
    expect(r.intensity).toBeGreaterThan(0.8);
    expect(r.intensity).toBeLessThanOrEqual(1);
  });

  it('handles empty and whitespace-only lines', () => {
    for (const t of ['', '   ', '\t']) {
      const r = analyzeLine(t);
      expect(r.emotion).toBe('calm');
      expect(r.intensity).toBe(0);
      expect(r.words).toEqual([]);
    }
    expect(analyzeLines([])).toEqual([]);
  });

  it('gives neutral lines a low-confidence reading carried from the previous line', () => {
    const [a, b] = analyzeLines(['I am so angry', 'walking down the street']);
    expect(a.emotion).toBe('anger');
    expect(b.emotion).toBe('anger');
    expect(b.confidence).toBe(0);
    expect(b.intensity).toBeLessThan(a.intensity);
    expect(analyzeLine('walking down the street').emotion).toBe('calm');
  });

  it('understands emojis and Hindi', () => {
    expect(analyzeLine('tonight 💔💔').emotion).toBe('sadness');
    expect(analyzeLine('🥳🎉').emotion).toBe('joy');
    expect(analyzeLine('तेरा प्यार मेरा दिल').emotion).toBe('love');
    expect(analyzeLine('teri yaad aati hai').emotion).toBe('longing');
    expect(analyzeLine('मैं ख़ुशी नहीं हूँ').emotion).not.toBe('joy');
    expect(analyzeLine('雨が降る').emotion).toBe('calm'); // unknown language → neutral, no crash
  });

  it('stems simple suffixes', () => {
    expect(wordEmotion('laughing')?.emotion).toBe('joy');
    expect(wordEmotion('screaming,')?.emotion).toBe('anger');
    expect(wordEmotion('table')).toBeNull();
  });

  it('labels each word for kinetic mode', () => {
    const r = analyzeLine('so happy in the rain');
    expect(r.words.map((w) => w.text)).toEqual(['so', 'happy', 'in', 'the', 'rain']);
    expect(r.words[1].emotion).toBe('joy');
    expect(r.words[2].emotion).toBeNull();
  });

  it('gives the sample song a real mix of emotions', async () => {
    const texts = parseLyrics(SAMPLE_SONG.lyrics).lines.map((l) => l.text);
    const a = await lexiconAnalyzer.analyze(texts);
    const found = new Set(a.lines.map((l) => l.emotion));
    expect(found.size).toBeGreaterThanOrEqual(6);
    const total = EMOTIONS.reduce((s, e) => s + a.breakdown[e], 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
    expect(a.peakLine).toBeGreaterThanOrEqual(0);
    expect(a.lines[5].emotion).toBe('sadness'); // "I'm not happy, tears fall like the rain"
    expect(a.lines[6].emotion).toBe('anger');
  });
});

describe('breakdown', () => {
  it('is empty for no lines', () => {
    expect(emotionBreakdown([])).toEqual(emptyEmotionRecord());
  });
});

describe('theme detection', () => {
  const none = emptyEmotionRecord();

  it('finds party and freedom themes', () => {
    const themes = detectThemes(['Dance all night at the party tonight', 'Turn the music loud on the floor', 'We are free, we fly'], none);
    const names = themes.map((t) => t.theme);
    expect(names[0]).toBe('party');
    expect(names).toContain('freedom');
    expect(themes[0].score).toBe(1);
  });

  it('finds heartbreak from keywords plus emotion mix', () => {
    const br = { ...none, sadness: 60, love: 20 };
    const themes = detectThemes(['You said goodbye and now you are gone', 'Tears and broken hearts'], br);
    expect(themes[0].theme).toBe('heartbreak');
  });

  it('finds nostalgia and hope', () => {
    expect(detectThemes(['I remember those days, memories of summer', 'the old photograph'], none)[0].theme).toBe('nostalgia');
    expect(detectThemes(['Tomorrow the sun will rise, a new dawn', 'I believe in hope'], none)[0].theme).toBe('hope');
  });

  it('returns nothing for neutral text and caps at 4 themes', () => {
    expect(detectThemes(['the table is brown'], none)).toEqual([]);
    expect(detectThemes([], none)).toEqual([]);
    const lots = detectThemes(
      ['love heart kiss hold', 'dance party tonight music', 'free fly wings sky', 'remember memories old yesterday', 'hope tomorrow dawn believe', 'fight pain war battle'],
      none,
    );
    expect(lots.length).toBe(4);
  });
});
