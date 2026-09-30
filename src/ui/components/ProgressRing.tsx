import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const SIZE = 260;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ProgressRingProps {
  /** 0–1, already capped for drawing. */
  progress: number;
  /** Goal met or exceeded: the ring turns success-green and gives a single soft pulse. */
  complete: boolean;
  label: string;
  children: ReactNode;
}

/**
 * The goal ring. The arc animates with a CSS transition; the centre holds the
 * income figure. Celebration is one restrained pulse, and only when the goal is
 * crossed *while you watch* — never on load — and never with reduced motion.
 */
export function ProgressRing({ progress, complete, label, children }: ProgressRingProps) {
  const reduced = useReducedMotion();
  const [previousComplete, setPreviousComplete] = useState(complete);
  const [pulse, setPulse] = useState(false);

  // Crossing the goal line while mounted (never on first render) starts one pulse.
  if (complete !== previousComplete) {
    setPreviousComplete(complete);
    if (complete && !reduced) setPulse(true);
  }

  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(false), 1100);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <div className={`ring${complete ? ' ring--complete' : ''}${pulse ? ' ring--pulse' : ''}`}>
      <svg
        className="ring__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <circle className="ring__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} fill="none" />
        <circle
          className="ring__arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          // A zero-length round cap still paints a dot, so hide the arc entirely at 0.
          opacity={clamped === 0 ? 0 : 1}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  );
}
