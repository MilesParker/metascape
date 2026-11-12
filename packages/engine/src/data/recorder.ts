// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Scape } from '../scape';
import type { Simulation, SimulationObserver } from '../simulation';

/** A summary statistic of a measure over the live members of a scape. */
export type Statistic = 'count' | 'sum' | 'mean' | 'min' | 'max' | 'variance' | 'stdDev';

/** What kind of quantity a series holds: a {@link Statistic}, or `value` for model-level values. */
export type SeriesStatistic = Statistic | 'value';

/** The statistics recorded when none are chosen. */
export const DEFAULT_STATISTICS: readonly Statistic[] = ['count', 'sum', 'mean', 'min', 'max'];

/** Describes one recorded series. */
export interface Series {
  /** `"<name>.<statistic>"` for measures; just `"<name>"` for counts and values. */
  readonly id: string;
  /** The name of the measure, count or value that produced this series. */
  readonly measure: string;
  readonly statistic: SeriesStatistic;
  /** A human-readable default, such as `Mean wealth`. */
  readonly label: string;
}

export interface RecorderOptions {
  /** Keep every sample (default) or only the latest value of each series. */
  readonly history?: boolean;
}

export interface MeasureOptions<A extends Agent> {
  /** Only members for which this returns true are measured. */
  readonly when?: (agent: A) => boolean;
  /** Which statistics to record. Default: count, sum, mean, min, max. */
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

/** Handle to a numeric measure: its series, one per chosen statistic. */
export interface MeasureHandle {
  readonly name: string;
  readonly series: readonly Series[];
  /** The series for a statistic; throws if that statistic was not chosen. */
  seriesFor(statistic: Statistic): Series;
}

/** Handle to a distribution, which keeps only its latest sample. */
export interface DistributionHandle {
  readonly name: string;
  readonly bins: number;
  readonly min: number;
  readonly max: number;
  /** The bin counts of the latest sample; updated in place at each sample. */
  counts(): Uint32Array;
}

const STATISTIC_LABELS: Record<Statistic, string> = {
  count: 'Count',
  sum: 'Sum',
  mean: 'Mean',
  min: 'Min',
  max: 'Max',
  variance: 'Variance',
  stdDev: 'Std dev',
};

const INITIAL_CAPACITY = 64;

/** Running statistics of one measure for the sample in progress. Reused, never reallocated. */
interface Accumulator {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Welford running mean and sum of squared deviations. */
  runningMean: number;
  m2: number;
}

interface Column {
  readonly series: Series;
  buffer: Float64Array;
}

interface ScapeMeasure {
  readonly name: string;
  readonly scape: Scape<Agent>;
  readonly value: ((agent: Agent) => number) | undefined;
  readonly when: ((agent: Agent) => boolean) | undefined;
  readonly acc: Accumulator;
  /** Columns to fill after accumulating, each with the statistic it reads. */
  readonly outputs: { readonly column: Column; readonly statistic: Statistic }[];
}

interface ModelValue {
  readonly column: Column;
  readonly compute: (sim: Simulation) => number;
}

interface Distribution {
  readonly handle: DistributionHandle;
  readonly scape: Scape<Agent>;
  readonly value: (agent: Agent) => number;
  readonly when: ((agent: Agent) => boolean) | undefined;
  readonly counts: Uint32Array;
}

/**
 * Records time series of what a model declares worth measuring.
 *
 * Create it inside a model's `build(sim)`, declare measures, and it takes one
 * sample of every series when the simulation is initialized (tick 0) and one
 * after every step. Within a sample, scape measures are evaluated first (in
 * declaration order) and then model-level {@link value} series, which may
 * therefore read the latest values of the measures.
 *
 * Series values are stored in growable `Float64Array` buffers. With
 * `history: false` only the latest sample is kept.
 */
export class DataRecorder implements SimulationObserver {
  readonly sim: Simulation;
  readonly history: boolean;

  readonly #series: Series[] = [];
  readonly #columns = new Map<string, Column>();
  readonly #names = new Set<string>();
  readonly #measures: ScapeMeasure[] = [];
  readonly #modelValues: ModelValue[] = [];
  readonly #distributions = new Map<string, Distribution>();
  #tickBuffer = new Float64Array(INITIAL_CAPACITY);
  #length = 0;
  #samples = 0;
  readonly #unobserve: () => void;

  constructor(sim: Simulation, options: RecorderOptions = {}) {
    this.sim = sim;
    this.history = options.history ?? true;
    this.#unobserve = sim.observe(this);
  }

  /** Every series, in declaration order. */
  get series(): readonly Series[] {
    return this.#series;
  }

  /** The tick of each retained sample, as a view with no copy. */
  get ticks(): Float64Array {
    return this.#tickBuffer.subarray(0, this.#length);
  }

  /** The number of samples taken so far (with `history: false`, only the latest is retained). */
  get sampleCount(): number {
    return this.#samples;
  }

  /** Describes a series; throws if there is none with this id. */
  get(id: string): Series {
    return this.#column(id).series;
  }

  /** The latest value of a series, or `NaN` before the first sample. */
  latest(id: string): number {
    const column = this.#column(id);
    return this.#length === 0 ? Number.NaN : column.buffer[this.#length - 1]!;
  }

  /** The retained values of a series as a view of its buffer (no copy). It is invalidated when the buffer grows. */
  values(id: string): Float64Array {
    return this.#column(id).buffer.subarray(0, this.#length);
  }

  /** Stops recording. */
  detach(): void {
    this.#unobserve();
  }

  /** Declares a numeric measure over the live members of a scape. */
  measure<A extends Agent>(
    scape: Scape<A>,
    name: string,
    value: (agent: A) => number,
    options: MeasureOptions<A> = {},
  ): MeasureHandle {
    const statistics = options.statistics ?? DEFAULT_STATISTICS;
    if (statistics.length === 0) throw new Error(`Measure "${name}": no statistics chosen`);
    for (const statistic of statistics) {
      if (!(statistic in STATISTIC_LABELS)) {
        throw new Error(`Measure "${name}": unknown statistic "${String(statistic)}"`);
      }
    }
    this.#declare(name);
    const unique = [...new Set(statistics)];
    const series = unique.map((statistic): Series => ({
      id: `${name}.${statistic}`,
      measure: name,
      statistic,
      label: `${STATISTIC_LABELS[statistic]} ${name}`,
    }));
    this.#addMeasure(
      name,
      scape,
      value as (agent: Agent) => number,
      options.when as ((agent: Agent) => boolean) | undefined,
      series,
    );
    return {
      name,
      series,
      seriesFor(statistic) {
        const found = series.find((s) => s.statistic === statistic);
        if (!found) throw new Error(`Measure "${name}" does not record ${statistic}`);
        return found;
      },
    };
  }

  /** Declares a series counting the members of a scape (those matching `condition`, if given). */
  count<A extends Agent>(scape: Scape<A>, name: string, condition?: (agent: A) => boolean): Series {
    this.#declare(name);
    const series: Series = { id: name, measure: name, statistic: 'count', label: `Count ${name}` };
    this.#addMeasure(name, scape, undefined, condition as ((agent: Agent) => boolean) | undefined, [
      series,
    ]);
    return series;
  }

  /**
   * Declares a series computed once per sample at model level. It is evaluated
   * after all scape measures, so it may read their latest values.
   */
  value(name: string, compute: (sim: Simulation) => number): Series {
    this.#declare(name);
    const series: Series = { id: name, measure: name, statistic: 'value', label: name };
    this.#modelValues.push({ column: this.#addColumn(series), compute });
    return series;
  }

  /**
   * Declares a histogram of the latest sample only (no history). Values outside
   * `[min, max]` count in the first or last bin.
   */
  distribution<A extends Agent>(
    scape: Scape<A>,
    name: string,
    value: (agent: A) => number,
    options: DistributionOptions<A>,
  ): DistributionHandle {
    const { bins, min, max } = options;
    if (!Number.isInteger(bins) || bins < 1) {
      throw new RangeError(`Distribution "${name}": bins must be a positive integer`);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
      throw new RangeError(`Distribution "${name}": max must be greater than min`);
    }
    this.#declare(name);
    const counts = new Uint32Array(bins);
    const handle: DistributionHandle = { name, bins, min, max, counts: () => counts };
    this.#distributions.set(name, {
      handle,
      scape: scape as Scape<Agent>,
      value: value as (agent: Agent) => number,
      when: options.when as ((agent: Agent) => boolean) | undefined,
      counts,
    });
    return handle;
  }

  /** The bin counts of the latest sample of a distribution (all zero before the first sample). */
  distributionCounts(name: string): Uint32Array {
    const found = this.#distributions.get(name);
    if (!found) throw new Error(`No distribution named "${name}"`);
    return found.counts;
  }

  /** One plain object per retained sample: `{ tick, [seriesId]: value }`. */
  toRows(): Record<string, number>[] {
    const rows: Record<string, number>[] = [];
    for (let i = 0; i < this.#length; i++) {
      const row: Record<string, number> = { tick: this.#tickBuffer[i]! };
      for (const series of this.#series) row[series.id] = this.#columns.get(series.id)!.buffer[i]!;
      rows.push(row);
    }
    return rows;
  }

  /**
   * CSV text: a header (`tick`, then series ids) and one line per retained
   * sample, with `\n` line endings, full-precision numbers and `NaN` as an
   * empty field. Ids containing commas or quotes are quoted.
   */
  toCSV(): string {
    const columns = this.#series.map((s) => this.#columns.get(s.id)!);
    const lines = ['tick,' + this.#series.map((s) => csvField(s.id)).join(',')];
    // Tick first, then each series; kept simple since export is not hot.
    for (let i = 0; i < this.#length; i++) {
      const fields = [String(this.#tickBuffer[i]!)];
      for (const column of columns) fields.push(csvNumber(column.buffer[i]!));
      lines.push(fields.join(','));
    }
    return lines.join('\n') + '\n';
  }

  initialized(sim: Simulation): void {
    this.#sample(sim);
  }

  stepped(sim: Simulation): void {
    this.#sample(sim);
  }

  #declare(name: string): void {
    if (this.#samples > 0) throw new Error(`"${name}": declare measures before sampling starts`);
    if (this.#names.has(name)) throw new Error(`A measure named "${name}" already exists`);
    this.#names.add(name);
  }

  #column(id: string): Column {
    const column = this.#columns.get(id);
    if (!column) throw new Error(`No series with id "${id}"`);
    return column;
  }

  #addColumn(series: Series): Column {
    const column: Column = {
      series,
      buffer: new Float64Array(this.history ? this.#tickBuffer.length : 1),
    };
    this.#series.push(series);
    this.#columns.set(series.id, column);
    return column;
  }

  #addMeasure(
    name: string,
    scape: Scape<Agent>,
    value: ((agent: Agent) => number) | undefined,
    when: ((agent: Agent) => boolean) | undefined,
    series: readonly Series[],
  ): void {
    this.#measures.push({
      name,
      scape,
      value,
      when,
      acc: { count: 0, sum: 0, min: 0, max: 0, runningMean: 0, m2: 0 },
      outputs: series.map((s) => ({
        column: this.#addColumn(s),
        statistic: s.statistic as Statistic,
      })),
    });
  }

  #sample(sim: Simulation): void {
    let slot = this.#length;
    if (this.history) {
      if (slot === this.#tickBuffer.length) this.#grow();
    } else {
      slot = 0;
    }
    this.#tickBuffer[slot] = sim.tick;

    for (const measure of this.#measures) {
      accumulate(measure);
      const acc = measure.acc;
      for (const { column, statistic } of measure.outputs) {
        column.buffer[slot] = statisticOf(acc, statistic);
      }
    }
    // Model values read `latest`, which looks at the slot just written.
    this.#length = this.history ? slot + 1 : 1;
    this.#samples++;
    for (const { column, compute } of this.#modelValues) {
      column.buffer[slot] = compute(sim);
    }
    for (const distribution of this.#distributions.values()) fillDistribution(distribution);
  }

  #grow(): void {
    const capacity = this.#tickBuffer.length * 2;
    const ticks = new Float64Array(capacity);
    ticks.set(this.#tickBuffer);
    this.#tickBuffer = ticks;
    for (const column of this.#columns.values()) {
      const buffer = new Float64Array(capacity);
      buffer.set(column.buffer);
      column.buffer = buffer;
    }
  }
}

/** One pass over the scape's members, evaluating `when` and `value` at most once per agent. */
function accumulate(measure: ScapeMeasure): void {
  const { acc, when, value } = measure;
  acc.count = 0;
  acc.sum = 0;
  acc.min = Number.POSITIVE_INFINITY;
  acc.max = Number.NEGATIVE_INFINITY;
  acc.runningMean = 0;
  acc.m2 = 0;
  const members = measure.scape.members;
  for (let i = 0; i < members.length; i++) {
    const agent = members[i]!;
    if (when && !when(agent)) continue;
    acc.count++;
    if (!value) continue;
    const x = value(agent);
    if (!Number.isFinite(x)) {
      throw new Error(`Measure "${measure.name}": non-finite value ${x} for agent ${agent.id}`);
    }
    acc.sum += x;
    if (x < acc.min) acc.min = x;
    if (x > acc.max) acc.max = x;
    const delta = x - acc.runningMean;
    acc.runningMean += delta / acc.count;
    acc.m2 += delta * (x - acc.runningMean);
  }
}

function statisticOf(acc: Accumulator, statistic: Statistic): number {
  switch (statistic) {
    case 'count':
      return acc.count;
    case 'sum':
      return acc.sum;
    case 'mean':
      return acc.count === 0 ? Number.NaN : acc.sum / acc.count;
    case 'min':
      return acc.count === 0 ? Number.NaN : acc.min;
    case 'max':
      return acc.count === 0 ? Number.NaN : acc.max;
    case 'variance':
      return acc.count < 2 ? 0 : acc.m2 / (acc.count - 1);
    case 'stdDev':
      return acc.count < 2 ? 0 : Math.sqrt(acc.m2 / (acc.count - 1));
  }
}

function fillDistribution(distribution: Distribution): void {
  const { counts, when, value, handle } = distribution;
  counts.fill(0);
  const { bins, min, max, name } = handle;
  const width = max - min;
  const members = distribution.scape.members;
  for (let i = 0; i < members.length; i++) {
    const agent = members[i]!;
    if (when && !when(agent)) continue;
    const x = value(agent);
    if (!Number.isFinite(x)) {
      throw new Error(`Distribution "${name}": non-finite value ${x} for agent ${agent.id}`);
    }
    let bin = Math.floor(((x - min) / width) * bins);
    if (bin < 0) bin = 0;
    else if (bin >= bins) bin = bins - 1;
    counts[bin]!++;
  }
}

function csvNumber(value: number): string {
  return Number.isNaN(value) ? '' : String(value);
}

function csvField(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
