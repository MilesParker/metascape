// SPDX-License-Identifier: EPL-2.0
import type { Series, Simulation, ViewSpec } from '@metascape/engine';

/** What a user has chosen to show in one chart. */
export interface ChartChoice {
  readonly type: 'timeSeries' | 'bars';
  /** Ids of recorded series, in the order they are drawn. */
  readonly series: readonly string[];
}

/** A chart the user added; it follows the model's own views. */
export interface AddedChart extends ChartChoice {
  readonly title: string;
}

/**
 * The chart choices a user has made for one model. Plain data, so it can be
 * kept across restarts and stored as JSON. Changes to the model's own charts
 * are keyed by the chart's position in the model's list of views.
 */
export interface ChartCustomizations {
  readonly changed: Readonly<Record<number, ChartChoice>>;
  readonly added: readonly AddedChart[];
}

export const NO_CUSTOMIZATIONS: ChartCustomizations = { changed: {}, added: [] };

/** One row of the series picker: a measure and the series recorded for it, by statistic. */
export interface SeriesRow {
  readonly measure: string;
  readonly byStatistic: ReadonlyMap<string, Series>;
}

/** The series picker's grid: measures down, statistics across (in order of first appearance). */
export interface SeriesGrid {
  readonly statistics: readonly string[];
  readonly rows: readonly SeriesRow[];
}

/** Arranges every recorded series by measure and statistic. Counts and model values have their own columns. */
export function seriesGrid(series: readonly Series[]): SeriesGrid {
  const statistics: string[] = [];
  const rows = new Map<string, Map<string, Series>>();
  for (const s of series) {
    if (!statistics.includes(s.statistic)) statistics.push(s.statistic);
    let row = rows.get(s.measure);
    if (!row) rows.set(s.measure, (row = new Map()));
    row.set(s.statistic, s);
  }
  return {
    statistics,
    rows: [...rows].map(([measure, byStatistic]) => ({ measure, byStatistic })),
  };
}

/** Whether a view is a chart whose series can be chosen. */
export function isCustomizable(
  spec: ViewSpec,
): spec is Extract<ViewSpec, { type: 'timeSeries' | 'bars' }> {
  return spec.type === 'timeSeries' || spec.type === 'bars';
}

/** The choice a chart spec amounts to before any customizing. */
export function choiceOf(spec: Extract<ViewSpec, { type: 'timeSeries' | 'bars' }>): ChartChoice {
  return { type: spec.type, series: spec.series };
}

/** A chart spec made to show a choice, keeping the colours and axis limits of the original where they apply. */
function applyChoice(
  spec: Extract<ViewSpec, { type: 'timeSeries' | 'bars' }>,
  choice: ChartChoice,
  sim: Simulation,
): ViewSpec {
  const known = new Set(sim.data.series.map((s) => s.id));
  const series = choice.series.filter((id) => known.has(id));
  // Never leave a chart empty because a series is gone; fall back to the model's own.
  const shown = series.length > 0 ? series : spec.series;
  const colors = spec.colors;
  if (choice.type === 'bars') {
    return { type: 'bars', title: spec.title, series: shown, ...(colors && { colors }) };
  }
  const limits = spec.type === 'timeSeries' ? spec : undefined;
  return {
    type: 'timeSeries',
    title: spec.title,
    series: shown,
    ...(colors && { colors }),
    ...(limits?.yMin !== undefined && { yMin: limits.yMin }),
    ...(limits?.yMax !== undefined && { yMax: limits.yMax }),
  };
}

/** An entry in the list of views a user sees: the spec to draw, and what it can be customized with. */
export interface ShownView {
  readonly spec: ViewSpec;
  /** Position in the model's own views, or `undefined` for a chart the user added. */
  readonly position: number | undefined;
  /** Index into {@link ChartCustomizations.added}, for an added chart. */
  readonly addedIndex: number | undefined;
  readonly customizable: boolean;
  /** Whether the user has changed it from what the model declared. */
  readonly customized: boolean;
}

/**
 * The views to show: the model's own, with the user's changes to charts
 * applied, followed by the charts the user added. Series that are no longer
 * recorded are dropped from a choice.
 */
export function shownViews(
  specs: readonly ViewSpec[],
  customizations: ChartCustomizations,
  sim: Simulation,
): ShownView[] {
  const shown: ShownView[] = specs.map((spec, position) => {
    const choice = customizations.changed[position];
    if (!choice || !isCustomizable(spec)) {
      return {
        spec,
        position,
        addedIndex: undefined,
        customizable: isCustomizable(spec),
        customized: false,
      };
    }
    return {
      spec: applyChoice(spec, choice, sim),
      position,
      addedIndex: undefined,
      customizable: true,
      customized: true,
    };
  });
  const known = new Set(sim.data.series.map((s) => s.id));
  customizations.added.forEach((added, addedIndex) => {
    const series = added.series.filter((id) => known.has(id));
    if (series.length === 0) return;
    shown.push({
      spec: { type: added.type, title: added.title, series },
      position: undefined,
      addedIndex,
      customizable: true,
      customized: true,
    });
  });
  return shown;
}

/** Records a choice for the model's chart at a position, or forgets it when it matches the model's own. */
export function withChange(
  customizations: ChartCustomizations,
  position: number,
  choice: ChartChoice | undefined,
): ChartCustomizations {
  const changed = { ...customizations.changed };
  if (choice) changed[position] = choice;
  else delete changed[position];
  return { ...customizations, changed };
}

/** Replaces one added chart. */
export function withAddedChoice(
  customizations: ChartCustomizations,
  index: number,
  choice: ChartChoice,
): ChartCustomizations {
  return {
    ...customizations,
    added: customizations.added.map((chart, i) => (i === index ? { ...chart, ...choice } : chart)),
  };
}

/** Appends a new time-series chart of one series, titled in order of addition. */
export function withNewChart(
  customizations: ChartCustomizations,
  seriesId: string,
): ChartCustomizations {
  const next = customizations.added.reduce((n, chart) => {
    const match = /^Custom chart (\d+)$/.exec(chart.title);
    return match ? Math.max(n, Number(match[1])) : n;
  }, 0);
  const chart: AddedChart = {
    type: 'timeSeries',
    title: `Custom chart ${next + 1}`,
    series: [seriesId],
  };
  return { ...customizations, added: [...customizations.added, chart] };
}

/** Removes one added chart. */
export function withoutAdded(
  customizations: ChartCustomizations,
  index: number,
): ChartCustomizations {
  return { ...customizations, added: customizations.added.filter((_, i) => i !== index) };
}

/** A choice with one series switched on or off, keeping the order of those already shown. */
export function toggled(choice: ChartChoice, id: string, on: boolean): ChartChoice {
  if (on)
    return choice.series.includes(id) ? choice : { ...choice, series: [...choice.series, id] };
  return { ...choice, series: choice.series.filter((s) => s !== id) };
}
