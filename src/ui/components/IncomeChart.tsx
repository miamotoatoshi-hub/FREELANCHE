import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CumulativePoint } from '../../domain/calculations';
import { STORAGE_SCALE } from '../../domain/money';
import { useI18n } from '../../i18n/I18nProvider';
import { dayTicks, monotonePath, niceAxis } from './chartMath';

const HEIGHT = 208;
const MARGIN = { top: 14, right: 12, bottom: 28, left: 46 };

interface IncomeChartProps {
  /** Cumulative income per day (current month: up to today). */
  series: readonly CumulativePoint[];
  daysInMonth: number;
  /** Stored goal amount, 0 for none. Drawn as a quiet reference line. */
  goal: number;
}

/**
 * Cumulative income across the month as a smooth, truthful line (it never dips
 * or overshoots between real values). The goal is a dashed reference line that
 * shares the scale but never alters the data. Drag/hover — or use ← → — to read
 * any day.
 */
export function IncomeChart({ series, daysInMonth, goal }: IncomeChartProps) {
  const { t, fmt } = useI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    setWidth(Math.round(element.clientWidth) || 320);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width) || 320);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const total = series.at(-1)?.cumulative ?? 0;
    const axis = niceAxis(Math.max(total, goal) / STORAGE_SCALE);
    const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (day: number) => MARGIN.left + ((day - 1) / Math.max(daysInMonth - 1, 1)) * plotWidth;
    const y = (amount: number) => MARGIN.top + plotHeight - (amount / STORAGE_SCALE / axis.max) * plotHeight;
    const points = series.map((point) => ({ x: x(point.day), y: y(point.cumulative) }));
    const line = monotonePath(points);
    const baseline = MARGIN.top + plotHeight;
    const first = points[0];
    const last = points.at(-1);
    const area = first && last ? `${line} L${last.x.toFixed(2)} ${baseline} L${first.x.toFixed(2)} ${baseline} Z` : '';
    return { axis, plotWidth, plotHeight, x, y, points, line, area, baseline };
  }, [series, goal, width, daysInMonth]);

  const last = series.length - 1;
  const shownIndex = active !== null ? Math.min(active, last) : last;
  const shown = shownIndex >= 0 ? series[shownIndex] : undefined;
  const hasIncome = (series.at(-1)?.cumulative ?? 0) > 0;
  const readoutText = shown ? `${fmt.dayMonthShort(shown.date)} · ${fmt.money(shown.cumulative)}` : '';
  const valueText = shown ? `${fmt.fullDate(shown.date)}: ${fmt.money(shown.cumulative)}` : '';

  const indexFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - MARGIN.left) / Math.max(geometry.plotWidth, 1);
    const day = Math.round(ratio * (daysInMonth - 1)) + 1;
    return Math.min(Math.max(day, 1), series.length) - 1;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.min(Math.max(to, 0), last));
    };
    if (event.key === 'ArrowLeft') move(shownIndex - 1);
    else if (event.key === 'ArrowRight') move(shownIndex + 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(last);
    else if (event.key === 'Escape') setActive(null);
  };

  if (series.length === 0) return null;

  const goalY = goal > 0 ? geometry.y(goal) : null;
  const narrow = width < 280;
  const summary = hasIncome && shown ? t('home.chart.summary', { amount: fmt.money(series[last]!.cumulative), date: fmt.fullDate(series[last]!.date) }) : t('home.chart.summaryEmpty');

  return (
    <figure className="chart">
      <div className="chart__head">
        <figcaption className="chart__title">{t('home.chart.title')}</figcaption>
        <span className="chart__readout" aria-hidden="true">
          {readoutText}
        </span>
      </div>
      <div className="chart__frame" ref={frameRef}>
        <svg className="chart__svg" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--chart-line)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--chart-line)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry.axis.ticks.map((tick) => {
            const yy = geometry.y(tick * STORAGE_SCALE);
            return (
              <g key={tick}>
                <line className="chart__grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={yy} y2={yy} />
                <text className="chart__tick" x={MARGIN.left - 8} y={yy} textAnchor="end" dominantBaseline="middle">
                  {fmt.compact(tick * STORAGE_SCALE)}
                </text>
              </g>
            );
          })}

          {dayTicks(daysInMonth, narrow).map((day) => (
            <text key={day} className="chart__tick" x={geometry.x(day)} y={HEIGHT - 8} textAnchor="middle">
              {day}
            </text>
          ))}

          {goalY !== null && (
            <g>
              <line className="chart__goal" x1={MARGIN.left} x2={width - MARGIN.right} y1={goalY} y2={goalY} />
              <text className="chart__goal-label" x={width - MARGIN.right} y={goalY - 6} textAnchor="end">
                {t('home.chart.goal')}
              </text>
            </g>
          )}

          {geometry.area && hasIncome && <path className="chart__area" d={geometry.area} fill="url(#chart-fill)" />}
          <path className="chart__line" d={geometry.line} fill="none" />

          {shown && geometry.points[shownIndex] && (
            <g>
              {active !== null && (
                <line
                  className="chart__cursor"
                  x1={geometry.points[shownIndex]!.x}
                  x2={geometry.points[shownIndex]!.x}
                  y1={MARGIN.top}
                  y2={geometry.baseline}
                />
              )}
              <circle className="chart__dot" cx={geometry.points[shownIndex]!.x} cy={geometry.points[shownIndex]!.y} r={5} />
            </g>
          )}
        </svg>

        {/* Interactive layer: pointer scrubbing and a keyboard-operable slider. */}
        <div
          className="chart__touch"
          role="slider"
          tabIndex={0}
          aria-label={t('home.chart.title')}
          aria-valuemin={1}
          aria-valuemax={series.length}
          aria-valuenow={shownIndex + 1}
          aria-valuetext={valueText}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerDown={(event) => setActive(indexFromPointer(event))}
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse' || event.buttons) setActive(indexFromPointer(event));
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setActive(null);
          }}
        />
      </div>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}
