import { describe, expect, it } from 'vitest';
import { dayTicks, monotonePath, niceAxis, type Point } from './chartMath';

describe('niceAxis', () => {
  it('rounds to friendly steps that always cover the maximum', () => {
    expect(niceAxis(3000)).toMatchObject({ max: 3000, step: 1000 });
    expect(niceAxis(3420)).toMatchObject({ max: 4000, step: 1000 });
    expect(niceAxis(550).ticks).toEqual([0, 200, 400, 600]);
    expect(niceAxis(100).ticks).toEqual([0, 25, 50, 75, 100]);
    expect(niceAxis(12450).max).toBeGreaterThanOrEqual(12450);
  });

  it('copes with zero and junk', () => {
    expect(niceAxis(0).max).toBeGreaterThan(0);
    expect(niceAxis(Number.NaN).max).toBeGreaterThan(0);
  });

  it('never returns a max below the input', () => {
    for (const value of [1, 7, 99, 101, 999, 1234, 5000, 5001, 99999, 250000, 1e7]) {
      expect(niceAxis(value).max).toBeGreaterThanOrEqual(value);
    }
  });
});

describe('dayTicks', () => {
  it('always includes the first and last day without crowding the end', () => {
    expect(dayTicks(30, false)).toEqual([1, 5, 10, 15, 20, 25, 30]);
    expect(dayTicks(31, false)).toEqual([1, 5, 10, 15, 20, 25, 31]);
    expect(dayTicks(28, false)).toEqual([1, 5, 10, 15, 20, 25, 28]);
    expect(dayTicks(30, true)).toEqual([1, 10, 20, 30]);
  });
});

/** Samples every cubic segment of a path built by monotonePath. */
function sample(path: string): Point[] {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: Point[] = [{ x: numbers[0]!, y: numbers[1]! }];
  let cursor = { x: numbers[0]!, y: numbers[1]! };
  for (let i = 2; i < numbers.length; i += 6) {
    const [x1, y1, x2, y2, x, y] = numbers.slice(i, i + 6) as [number, number, number, number, number, number];
    for (let step = 1; step <= 20; step += 1) {
      const t = step / 20;
      const u = 1 - t;
      out.push({
        x: u ** 3 * cursor.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x,
        y: u ** 3 * cursor.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y,
      });
    }
    cursor = { x, y };
  }
  return out;
}

describe('monotonePath', () => {
  // Screen y grows downward, so a rising total means y decreasing.
  const totals = [0, 100, 100, 100, 500, 500, 900, 900, 900, 1400];
  const points = totals.map((total, i) => ({ x: i * 20, y: 200 - total / 10 }));

  it('never dips or overshoots between real values (the curve stays truthful)', () => {
    const curve = sample(monotonePath(points));
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.y).toBeLessThanOrEqual(curve[i - 1]!.y + 1e-6);
    }
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    for (const p of curve) {
      expect(p.y).toBeGreaterThanOrEqual(minY - 1e-6);
      expect(p.y).toBeLessThanOrEqual(maxY + 1e-6);
    }
  });

  it('is perfectly flat across days with no income', () => {
    const curve = sample(monotonePath(points));
    const flat = curve.filter((p) => p.x > 45 && p.x < 55);
    for (const p of flat) expect(Math.abs(p.y - points[1]!.y)).toBeLessThan(0.5);
  });

  it('handles 0, 1 and 2 points', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 1, y: 2 }])).toBe('M1.00 2.00');
    expect(monotonePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0.00 0.00 L10.00 5.00');
  });

  it('passes exactly through every data point', () => {
    const path = monotonePath(points);
    for (const p of points) expect(path).toContain(`${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  });
});
