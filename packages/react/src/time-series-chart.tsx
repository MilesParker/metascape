// SPDX-License-Identifier: EPL-2.0
import type { Simulation, TimeSeriesViewSpec } from '@metascape/engine';
import { useEffect, useRef, type ReactElement } from 'react';
import type uPlot from 'uplot';
import { decimate } from './decimate';
import { seriesColor } from './palette';
import { formatValue } from './svg-charts';

const HEIGHT_RATIO = 0.5;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 320;

/** Props of {@link TimeSeriesChart}. */
export interface TimeSeriesChartProps {
  readonly spec: TimeSeriesViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to update the plot. */
  readonly frame: number;
}

/** Reads the data fresh: the recorder's buffers are replaced when they grow. */
function readData(sim: Simulation, ids: readonly string[]): uPlot.AlignedData {
  const ticks = sim.data.ticks;
  const { x, ys } = decimate(
    ticks,
    ids.map((id) => sim.data.values(id)),
  );
  return [x, ...ys];
}

function plotHeight(width: number): number {
  return Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, width * HEIGHT_RATIO)));
}

/** Writes each series' latest value into the legend, for when nothing is hovered. */
export function showLatest(u: uPlot): void {
  const count = u.data[0]?.length ?? 0;
  if (count === 0) return;
  const rows = u.root.querySelectorAll('.u-series');
  for (let i = 1; i < u.series.length; i++) {
    const value = u.data[i]?.[count - 1];
    const cell = rows[i]?.querySelector('.u-value');
    if (cell && value != null && Number.isFinite(value)) cell.textContent = formatValue(value);
  }
}

function themeColor(element: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

/**
 * Line chart of recorded series against tick, drawn with uPlot. The plot is
 * created once per simulation and fed with `setData` on every frame; long
 * runs are decimated to about 2,000 points per series. Where uPlot cannot run
 * (no canvas or `matchMedia`, as in jsdom) the container stays empty.
 */
export function TimeSeriesChart({ spec, sim, frame }: TimeSeriesChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const labels = spec.series.map((id) => sim.data.get(id).label);
    const text = themeColor(container, '--ms-text-muted', '#667');
    const grid = themeColor(container, '--ms-border', '#ddd');
    const width = Math.max(200, Math.floor(container.clientWidth) || 400);
    const options: uPlot.Options = {
      width,
      height: plotHeight(width),
      scales: {
        x: { time: false },
        y: {
          range: (_u, min, max) => {
            const known = Number.isFinite(min) && Number.isFinite(max);
            const low = spec.yMin ?? (known ? min : 0);
            let high = spec.yMax ?? (known ? max : 1);
            if (high <= low) high = low + 1;
            return [low, high];
          },
        },
      },
      axes: [
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
      ],
      series: [
        { label: 'Tick' },
        ...spec.series.map((id, i): uPlot.Series => ({
          label: labels[i] ?? id,
          stroke: seriesColor(spec.colors, id, i),
          width: 1.5,
        })),
      ],
      legend: { show: true },
      hooks: {
        // With no cursor over the plot uPlot shows `--`; show the latest values instead.
        setCursor: [
          (u) => {
            if (u.cursor.idx != null) return;
            showLatest(u);
          },
        ],
        setData: [showLatest],
      },
    };

    let cancelled = false;
    let plot: uPlot | null = null;
    let observer: ResizeObserver | undefined;
    // uPlot touches `matchMedia` when it is imported, so load it on demand and
    // leave the container empty where that, or drawing, is impossible.
    void import('uplot')
      .then((module) => {
        if (cancelled) return;
        const Plot = module.default;
        plot = new Plot(options, readData(sim, spec.series), container);
        plotRef.current = plot;
        container.removeAttribute('data-unavailable');
        if (typeof ResizeObserver !== 'undefined') {
          const created = plot;
          observer = new ResizeObserver((entries) => {
            const w = Math.floor(entries[0]?.contentRect.width ?? 0);
            if (w >= 100) created.setSize({ width: w, height: plotHeight(w) });
          });
          observer.observe(container);
        }
      })
      .catch(() => {
        if (cancelled) return;
        plot = null;
        plotRef.current = null;
        container.setAttribute('data-unavailable', 'true');
        container.replaceChildren();
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      plot?.destroy();
      plotRef.current = null;
    };
  }, [spec, sim]);

  useEffect(() => {
    plotRef.current?.setData(readData(sim, spec.series));
  }, [spec, sim, frame]);

  return (
    <div
      className="ms-chart ms-timeseries"
      ref={containerRef}
      role="img"
      aria-label={`${spec.title}: ${spec.series.join(', ')} over time`}
    />
  );
}
