// SPDX-License-Identifier: EPL-2.0
import { timeAt, type Simulation, type TimeSeriesViewSpec } from '@metascape/engine';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type uPlot from 'uplot';
import { decimate } from './decimate';
import { formatNumber, humanize, seriesLabel, timeUnit } from './labels';
import { DEFAULT_PALETTE } from './palette';
import { readableOn, themeColor, useThemeVersion } from './theme';

const HEIGHT_RATIO = 0.5;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 320;

/** Recorded values of an earlier run, drawn faintly behind the current one. */
export interface GhostRun {
  readonly ticks: Float64Array;
  /** Values by series id; series the earlier run did not record are skipped. */
  readonly values: Readonly<Record<string, Float64Array>>;
  /** Shown in the chart's legend, such as "previous run". */
  readonly label?: string;
}

/** Copies what a simulation has recorded so far, to show later as a {@link GhostRun}. */
export function ghostOf(sim: Simulation, label = 'Previous run'): GhostRun {
  const values: Record<string, Float64Array> = {};
  for (const series of sim.data.series) values[series.id] = sim.data.values(series.id).slice();
  return { ticks: sim.data.ticks.slice(), values, label };
}

/** A tick to mark on the time axis, such as when a parameter was changed. */
export interface TimeMark {
  readonly tick: number;
  readonly label: string;
}

/** Props of {@link TimeSeriesChart}. */
export interface TimeSeriesChartProps {
  readonly spec: TimeSeriesViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to update the plot. */
  readonly frame: number;
  /** Take the height of the container instead of a height from the width. */
  readonly fill?: boolean | undefined;
  /** Charts with the same key share their cursor. */
  readonly syncKey?: string | undefined;
  readonly ghost?: GhostRun | undefined;
  readonly marks?: readonly TimeMark[] | undefined;
  /** Puts the cursor at this tick, as when scrubbing a timeline; undefined lets the pointer lead. */
  readonly cursorTick?: number | undefined;
  /** Called with the tick under the pointer, and undefined when it leaves. */
  readonly onCursorTick?: ((tick: number | undefined) => void) | undefined;
}

/** Reads the data fresh: the recorder's buffers are replaced when they grow. */
function readData(sim: Simulation, ids: readonly string[]): uPlot.AlignedData {
  const { x, ys } = decimate(
    sim.data.ticks,
    ids.map((id) => sim.data.values(id)),
  );
  return [x, ...ys];
}

function plotHeight(width: number): number {
  return Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, width * HEIGHT_RATIO)));
}

/** The colour of each series: the spec's, else the palette's, made visible on the background. */
export function seriesColors(
  spec: Pick<TimeSeriesViewSpec, 'series' | 'colors'>,
  background: string,
  text: string,
): string[] {
  return spec.series.map((id, i) =>
    readableOn(spec.colors?.[id] ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]!, background, text),
  );
}

/** Least and greatest finite value of the ghost's series, if any. */
function ghostExtent(ghost: GhostRun | undefined, ids: readonly string[]): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const id of ids) {
    const values = ghost?.values[id];
    if (!values) continue;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < low) low = v;
      if (v > high) high = v;
    }
  }
  return [low, high];
}

/**
 * Line chart of recorded series against time, drawn with uPlot: themed from
 * the page's CSS variables, with readable series names, the x axis in the
 * model's own unit of time, a legend that shows values under the cursor (the
 * latest values otherwise), a cursor shared with other charts of the same
 * `syncKey`, an earlier run drawn faintly behind, and marks at chosen ticks.
 * Drag across it to zoom in; double-click to zoom out. Long runs are decimated
 * to about 2,000 points per series. Where uPlot cannot run (no canvas or
 * `matchMedia`, as in jsdom) the plot area stays empty and the legend remains.
 */
export function TimeSeriesChart({
  spec,
  sim,
  frame,
  fill = false,
  syncKey,
  ghost,
  marks,
  cursorTick,
  onCursorTick,
}: TimeSeriesChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const zoomedRef = useRef(false);
  const marksRef = useRef(marks);
  const onCursorRef = useRef(onCursorTick);
  const [hovered, setHovered] = useState<{ tick: number; values: (number | null)[] } | null>(null);
  const root = typeof document === 'undefined' ? undefined : document.documentElement;
  const colors = seriesColors(
    spec,
    root ? themeColor(root, '--ms-surface', '#fff') : '#fff',
    root ? themeColor(root, '--ms-text', '#222') : '#222',
  );
  const [unavailable, setUnavailable] = useState(false);
  const theme = useThemeVersion();
  const labels = spec.series.map((id) => seriesLabel(sim, id, spec));
  const unit = timeUnit(sim);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const text = themeColor(container, '--ms-text-muted', '#667');
    const strong = themeColor(container, '--ms-text', '#222');
    const grid = themeColor(container, '--ms-grid', themeColor(container, '--ms-border', '#ddd'));
    const surface = themeColor(container, '--ms-surface', '#fff');
    const accent = themeColor(container, '--ms-accent', '#2f6fd0');
    const font = `11px ${themeColor(container, '--ms-font-mono', 'ui-monospace, monospace')}`;
    const colors = seriesColors(spec, surface, strong);
    const [ghostLow, ghostHigh] = ghostExtent(ghost, spec.series);
    const measure = (): { width: number; height: number } => {
      const width = Math.max(160, Math.floor(container.clientWidth) || 400);
      const height = fill
        ? Math.max(80, Math.floor(container.clientHeight) || 160)
        : plotHeight(width);
      return { width, height };
    };
    const axis = (label?: string): uPlot.Axis => ({
      stroke: text,
      font,
      labelFont: font,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1, size: 4 },
      ...(label !== undefined && { label, labelSize: 16, labelGap: 0 }),
    });
    const options: uPlot.Options = {
      ...measure(),
      padding: [8, 10, 0, 0],
      scales: {
        x: { time: false },
        y: {
          range: (_u, min, max) => {
            const lowSeen = Math.min(min, ghostLow);
            const highSeen = Math.max(max, ghostHigh);
            const known = Number.isFinite(lowSeen) && Number.isFinite(highSeen);
            const low = spec.yMin ?? (known ? Math.min(0, lowSeen) : 0);
            let high = spec.yMax ?? (known ? highSeen : 1);
            if (high <= low) high = low + 1;
            if (spec.yMax === undefined) high += (high - low) * 0.05;
            return [low, high];
          },
        },
      },
      axes: [
        {
          ...axis(sim.model.time ? humanize(unit.singular) : undefined),
          values: (_u, ticks) => ticks.map((t) => formatNumber(timeAt(sim, t))),
        },
        {
          ...axis(spec.yLabel),
          size: (u, values) => {
            const longest = Math.max(1, ...(values ?? []).map((v) => String(v).length));
            return Math.min(72, 14 + longest * 7) + (spec.yLabel ? 16 : 0);
          },
          values: (_u, ticks) => ticks.map((t) => formatNumber(t)),
        },
      ],
      series: [
        { label: humanize(unit.singular) },
        ...spec.series.map((id, i): uPlot.Series => ({
          label: labels[i] ?? id,
          stroke: colors[i] ?? strong,
          width: 1.75,
          points: { show: false },
        })),
      ],
      legend: { show: false },
      cursor: {
        ...(syncKey !== undefined && { sync: { key: syncKey, setSeries: false } }),
        points: { size: 6, stroke: surface, width: 1.5 },
        drag: { x: true, y: false, setScale: true },
      },
      hooks: {
        setCursor: [
          (u) => {
            const index = u.cursor.idx;
            const tick = index === null || index === undefined ? undefined : u.data[0]?.[index];
            setHovered(
              tick === undefined || index === null || index === undefined
                ? null
                : { tick, values: u.data.slice(1).map((ys) => ys[index] ?? null) },
            );
            onCursorRef.current?.(tick);
          },
        ],
        setSelect: [
          (u) => {
            if (u.select.width > 0) zoomedRef.current = true;
          },
        ],
        draw: [
          (u) => {
            const context = u.ctx;
            const dpr = devicePixelRatio || 1;
            const { left, top, width, height } = u.bbox;
            context.save();
            context.beginPath();
            context.rect(left, top, width, height);
            context.clip();
            // The earlier run, faint and dashed, behind nothing but the grid.
            if (ghost) {
              context.lineWidth = 1.5 * dpr;
              context.setLineDash([4 * dpr, 3 * dpr]);
              context.globalAlpha = 0.45;
              spec.series.forEach((id, i) => {
                const values = ghost.values[id];
                if (!values) return;
                const { x, ys } = decimate(ghost.ticks, [values]);
                const y = ys[0]!;
                context.strokeStyle = colors[i] ?? strong;
                context.beginPath();
                let open = false;
                for (let k = 0; k < x.length; k++) {
                  const v = y[k];
                  if (v === undefined || v === null || !Number.isFinite(v)) {
                    open = false;
                    continue;
                  }
                  const px = u.valToPos(x[k]!, 'x', true);
                  const py = u.valToPos(v, 'y', true);
                  if (open) context.lineTo(px, py);
                  else context.moveTo(px, py);
                  open = true;
                }
                context.stroke();
              });
              context.setLineDash([]);
              context.globalAlpha = 1;
            }
            // Interventions, as thin vertical rules labelled at the top, as far as the next one allows.
            const shown = (marksRef.current ?? [])
              .map((mark) => ({ mark, px: u.valToPos(mark.tick, 'x', true) }))
              .filter(({ px }) => px >= left && px <= left + width)
              .sort((a, b) => a.px - b.px);
            context.font = `${10 * dpr}px ${themeColor(u.root, '--ms-font', 'system-ui, sans-serif')}`;
            context.textBaseline = 'top';
            shown.forEach(({ mark, px }, i) => {
              context.strokeStyle = accent;
              context.globalAlpha = 0.7;
              context.lineWidth = 1 * dpr;
              context.setLineDash([2 * dpr, 2 * dpr]);
              context.beginPath();
              context.moveTo(px, top);
              context.lineTo(px, top + height);
              context.stroke();
              context.setLineDash([]);
              const room = (shown[i + 1]?.px ?? left + width) - px - 6 * dpr;
              if (mark.label && room > 24 * dpr) {
                let text = mark.label;
                while (text.length > 1 && context.measureText(text).width > room) {
                  text = `${text.slice(0, -2)}…`;
                }
                context.globalAlpha = 0.9;
                context.fillStyle = accent;
                context.fillText(text, px + 3 * dpr, top + 2 * dpr);
              }
              context.globalAlpha = 1;
            });
            context.restore();
          },
        ],
      },
    };

    let cancelled = false;
    let plot: uPlot | null = null;
    let observer: ResizeObserver | undefined;
    const dblclick = (): void => {
      zoomedRef.current = false;
    };
    // uPlot touches `matchMedia` when it is imported, so load it on demand and
    // leave the plot area empty where that, or drawing, is impossible.
    void import('uplot')
      .then((module) => {
        if (cancelled) return;
        const Plot = module.default;
        plot = new Plot(options, readData(sim, spec.series), container);
        plotRef.current = plot;
        zoomedRef.current = false;
        setUnavailable(false);
        plot.over.addEventListener('dblclick', dblclick);
        if (typeof ResizeObserver !== 'undefined') {
          const created = plot;
          observer = new ResizeObserver(() => {
            const size = measure();
            if (size.width >= 100) created.setSize(size);
          });
          observer.observe(container);
        }
      })
      .catch(() => {
        if (cancelled) return;
        plot = null;
        plotRef.current = null;
        setUnavailable(true);
        container.replaceChildren();
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      plot?.over.removeEventListener('dblclick', dblclick);
      plot?.destroy();
      plotRef.current = null;
    };
    // Labels and units are derived from spec and sim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, sim, fill, syncKey, ghost, theme]);

  useEffect(() => {
    plotRef.current?.setData(readData(sim, spec.series), !zoomedRef.current);
  }, [spec, sim, frame]);

  useEffect(() => {
    marksRef.current = marks;
    plotRef.current?.redraw(false, false);
  }, [marks]);

  useEffect(() => {
    onCursorRef.current = onCursorTick;
  }, [onCursorTick]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || cursorTick === undefined) return;
    const left = plot.valToPos(cursorTick, 'x');
    if (Number.isFinite(left))
      plot.setCursor({ left, top: plot.bbox.height / 2 / (devicePixelRatio || 1) });
  }, [cursorTick, frame]);

  const count = sim.data.sampleCount;
  const shownTick = hovered ? hovered.tick : sim.data.ticks[count - 1];
  const valueAt = (id: string, i: number): number | undefined => {
    if (hovered) return hovered.values[i] ?? undefined;
    return count > 0 ? sim.data.latest(id) : undefined;
  };

  return (
    <div
      className={fill ? 'ms-chart ms-timeseries ms-fill' : 'ms-chart ms-timeseries'}
      data-frame={frame}
    >
      <div
        className="ms-plot"
        ref={containerRef}
        role="img"
        aria-label={`${spec.title}: ${labels.join(', ')} over ${unit.plural}`}
        data-unavailable={unavailable ? 'true' : undefined}
      />
      <ul className="ms-legend" aria-label={`${spec.title} values`}>
        {hovered && shownTick !== undefined && (
          <li className="ms-legend-time">
            {`${humanize(unit.singular)} ${formatNumber(timeAt(sim, shownTick))}`}
          </li>
        )}
        {spec.series.map((id, i) => {
          const value = valueAt(id, i);
          return (
            <li key={id} className="ms-legend-item">
              <span className="ms-swatch" style={{ background: colors[i] }} aria-hidden="true" />
              <span className="ms-legend-label">{labels[i]}</span>
              <span className="ms-legend-value">
                {value === undefined ? '–' : formatNumber(value)}
              </span>
            </li>
          );
        })}
        {ghost && (
          <li className="ms-legend-item ms-legend-ghost">
            <span className="ms-swatch ms-swatch-ghost" aria-hidden="true" />
            <span className="ms-legend-label">{ghost.label ?? 'Previous run'}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
