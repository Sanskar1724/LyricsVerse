import type { Emotion, Theme } from '../../types';

type Lexicon = Record<Emotion, Record<string, number>>;

/**
 * Hand-tuned word → weight lexicon. Weights are roughly "how strongly this word signals the emotion".
 * Includes a few romanised and Devanagari Hindi words so Hindi / Hinglish lyrics get a sensible reading.
 */
export const LEXICON: Lexicon = {
  joy: {
    happy: 1, happiness: 1, joy: 1, glad: 0.8, smile: 0.8, smiling: 0.8, laugh: 0.9, laughing: 0.9, laughter: 0.9,
    dance: 0.6, dancing: 0.6, sing: 0.5, singing: 0.5, fun: 0.8, celebrate: 0.9, party: 0.6, sunshine: 0.7,
    bright: 0.5, shine: 0.5, shining: 0.5, good: 0.4, great: 0.5, wonderful: 0.9, amazing: 0.8, alive: 0.7,
    free: 0.5, high: 0.4, cheer: 0.8, delight: 0.9, golden: 0.4, yay: 0.9, woo: 0.6, play: 0.4, sweet: 0.4,
    khush: 1, khushi: 1, 'ख़ुशी': 1, 'खुशी': 1, 'खुश': 1, hasna: 0.8, 'हँसी': 0.8, masti: 0.8, 'मस्ती': 0.8,
  },
  sadness: {
    sad: 1, sadness: 1, cry: 1, crying: 1, cried: 1, tears: 1, tear: 0.7, alone: 0.8, lonely: 0.9, loneliness: 0.9,
    broken: 0.9, break: 0.4, hurt: 0.8, pain: 0.7, sorrow: 1, grief: 1, empty: 0.7, gone: 0.6, goodbye: 0.7,
    lost: 0.6, blue: 0.4, rain: 0.4, cold: 0.4, dark: 0.3, silence: 0.4, sorry: 0.5, fade: 0.5, fading: 0.5,
    die: 0.6, dying: 0.7, dead: 0.6, miserable: 1, weep: 1, ache: 0.7, heavy: 0.5, grey: 0.4, gray: 0.4,
    dard: 1, 'दर्द': 1, aansu: 1, 'आँसू': 1, 'आंसू': 1, udaas: 1, 'उदास': 1, tanha: 0.9, 'तन्हा': 0.9, rona: 1, 'रोना': 1,
  },
  anger: {
    angry: 1, anger: 1, mad: 0.8, rage: 1, hate: 1, hatred: 1, furious: 1, fury: 1, scream: 0.8, screaming: 0.8,
    shout: 0.7, fight: 0.6, burn: 0.6, burning: 0.6, fire: 0.4, lies: 0.7, liar: 0.9, lie: 0.5, betray: 0.9,
    betrayed: 0.9, blame: 0.6, enough: 0.4, war: 0.6, destroy: 0.8, smash: 0.8, bitter: 0.6, sick: 0.4,
    damn: 0.6, kill: 0.7, revenge: 0.9, wrath: 1, tore: 0.5, torn: 0.4, cheat: 0.8, cheated: 0.8, fed: 0.3,
    gussa: 1, 'गुस्सा': 1, nafrat: 1, 'नफ़रत': 1, 'नफरत': 1, jhooth: 0.7, 'झूठ': 0.7,
  },
  love: {
    love: 1, loved: 1, loving: 1, lover: 0.9, heart: 0.6, kiss: 0.9, kisses: 0.9, darling: 0.8, baby: 0.5,
    babe: 0.5, honey: 0.5, together: 0.6, hold: 0.5, embrace: 0.8, adore: 1, beautiful: 0.6, sweetheart: 0.9,
    romance: 0.9, forever: 0.4, mine: 0.4, yours: 0.4, touch: 0.5, crush: 0.6, devotion: 0.9, cherish: 0.9,
    pyaar: 1, pyar: 1, 'प्यार': 1, ishq: 1, 'इश्क़': 1, 'इश्क': 1, mohabbat: 1, 'मोहब्बत': 1, dil: 0.6, 'दिल': 0.6,
    jaan: 0.7, 'जान': 0.7, sanam: 0.8, 'सनम': 0.8,
  },
  longing: {
    miss: 1, missing: 1, missed: 0.9, wish: 0.7, wishing: 0.7, remember: 0.7, memories: 0.8, memory: 0.8,
    yearn: 1, yearning: 1, long: 0.3, longing: 1, someday: 0.4, again: 0.4, back: 0.3, still: 0.55, keep: 0.3,
    waiting: 0.7, wait: 0.5, far: 0.5, distance: 0.7, away: 0.4, used: 0.3, once: 0.3, ghost: 0.5,
    dream: 0.4, dreaming: 0.5, return: 0.5, homesick: 1, nostalgia: 1, yesterday: 0.6, echo: 0.4,
    yaad: 1, 'याद': 1, intezaar: 1, intezar: 1, 'इंतज़ार': 1, 'इंतजार': 1, judaai: 1, 'जुदाई': 1, door: 0.2,
  },
  hope: {
    hope: 1, hopeful: 1, tomorrow: 0.7, believe: 0.8, faith: 0.8, rise: 0.7, rising: 0.7, light: 0.5,
    dawn: 0.8, morning: 0.6, sunrise: 0.8, new: 0.4, begin: 0.6, beginning: 0.6, start: 0.4, heal: 0.8,
    healing: 0.8, brave: 0.7, strong: 0.6, stronger: 0.7, try: 0.4, chance: 0.6, open: 0.4, promise: 0.6,
    better: 0.6, wings: 0.6, fly: 0.5, someday: 0.5, okay: 0.4, survive: 0.6, breaks: 0.2,
    umeed: 1, ummeed: 1, 'उम्मीद': 1, sapna: 0.7, 'सपना': 0.7, 'सपने': 0.7, roshni: 0.8, 'रोशनी': 0.8,
  },
  fear: {
    fear: 1, afraid: 1, scared: 1, scary: 0.8, terrified: 1, terror: 1, panic: 0.9, nervous: 0.7, anxious: 0.8,
    anxiety: 0.8, worry: 0.6, worried: 0.7, tremble: 0.8, trembling: 0.8, shaking: 0.6, shake: 0.4,
    nightmare: 0.9, haunt: 0.7, haunted: 0.8, monster: 0.6, danger: 0.7, run: 0.3, hide: 0.6, hiding: 0.6,
    lost: 0.4, alone: 0.3, dark: 0.5, darkness: 0.6, shadow: 0.5, shadows: 0.5, falling: 0.4, help: 0.5,
    darr: 1, dar: 0.6, 'डर': 1, khauf: 1, 'ख़ौफ़': 1, 'खौफ': 1,
  },
  calm: {
    calm: 1, peace: 1, peaceful: 1, quiet: 0.7, gentle: 0.7, slow: 0.6, softly: 0.6, soft: 0.6, breathe: 0.8,
    breathing: 0.7, still: 0.2, rest: 0.7, easy: 0.6, serene: 1, float: 0.6, floating: 0.6, drift: 0.6,
    drifting: 0.6, ocean: 0.5, waves: 0.5, breeze: 0.6, hum: 0.5, lullaby: 0.8, sleep: 0.5, home: 0.5,
    safe: 0.6, warm: 0.4, tranquil: 1, relax: 0.8, steady: 0.5, passed: 0.3, moon: 0.3, stars: 0.3,
    sukoon: 1, sukun: 1, 'सुकून': 1, shanti: 1, 'शांति': 1, aaram: 0.7, 'आराम': 0.7, dheere: 0.5, 'धीरे': 0.5,
  },
};

/** Emojis carry a lot of feeling. */
export const EMOJI_LEXICON: Record<string, [Emotion, number]> = {
  '😄': ['joy', 1], '😀': ['joy', 1], '😁': ['joy', 1], '😂': ['joy', 1], '🤣': ['joy', 1], '😊': ['joy', 0.8],
  '🥳': ['joy', 1], '🎉': ['joy', 0.9], '✨': ['joy', 0.5], '🕺': ['joy', 0.8], '💃': ['joy', 0.8], '☀️': ['joy', 0.6],
  '😢': ['sadness', 1], '😭': ['sadness', 1], '💔': ['sadness', 1], '😞': ['sadness', 0.8], '🥀': ['sadness', 0.8], '🌧️': ['sadness', 0.6],
  '😠': ['anger', 1], '😡': ['anger', 1], '🤬': ['anger', 1], '💢': ['anger', 0.8], '🔥': ['anger', 0.4],
  '❤️': ['love', 1], '❤': ['love', 1], '😍': ['love', 1], '🥰': ['love', 1], '😘': ['love', 1], '💕': ['love', 1], '💖': ['love', 1], '💘': ['love', 1],
  '🌙': ['longing', 0.7], '🥺': ['longing', 0.8], '💭': ['longing', 0.6],
  '🌅': ['hope', 1], '🌈': ['hope', 1], '🙏': ['hope', 0.7], '🌱': ['hope', 0.8], '🕊️': ['hope', 0.7],
  '😨': ['fear', 1], '😱': ['fear', 1], '😰': ['fear', 1], '👻': ['fear', 0.7],
  '🍃': ['calm', 0.8], '😌': ['calm', 1], '🌊': ['calm', 0.6], '🧘': ['calm', 1], '☁️': ['calm', 0.5],
};

export const NEGATORS = new Set([
  'not', 'no', 'never', 'nothing', 'nobody', 'none', 'nowhere', 'neither', 'nor', 'without', 'cannot', 'cant',
  "can't", "don't", 'dont', "won't", 'wont', "isn't", 'isnt', "ain't", 'aint', "wasn't", 'wasnt', "didn't",
  'didnt', "doesn't", 'doesnt', "couldn't", 'couldnt', "wouldn't", 'wouldnt', "shouldn't", "aren't", "weren't",
  'nahi', 'nahin', 'nai', 'mat', 'na', 'नहीं', 'मत', 'ना', 'न',
]);

/** Words that amplify the next emotional word. */
export const INTENSIFIERS: Record<string, number> = {
  so: 1.5, soo: 1.6, very: 1.5, really: 1.4, too: 1.4, totally: 1.5, completely: 1.6, truly: 1.4, deeply: 1.6,
  utterly: 1.6, extremely: 1.7, absolutely: 1.6, such: 1.4, forever: 1.4, always: 1.3, never: 1.5, ever: 1.2,
  much: 1.3, all: 1.15, endless: 1.4, crazy: 1.3, bahut: 1.5, 'बहुत': 1.5, itna: 1.4, 'इतना': 1.4, kitna: 1.3,
};

export const DOWNTONERS: Record<string, number> = {
  little: 0.6, slightly: 0.6, kinda: 0.7, kind: 0.85, somewhat: 0.7, bit: 0.7, barely: 0.5, almost: 0.8, maybe: 0.8,
};

/** What an emotion turns into when negated, e.g. "not happy" → sadness. */
export const NEGATION_FLIP: Record<Emotion, Emotion> = {
  joy: 'sadness',
  sadness: 'calm',
  anger: 'calm',
  love: 'sadness',
  longing: 'calm',
  hope: 'sadness',
  fear: 'hope',
  calm: 'fear',
};

export const THEME_KEYWORDS: Record<Theme, string[]> = {
  heartbreak: ['goodbye', 'gone', 'broken', 'heartbreak', 'heartbroken', 'leave', 'left', 'tears', 'cry', 'over', 'lies', 'cheat', 'alone', 'apart', 'without you', 'letter', 'letters', 'ex', 'walked away', 'judaai', 'bewafa', 'जुदाई', 'टूटा'],
  freedom: ['free', 'freedom', 'fly', 'flying', 'wings', 'road', 'escape', 'open', 'sky', 'wild', 'chains', 'break free', 'alive', 'horizon', 'run away', 'azaad', 'आज़ाद', 'आजाद'],
  nostalgia: ['remember', 'memory', 'memories', 'used to', 'back then', 'old', 'photograph', 'photo', 'yesterday', 'summer', 'childhood', 'those days', 'once', 'still keep', 'jacket', 'yaad', 'याद', 'purani'],
  love: ['love', 'heart', 'kiss', 'hold', 'darling', 'baby', 'together', 'forever', 'mine', 'yours', 'hand in mine', 'pyaar', 'pyar', 'ishq', 'प्यार', 'इश्क', 'dil', 'दिल'],
  struggle: ['fight', 'pain', 'fall', 'war', 'battle', 'survive', 'hard', 'storm', 'lost', 'scars', 'struggle', 'against', 'bleed', 'tired', 'falling', 'trembling', 'burning', 'dard', 'दर्द'],
  party: ['dance', 'dancing', 'party', 'tonight', 'club', 'music', 'drink', 'shots', 'lights', 'beat', 'loud', 'floor', 'celebrate', 'weekend', 'roof', 'masti', 'नाच', 'मस्ती'],
  hope: ['hope', 'tomorrow', 'light', 'dream', 'morning', 'sun', 'sunrise', 'new', 'rise', 'believe', 'someday', 'dawn', 'again', 'heal', 'umeed', 'उम्मीद', 'roshni'],
};
