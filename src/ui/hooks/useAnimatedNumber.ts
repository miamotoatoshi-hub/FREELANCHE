import { useEffect, useRef, useState } from 'react';
import { STORAGE_SCALE } from '../../domain/money';
import { useReducedMotion } from './useReducedMotion';

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts from the previously shown value to `target`. Intermediate frames are
 * whole currency units so digits don't flicker with cents; the final frame is
 * always the exact target. Skipped entirely with reduced motion.
 */
export function useAnimatedNumber(target: number, duration = 300): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const frame = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (reduced || duration <= 0 || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const value =
        progress >= 1
          ? target
          : Math.round((from + (target - from) * easeOut(progress)) / STORAGE_SCALE) * STORAGE_SCALE;
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, reduced]);

  return shown;
}
