// SPDX-License-Identifier: EPL-2.0
import {
  toCss,
  type BarsViewSpec,
  type HistogramViewSpec,
  type Simulation,
} from '@metascape/engine';
import type { ReactElement } from 'react';
import { seriesColor } from './palette';

/** Short readable text for a number: integers as is, others to four significant digits. */
export function formatValue(value: number): string {
  if (Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(4)));
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Props of {@link BarsChart}. */
export interface BarsChartProps {
  readonly spec: BarsViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
}

const BAR_WIDTH = 420;
const BAR_LEFT = 130;
const BAR_RIGHT = 56;
const BAR_ROW = 26;
const BAR_AXIS = 22;

/** Horizontal bars showing the latest value of each series, with values as text. */
export function BarsChart({ spec, sim, frame }: BarsChartProps): ReactElement {
  const rows = spec.series.map((id, i) => ({
    id,
    label: sim.data.get(id).label,
    value: sim.data.latest(id),
    color: seriesColor(spec.colors, id, i),
  }));
  const finite = rows.map((r) => r.value).filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const span = high - low || 1;
  const plotWidth = BAR_WIDTH - BAR_LEFT - BAR_RIGHT;
  const x = (v: number): number => BAR_LEFT + ((v - low) / span) * plotWidth;
  const zero = x(0);
  const height = rows.length * BAR_ROW + BAR_AXIS + 4;

  return (
    <svg
      className="ms-chart ms-bars"
      viewBox={`0 0 ${BAR_WIDTH} ${height}`}
      role="img"
      aria-label={`${spec.title}: ${rows.map((r) => `${r.label} ${formatValue(r.value)}`).join(', ')}`}
      data-frame={frame}
    >
      {rows.map((row, i) => {
        const y = 2 + i * BAR_ROW;
        const value = Number.isFinite(row.value) ? row.value : 0;
        const left = Math.min(zero, x(value));
        const barWidth = Math.abs(x(value) - zero);
        return (
          <g key={row.id}>
            <text className="ms-svg-label" x={BAR_LEFT - 6} y={y + 16} textAnchor="end">
              {shorten(row.label, 20)}
              <title>{row.label}</title>
            </text>
            <rect
              x={left}
              y={y + 4}
              width={barWidth}
              height={BAR_ROW - 10}
              fill={row.color}
              rx={2}
            />
            <text className="ms-svg-value" x={Math.max(x(value), zero) + 4} y={y + 16}>
              {formatValue(row.value)}
            </text>
          </g>
        );
      })}
      <line className="ms-svg-axis" x1={zero} x2={zero} y1={0} y2={rows.length * BAR_ROW + 2} />
      <text className="ms-svg-tick" x={x(low)} y={height - 6} textAnchor="start">
        {formatValue(low)}
      </text>
      <text className="ms-svg-tick" x={x(high)} y={height - 6} textAnchor="end">
        {formatValue(high)}
      </text>
    </svg>
  );
}

/** Props of {@link HistogramChart}. */
export interface HistogramChartProps {
  readonly spec: HistogramViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
}

const HIST_WIDTH = 420;
const HIST_HEIGHT = 220;
const HIST_LEFT = 40;
const HIST_RIGHT = 8;
const HIST_TOP = 16;
const HIST_BOTTOM = 40;

/**
 * Bars of the latest bin counts of a recorded distribution. The engine does
 * not expose a distribution's value range to views, so bins are labelled by
 * number rather than by value.
 */
export function HistogramChart({ spec, sim, frame }: HistogramChartProps): ReactElement {
  const counts = sim.data.distributionCounts(spec.distribution);
  const bins = counts.length;
  let peak = 0;
  for (const c of counts) if (c > peak) peak = c;
  const plotWidth = HIST_WIDTH - HIST_LEFT - HIST_RIGHT;
  const plotHeight = HIST_HEIGHT - HIST_TOP - HIST_BOTTOM;
  const slot = plotWidth / Math.max(1, bins);
  const base = HIST_TOP + plotHeight;
  const color = toCss(spec.color ?? 0x3b7dd8);
  const showCounts = bins <= 16;

  return (
    <svg
      className="ms-chart ms-histogram"
      viewBox={`0 0 ${HIST_WIDTH} ${HIST_HEIGHT}`}
      role="img"
      aria-label={`${spec.title}: ${bins} bins, highest count ${peak}`}
      data-frame={frame}
    >
      <line className="ms-svg-axis" x1={HIST_LEFT} x2={HIST_LEFT} y1={HIST_TOP} y2={base} />
      <line
        className="ms-svg-axis"
        x1={HIST_LEFT}
        x2={HIST_WIDTH - HIST_RIGHT}
        y1={base}
        y2={base}
      />
      {Array.from(counts, (count, i) => {
        const h = peak === 0 ? 0 : (count / peak) * plotHeight;
        const x = HIST_LEFT + i * slot;
        return (
          <g key={i}>
            <rect x={x + 0.5} y={base - h} width={Math.max(1, slot - 1)} height={h} fill={color}>
              <title>{`Bin ${i + 1}: ${count}`}</title>
            </rect>
            {showCounts && count > 0 && (
              <text className="ms-svg-value" x={x + slot / 2} y={base - h - 3} textAnchor="middle">
                {count}
              </text>
            )}
          </g>
        );
      })}
      <text className="ms-svg-tick" x={HIST_LEFT - 4} y={base} textAnchor="end">
        0
      </text>
      <text className="ms-svg-tick" x={HIST_LEFT - 4} y={HIST_TOP + 8} textAnchor="end">
        {peak}
      </text>
      <text className="ms-svg-tick" x={HIST_LEFT} y={base + 14} textAnchor="start">
        1
      </text>
      <text className="ms-svg-tick" x={HIST_WIDTH - HIST_RIGHT} y={base + 14} textAnchor="end">
        {bins}
      </text>
      <text
        className="ms-svg-label"
        x={HIST_LEFT + plotWidth / 2}
        y={HIST_HEIGHT - 6}
        textAnchor="middle"
      >
        Bin
      </text>
      <text className="ms-svg-label" x={4} y={10}>
        Count
      </text>
    </svg>
  );
}
