import type { KeyboardEvent, ReactNode } from 'react';
import { useId, useState } from 'react';

const TREND_PADDING = 2;

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

function extent(values: readonly number[], floorAtZero: boolean): readonly [number, number] {
  const max = Math.max(...values, floorAtZero ? 0 : -Infinity);
  const min = floorAtZero ? 0 : Math.min(...values);
  return min === max ? [min, max + 1] : [min, max];
}

interface TrendLineProps {
  readonly points: readonly ChartPoint[];
  readonly label: string;
  readonly format: (value: number) => string;
  readonly tone?: 'accent' | 'running' | 'failed' | 'success' | undefined;
  readonly threshold?: number | null | undefined;
  readonly height?: number | undefined;
}

const TREND_WIDTH = 240;

export function TrendLine({ points, label, format, tone = 'accent', threshold = null, height = 44 }: TrendLineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const [min, max] = extent(threshold === null ? values : [...values, threshold], true);
  const x = (index: number) => (index / (points.length - 1)) * TREND_WIDTH;
  const y = (value: number) => TREND_PADDING + (1 - (value - min) / (max - min)) * (height - TREND_PADDING * 2);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const area = `${line} L${TREND_WIDTH} ${height} L0 ${height} Z`;
  const active = hover === null ? null : points[hover];
  const onMove = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (points.length - 1)));
  };
  return (
    <div className={`ds-trend-chart ds-trend-chart--${tone}`}>
      <svg
        viewBox={`0 0 ${TREND_WIDTH} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={`${label} : ${format(values.at(-1) ?? 0)}`}
        onPointerMove={(event) => onMove(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="ds-trend-chart__stop-top" />
            <stop offset="100%" className="ds-trend-chart__stop-bottom" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        {threshold === null ? null : (
          <line x1="0" x2={TREND_WIDTH} y1={y(threshold)} y2={y(threshold)} className="ds-trend-chart__threshold" vectorEffect="non-scaling-stroke" />
        )}
        <path d={line} className="ds-trend-chart__line" vectorEffect="non-scaling-stroke" />
        {hover === null ? null : (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} className="ds-trend-chart__cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {active === null || active === undefined ? null : (
        <span className="ds-chart-tip" style={{ left: `${(x(hover ?? 0) / TREND_WIDTH) * 100}%` }}>
          <span className="ds-chart-tip__label">{active.label}</span>
          <span className="ds-chart-tip__value num">{format(active.value)}</span>
        </span>
      )}
    </div>
  );
}

interface BarChartProps {
  readonly points: readonly ChartPoint[];
  readonly label: string;
  readonly format: (value: number) => string;
  readonly height?: number | undefined;
  readonly highlightLast?: boolean | undefined;
  readonly axisLabels?: readonly string[] | undefined;
  readonly reference?: { readonly value: number; readonly label: string } | undefined;
}

const BAR_GAP = 2;
const BAR_RADIUS = 4;
const BAR_CHART_WIDTH = 600;

function roundedTopBar(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(BAR_RADIUS, width / 2, height);
  return [
    `M${x} ${y + height}`,
    `L${x} ${y + radius}`,
    `Q${x} ${y} ${x + radius} ${y}`,
    `L${x + width - radius} ${y}`,
    `Q${x + width} ${y} ${x + width} ${y + radius}`,
    `L${x + width} ${y + height}`,
    'Z',
  ].join(' ');
}

export function BarChart({ points, label, format, height = 160, highlightLast = true, axisLabels, reference }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, reference?.value ?? 0) || 1;
  const slot = BAR_CHART_WIDTH / points.length;
  const barWidth = Math.max(1, slot - BAR_GAP);
  const active = hover === null ? undefined : points[hover];
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight') setHover((current) => Math.min(points.length - 1, (current ?? -1) + 1));
    if (event.key === 'ArrowLeft') setHover((current) => Math.max(0, (current ?? points.length) - 1));
  };
  return (
    <div className="ds-bar-chart">
      <svg
        viewBox={`0 0 ${BAR_CHART_WIDTH} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="0" x2={BAR_CHART_WIDTH} y1={height * ratio} y2={height * ratio} className="ds-chart-grid" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((point, index) => {
          const barHeight = Math.max(point.value > 0 ? 2 : 0, (point.value / max) * (height - 4));
          const x = index * slot + BAR_GAP / 2;
          const last = highlightLast && index === points.length - 1;
          return (
            <g key={point.label} onPointerEnter={() => setHover(index)}>
              <rect x={index * slot} y="0" width={slot} height={height} className="ds-bar-chart__hit" />
              <path
                d={roundedTopBar(x, height - barHeight, barWidth, barHeight)}
                className={`ds-bar-chart__bar${last ? ' is-current' : ''}${hover === index ? ' is-hover' : ''}`}
              />
            </g>
          );
        })}
        {reference === undefined ? null : (
          <line
            x1="0"
            x2={BAR_CHART_WIDTH}
            y1={height - (reference.value / max) * (height - 4)}
            y2={height - (reference.value / max) * (height - 4)}
            className="ds-bar-chart__reference"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {active === undefined || hover === null ? null : (
        <span className="ds-chart-tip" style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}>
          <span className="ds-chart-tip__label">{active.label}</span>
          <span className="ds-chart-tip__value num">{format(active.value)}</span>
        </span>
      )}
      {axisLabels === undefined ? null : (
        <div className="ds-bar-chart__axis" aria-hidden="true">
          {axisLabels.map((axisLabel, index) => (
            <span key={`${axisLabel}-${index}`}>{axisLabel}</span>
          ))}
        </div>
      )}
      {reference === undefined ? null : <span className="ds-bar-chart__reference-label">{reference.label}</span>}
    </div>
  );
}

export interface BarListItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: number;
  readonly display: string;
  readonly hint?: string | undefined;
}

interface BarListProps {
  readonly items: readonly BarListItem[];
  readonly label: string;
}

export function BarList({ items, label }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), 0) || 1;
  return (
    <ul className="ds-bar-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="ds-bar-list__item" title={item.hint}>
          <div className="ds-bar-list__row">
            <span className="ds-bar-list__label truncate">{item.label}</span>
            <span className="ds-bar-list__value num">{item.display}</span>
          </div>
          <span className="ds-bar-list__track" aria-hidden="true">
            <span className="ds-bar-list__fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

interface MeterProps {
  readonly value: number;
  readonly label: string;
  readonly valueText: string;
  readonly tone: 'success' | 'running' | 'failed' | 'accent' | 'waiting';
  readonly marker?: number | undefined;
  readonly size?: 'sm' | 'md' | undefined;
}

export function Meter({ value, label, valueText, tone, marker, size = 'md' }: MeterProps) {
  const bounded = Math.min(1, Math.max(0, value));
  return (
    <span
      className={`ds-meter ds-meter--${tone} ds-meter--${size}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(bounded * 100)}
      aria-valuetext={valueText}
    >
      <span className="ds-meter__fill" style={{ width: `${bounded * 100}%` }} />
      {marker === undefined ? null : <span className="ds-meter__marker" style={{ left: `${Math.min(1, Math.max(0, marker)) * 100}%` }} />}
    </span>
  );
}
