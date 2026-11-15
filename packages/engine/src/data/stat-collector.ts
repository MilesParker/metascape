// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Scape } from '../scape';

/** A summary statistic of a measure over the live members of a scape. */
export type Statistic = 'count' | 'sum' | 'mean' | 'min' | 'max' | 'variance' | 'stdDev';

/** What kind of quantity a series holds: a {@link Statistic}, or `value` for calculated values. */
export type SeriesStatistic = Statistic | 'value';

/** The statistics collected when none are chosen. */
export const DEFAULT_STATISTICS: readonly Statistic[] = ['count', 'sum', 'mean', 'min', 'max'];

/** Describes one collected series. */
export interface Series {
  /** `"<name>.<statistic>"` for measures; just `"<name>"` for counts and values. */
  readonly id: string;
  /** The name of the stat collector that produces this series. */
  readonly measure: string;
  readonly statistic: SeriesStatistic;
  /** A human-readable default, such as `Mean wealth`. */
  readonly label: string;
}

export interface MeasureOptions<A extends Agent> {
  /** Only members for which this returns true are measured. */
  readonly when?: (agent: A) => boolean;
  /** Which statistics to collect. Default: count, sum, mean, min, max. */
  readonly statistics?: readonly Statistic[];
}

export interface DistributionOptions<A extends Agent> {
  /** Number of equal-width bins; a positive integer. */
  readonly bins: number;
  /** Lower edge of the first bin. */
  readonly min: number;
  /** Upper edge of the last bin; must exceed `min`. */
  readonly max: number;
  readonly when?: (agent: A) => boolean;
}

/**
 * A function of one agent, typed so that a collector for a scape of some
 * agent class can stand where a collector for any scape is expected.
 */
type Of<A, R> = { bivariance(agent: A): R }['bivariance'];

/** Counts the members of a scape, or those matching a condition. */
export interface CountCollector<A extends Agent = Agent> {
  readonly kind: 'count';
  readonly name: string;
  readonly when: Of<A, boolean> | undefined;
  readonly series: readonly [Series];
}

/** Collects statistics of a numeric measure over the members of a scape. */
export interface MeasureCollector<A extends Agent = Agent> {
  readonly kind: 'measure';
  readonly name: string;
  readonly value: Of<A, number>;
  readonly when: Of<A, boolean> | undefined;
  /** One series per chosen statistic. */
  readonly series: readonly Series[];
  /** The series for a statistic; throws if that statistic was not chosen. */
  seriesFor(statistic: Statistic): Series;
}

/** Calculates one value each period from the scape it is added to. */
export interface ValueCollector<A extends Agent = Agent> {
  readonly kind: 'value';
  readonly name: string;
  readonly compute: Of<Scape<A>, number>;
  readonly series: readonly [Series];
}

/** Collects a histogram of a measure over the members of a scape, keeping the latest period only. */
export interface DistributionCollector<A extends Agent = Agent> {
  readonly kind: 'distribution';
  readonly name: string;
  readonly value: Of<A, number>;
  readonly when: Of<A, boolean> | undefined;
  readonly bins: number;
  readonly min: number;
  readonly max: number;
  /** The bin counts of the latest period; updated in place each time statistics are collected. */
  counts(): Uint32Array;
}

/**
 * Something a scape collects about its members each period. Add one with
 * `scape.addStatCollector`; make one with the functions of {@link stat}.
 */
export type StatCollector<A extends Agent = Agent> =
  CountCollector<A> | MeasureCollector<A> | ValueCollector<A> | DistributionCollector<A>;

export const STATISTIC_LABELS: Record<Statistic, string> = {
  count: 'Count',
  sum: 'Sum',
  mean: 'Mean',
  min: 'Min',
  max: 'Max',
  variance: 'Variance',
  stdDev: 'Std dev',
};

/** Makers of stat collectors, for `scape.addStatCollector`. */
export const stat = {
  /** A series counting the members of the scape (those matching `condition`, if given). */
  count<A extends Agent>(name: string, condition?: (agent: A) => boolean): CountCollector<A> {
    return {
      kind: 'count',
      name,
      when: condition,
      series: [{ id: name, measure: name, statistic: 'count', label: `Count ${name}` }],
    };
  },

  /** Statistics of a numeric measure over the members of the scape, one series per statistic. */
  measure<A extends Agent>(
    name: string,
    value: (agent: A) => number,
    options: MeasureOptions<A> = {},
  ): MeasureCollector<A> {
    const statistics = options.statistics ?? DEFAULT_STATISTICS;
    if (statistics.length === 0) throw new Error(`Measure "${name}": no statistics chosen`);
    for (const statistic of statistics) {
      if (!(statistic in STATISTIC_LABELS)) {
        throw new Error(`Measure "${name}": unknown statistic "${String(statistic)}"`);
      }
    }
    const series = [...new Set(statistics)].map((statistic): Series => ({
      id: `${name}.${statistic}`,
      measure: name,
      statistic,
      label: `${STATISTIC_LABELS[statistic]} ${name}`,
    }));
    return {
      kind: 'measure',
      name,
      value,
      when: options.when,
      series,
      seriesFor(statistic) {
        const found = series.find((s) => s.statistic === statistic);
        if (!found) throw new Error(`Measure "${name}" does not record ${statistic}`);
        return found;
      },
    };
  },

  /**
   * A series calculated once per period from the scape it is added to. It is
   * calculated after the statistics of that scape's members and of every
   * scape below it, so one added to the root may read the latest value of
   * any measure in the model.
   */
  value<A extends Agent = Agent>(
    name: string,
    compute: (scape: Scape<A>) => number,
  ): ValueCollector<A> {
    return {
      kind: 'value',
      name,
      compute,
      series: [{ id: name, measure: name, statistic: 'value', label: name }],
    };
  },

  /**
   * A histogram of the latest period only (no history). Values outside
   * `[min, max]` count in the first or last bin.
   */
  distribution<A extends Agent>(
    name: string,
    value: (agent: A) => number,
    options: DistributionOptions<A>,
  ): DistributionCollector<A> {
    const { bins, min, max } = options;
    if (!Number.isInteger(bins) || bins < 1) {
      throw new RangeError(`Distribution "${name}": bins must be a positive integer`);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
      throw new RangeError(`Distribution "${name}": max must be greater than min`);
    }
    const counts = new Uint32Array(bins);
    return {
      kind: 'distribution',
      name,
      value,
      when: options.when,
      bins,
      min,
      max,
      counts: () => counts,
    };
  },
};
