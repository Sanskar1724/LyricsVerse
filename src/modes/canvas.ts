/** Shared canvas helpers for modes. */

export const MAX_DPR = 1.5;

export interface CanvasSizer {
  /** Re-apply the size, e.g. after changing the quality. */
  resize: () => void;
  stop: () => void;
}

/**
 * Keep a canvas's backing store sized to its element. `quality` (0–1) scales the resolution down,
 * which modes use to stay smooth on slow machines. The CSS size never changes.
 */
export function autoSizeCanvas(
  canvas: HTMLCanvasElement,
  onResize: (w: number, h: number, scale: number) => void,
  quality: () => number = () => 1,
): CanvasSizer {
  const resize = () => {
    const scale = Math.min(MAX_DPR, window.devicePixelRatio || 1) * quality();
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    onResize(w, h, scale);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  return { resize, stop: () => ro.disconnect() };
}

/**
 * Watches frame times and lowers rendering quality when frames run long (>20ms average),
 * raising it again when there's headroom. Returns the current quality, 0.4–1.
 */
export class AdaptiveQuality {
  quality = 1;
  private avg = 16;
  private framesSinceChange = 0;

  /** Feed one frame's duration in ms. Returns true if the quality changed. */
  update(frameMs: number): boolean {
    this.avg = this.avg * 0.92 + Math.min(frameMs, 100) * 0.08;
    this.framesSinceChange++;
    if (this.framesSinceChange < 45) return false;
    if (this.avg > 20 && this.quality > 0.4) {
      this.quality = Math.max(0.4, this.quality - 0.2);
      this.framesSinceChange = 0;
      return true;
    }
    if (this.avg < 13 && this.quality < 1 && this.framesSinceChange > 240) {
      this.quality = Math.min(1, this.quality + 0.2);
      this.framesSinceChange = 0;
      return true;
    }
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function rgbStr(c: [number, number, number], alpha = 1): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
}

/** A soft round sprite (radial gradient) to stamp with drawImage, much cheaper than a gradient fill per frame. */
export function makeGlowSprite(rgb: [number, number, number], size = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgbStr(rgb, 1));
  grad.addColorStop(0.5, rgbStr(rgb, 0.45));
  grad.addColorStop(1, rgbStr(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Font-size class by line length so long lines still fit. */
export function sizeClass(text: string): string {
  const n = [...text].length;
  if (n <= 22) return 'size-xl';
  if (n <= 45) return 'size-lg';
  if (n <= 90) return 'size-md';
  return 'size-sm';
}
