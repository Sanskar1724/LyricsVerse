import { expect, test as base, type Page } from '@playwright/test';

/** Every test fails if the browser logs an error or warning, or throws. */
export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${msg.type()}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
      await use(problems);
      expect(problems, 'browser console should be clean').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('sample-button').click();
  await expect(page.getByTestId('player-screen')).toBeVisible();
  await expect(page.getByTestId('song-title')).toHaveText('Paper Lanterns');
}

export async function startShow(page: Page) {
  await page.getByTestId('start-overlay').click();
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-playing', 'true');
}

/** True when Chromium is drawing on the CPU (SwiftShader) rather than a real GPU. */
export async function isSoftwareRendering(page: Page): Promise<boolean> {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  return /swiftshader|llvmpipe|software|unknown/i.test(renderer);
}

/** Frames rendered in one second. */
export async function measureFps(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const step = () => {
          frames++;
          if (performance.now() - t0 < 1000) requestAnimationFrame(step);
          else resolve(frames);
        };
        requestAnimationFrame(step);
      }),
  );
}

/**
 * A stereo WAV "song": centred bass plus a guitar panned left all the way through, and a centred
 * harmonic "voice" only during the `sung` intervals (seconds). Used to test auto-sync.
 */
export function makeVocalWav(seconds: number, sung: [number, number][], sampleRate = 22050): Buffer {
  const frames = Math.floor(seconds * sampleRate);
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const bass = 0.3 * Math.sin(2 * Math.PI * 70 * t);
    const guitar = 0.12 * Math.sin(2 * Math.PI * 523 * t);
    let vox = 0;
    if (sung.some(([a, b]) => t >= a && t < b)) {
      const f0 = 220 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t));
      for (let h = 1; h <= 6; h++) vox += Math.sin(2 * Math.PI * f0 * h * t) / h;
      vox *= 0.12 * (0.65 + 0.35 * Math.sin(2 * Math.PI * 4 * t));
    }
    const l = Math.max(-1, Math.min(1, bass + vox + guitar));
    const r = Math.max(-1, Math.min(1, bass + vox));
    buf.writeInt16LE(Math.round(l * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32000), 46 + i * 4);
  }
  return buf;
}

/** A small valid WAV file: mono 16-bit, with a pulsing tone so beat detection has something to find. */
export function makeWav(seconds: number, sampleRate = 22050): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const beat = Math.exp(-((t * 2) % 1) * 6); // 120 bpm thump
    const v = Math.sin(2 * Math.PI * 60 * t) * beat * 0.7 + Math.sin(2 * Math.PI * 440 * t) * 0.15;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 2);
  }
  return buf;
}
