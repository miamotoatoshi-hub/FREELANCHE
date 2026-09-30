/** Pure geometry helpers for the income chart. */

export interface Point {
  x: number;
  y: number;
}

/**
 * Round-number axis for a maximum value (in major units): about four intervals
 * on 1 / 2 / 2.5 / 5 × 10ⁿ steps, so labels read "0, 1K, 2K, 3K" rather than "0, 843, 1,686".
 */
export function niceAxis(max: number, intervals = 4): { max: number; step: number; ticks: number[] } {
  const safe = Number.isFinite(max) && max > 0 ? max : 100;
  const raw = safe / intervals;
  const base = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / base;
  const multiplier = [1, 2, 2.5, 5, 10].find((candidate) => fraction <= candidate + 1e-9) ?? 10;
  const step = multiplier * base;
  const top = Math.ceil(safe / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 1e6; value += step) ticks.push(Number(value.toFixed(10)));
  return { max: top, step, ticks };
}

/** X-axis day labels: the 1st, every 5th (10th when narrow), and the last day — without crowding the end. */
export function dayTicks(daysInMonth: number, narrow: boolean): number[] {
  const step = narrow ? 10 : 5;
  const ticks = [1];
  for (let day = step; day <= daysInMonth - 3; day += step) ticks.push(day);
  ticks.push(daysInMonth);
  return ticks;
}

const sign = (n: number) => (n < 0 ? -1 : 1);

/** Tangent at an interior point that never overshoots its neighbours (keeps a rising total from dipping). */
function interiorTangent(a: Point, b: Point, c: Point): number {
  const h0 = b.x - a.x;
  const h1 = c.x - b.x;
  const s0 = (b.y - a.y) / h0;
  const s1 = (c.y - b.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Tangent at an end point, given the tangent at its neighbour. */
function endTangent(end: Point, neighbour: Point, neighbourTangent: number): number {
  const h = end.x - neighbour.x;
  return h ? (3 * (end.y - neighbour.y)) / h / 2 - neighbourTangent / 2 : neighbourTangent;
}

const n2 = (value: number) => value.toFixed(2);

/**
 * A smooth SVG path through the points that stays monotone: between two
 * equal totals it is perfectly flat, and it never rises above or dips below
 * the real values. Points must be sorted by strictly increasing x.
 */
export function monotonePath(points: readonly Point[]): string {
  const count = points.length;
  if (count === 0) return '';
  const first = points[0]!;
  if (count === 1) return `M${n2(first.x)} ${n2(first.y)}`;
  if (count === 2) {
    const second = points[1]!;
    return `M${n2(first.x)} ${n2(first.y)} L${n2(second.x)} ${n2(second.y)}`;
  }

  const tangents = new Array<number>(count).fill(0);
  for (let i = 1; i < count - 1; i += 1) {
    tangents[i] = interiorTangent(points[i - 1]!, points[i]!, points[i + 1]!);
  }
  // The end tangents are derived from their neighbour's tangent.
  const head = points[0]!;
  const tail = points[count - 1]!;
  tangents[0] = endTangent(points[1]!, head, tangents[1]!);
  tangents[count - 1] = endTangent(tail, points[count - 2]!, tangents[count - 2]!);

  let path = `M${n2(head.x)} ${n2(head.y)}`;
  for (let i = 0; i < count - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = (b.x - a.x) / 3;
    path += ` C${n2(a.x + dx)} ${n2(a.y + dx * tangents[i]!)} ${n2(b.x - dx)} ${n2(b.y - dx * tangents[i + 1]!)} ${n2(b.x)} ${n2(b.y)}`;
  }
  return path;
}
