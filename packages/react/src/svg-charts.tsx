// SPDX-License-Identifier: EPL-2.0
import {
  toCss,
  type BarsViewSpec,
  type HistogramViewSpec,
  type Simulation,
} from '@metascape/engine';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { seriesLabel } from './labels';
import { DEFAULT_PALETTE } from './palette';
import { readableOn, themeColor } from './theme';

/** Short readable text for a number: integers as is, others to four significant digits. */
export function formatValue(value: number): string {
  if (Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(4)));
}

/**
 * The size of the box a chart is drawn in, so it can draw at that size and
 * its text stays the size of other charts' text. Until measured (or where it
 * cannot be, as in jsdom), the fallback.
 */
function useBox(fallback: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      const height = Math.round(entry?.contentRect.height ?? 0);
      if (width > 80) setBox({ width, height: height > 80 ? height : fallback.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
    // The fallback only matters until the first measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, box };
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

/** Drawn this wide until the box it sits in has been measured. */
const BAR_WIDTH = 420;
const BAR_LEFT = 150;
const BAR_RIGHT = 56;
const BAR_ROW = 26;
const BAR_AXIS = 22;

/** Horizontal bars showing the latest value of each series, with values as text. */
export function BarsChart({ spec, sim, frame }: BarsChartProps): ReactElement {
  const { ref: boxRef, box } = useBox({ width: BAR_WIDTH, height: 0 });
  const chartWidth = box.width;
  const root = typeof document === 'undefined' ? undefined : document.documentElement;
  const surface = root ? themeColor(root, '--ms-surface', '#fff') : '#fff';
  const text = root ? themeColor(root, '--ms-text', '#222') : '#222';
  const rows = spec.series.map((id, i) => ({
    id,
    label: seriesLabel(sim, id, spec),
    value: sim.data.latest(id),
    color: readableOn(
      spec.colors?.[id] ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]!,
      surface,
      text,
    ),
  }));
  const finite = rows.map((r) => r.value).filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const span = high - low || 1;
  const left = Math.min(BAR_LEFT, Math.round(chartWidth * 0.36));
  const plotWidth = chartWidth - left - BAR_RIGHT;
  const x = (v: number): number => left + ((v - low) / span) * plotWidth;
  const zero = x(0);
  const height = rows.length * BAR_ROW + BAR_AXIS + 4;

  return (
    <div ref={boxRef} className="ms-bars-box">
      <svg
        className="ms-chart ms-bars"
        viewBox={`0 0 ${chartWidth} ${height}`}
        width={chartWidth}
        height={height}
        role="img"
        aria-label={`${spec.title}: ${rows.map((r) => `${r.label} ${formatValue(r.value)}`).join(', ')}`}
        data-frame={frame}
      >
        {rows.map((row, i) => {
          const y = 2 + i * BAR_ROW;
          const value = Number.isFinite(row.value) ? row.value : 0;
          const start = Math.min(zero, x(value));
          const barWidth = Math.abs(x(value) - zero);
          return (
            <g key={row.id}>
              <text className="ms-svg-label" x={left - 6} y={y + 16} textAnchor="end">
                {shorten(row.label, Math.max(6, Math.floor(left / 7)))}
                <title>{row.label}</title>
              </text>
              <rect
                x={start}
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
    </div>
  );
}

/** Props of {@link HistogramChart}. */
export interface HistogramChartProps {
  readonly spec: HistogramViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
}

/** Drawn at this size until the box it sits in has been measured. */
const HIST_WIDTH = 420;
const HIST_HEIGHT = 220;
const HIST_LEFT = 40;
const HIST_RIGHT = 8;
const HIST_TOP = 16;
const HIST_BOTTOM = 40;

/** Edge indexes from 0 to `bins`: every edge for up to 8 bins, else about `count` evenly spaced ones. */
export function edgeTickIndexes(bins: number, count = 5): number[] {
  const steps = Math.max(1, bins <= 8 ? bins : count - 1);
  const indexes: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const index = Math.round((i / steps) * bins);
    if (indexes[indexes.length - 1] !== index) indexes.push(index);
  }
  return indexes;
}

/**
 * Bars of the latest bin counts of a recorded distribution, with the x axis
 * labelled by value (bin edges from the distribution's range).
 */
export function HistogramChart({ spec, sim, frame }: HistogramChartProps): ReactElement {
  const { ref: boxRef, box } = useBox({ width: HIST_WIDTH, height: HIST_HEIGHT });
  const { width: chartWidth, height: chartHeight } = box;
  const counts = sim.data.distributionCounts(spec.distribution);
  const info = sim.data.distributionInfo(spec.distribution);
  const bins = counts.length;
  const width = (info.max - info.min) / Math.max(1, bins);
  const edge = (i: number): number => info.min + i * width;
  let peak = 0;
  for (const c of counts) if (c > peak) peak = c;
  const plotWidth = chartWidth - HIST_LEFT - HIST_RIGHT;
  const plotHeight = chartHeight - HIST_TOP - HIST_BOTTOM;
  const slot = plotWidth / Math.max(1, bins);
  const base = HIST_TOP + plotHeight;
  const color = toCss(spec.color ?? 0x3b7dd8);
  const showCounts = bins <= 16;
  const ticks = edgeTickIndexes(bins);

  return (
    <div ref={boxRef} className="ms-histogram-box">
      <svg
        className="ms-chart ms-histogram"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        width={chartWidth}
        height={chartHeight}
        role="img"
        aria-label={`${spec.title}: ${bins} bins from ${formatValue(info.min)} to ${formatValue(info.max)}, highest count ${peak}`}
        data-frame={frame}
      >
        <line className="ms-svg-axis" x1={HIST_LEFT} x2={HIST_LEFT} y1={HIST_TOP} y2={base} />
        <line
          className="ms-svg-axis"
          x1={HIST_LEFT}
          x2={chartWidth - HIST_RIGHT}
          y1={base}
          y2={base}
        />
        {Array.from(counts, (count, i) => {
          const h = peak === 0 ? 0 : (count / peak) * plotHeight;
          const x = HIST_LEFT + i * slot;
          return (
            <g key={i}>
              <rect x={x + 0.5} y={base - h} width={Math.max(1, slot - 1)} height={h} fill={color}>
                <title>{`${formatValue(edge(i))} to ${formatValue(edge(i + 1))}: ${count}`}</title>
              </rect>
              {showCounts && count > 0 && (
                <text
                  className="ms-svg-value"
                  x={x + slot / 2}
                  y={base - h - 3}
                  textAnchor="middle"
                >
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
        {ticks.map((index, k) => (
          <text
            key={index}
            className="ms-svg-tick"
            x={HIST_LEFT + index * slot}
            y={base + 14}
            textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}
          >
            {formatValue(edge(index))}
          </text>
        ))}
        <text className="ms-svg-label" x={4} y={10}>
          Count
        </text>
      </svg>
    </div>
  );
}
