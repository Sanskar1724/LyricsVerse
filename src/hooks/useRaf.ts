import { useEffect, useRef } from 'react';

/**
 * Run `callback` on every animation frame while `active` is true.
 * The latest callback is always used, and the loop is cancelled on unmount.
 */
export function useRaf(callback: (now: number, dt: number) => void, active = true): void {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    if (!active) return;
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      cb.current(now, dt);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
