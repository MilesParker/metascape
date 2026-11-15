// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Scape } from '../scape';
import type {
  DistributionCollector,
  Series,
  StatCollector,
  Statistic,
  ValueCollector,
} from './stat-collector';

export interface DataOptions {
  /** Keep every period's values (default) or only the latest value of each series. */
  readonly history?: boolean;
}

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

interface CalculatedValue {
  readonly column: Column;
  readonly collector: ValueCollector;
}

interface Distribution {
  readonly collector: DistributionCollector;
  readonly scape: Scape<Agent>;
  readonly counts: Uint32Array;
}

/** What one scape collects, in the order its stat collectors were added. */
interface ScapeStats {
  readonly measures: ScapeMeasure[];
  readonly values: CalculatedValue[];
  readonly distributions: Distribution[];
}

/**
 * The data of a model: one series for everything its scapes collect.
 *
 * It belongs to the root scape. Scapes declare what to collect with
 * `addStatCollector`; collection is a system rule that the root passes down
 * the hierarchy when the model is initialized (period 0) and at the end of
 * every iteration, after every scape's rules have run. Within a scape,
 * statistics of its members are collected first, then the scapes below it,
 * then its calculated values, so those of the root come last.
 *
 * Series values are stored in growable `Float64Array` buffers. With
 * `history: false` only the latest period is kept.
 */
export class DataGroup {
  readonly history: boolean;

  readonly #series: Series[] = [];
  readonly #columns = new Map<string, Column>();
  readonly #names = new Set<string>();
  readonly #byScape = new Map<Scape<Agent>, ScapeStats>();
  readonly #distributions = new Map<string, Distribution>();
  #periodBuffer = new Float64Array(INITIAL_CAPACITY);
  #length = 0;
  #samples = 0;
  #slot = 0;

  constructor(options: DataOptions = {}) {
    this.history = options.history ?? true;
  }

  /** Every series, in declaration order. */
  get series(): readonly Series[] {
    return this.#series;
  }

  /** The period of each retained sample, as a view with no copy. */
  get periods(): Float64Array {
    return this.#periodBuffer.subarray(0, this.#length);
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

  /**
   * Engine-internal: gives a scape's stat collector its series. Called when
   * the collector is added to a scape that is part of a model.
   */
  register(scape: Scape<Agent>, collector: StatCollector): void {
    const name = collector.name;
    if (this.#samples > 0) {
      throw new Error(`"${name}": add stat collectors before collection starts`);
    }
    if (this.#names.has(name)) throw new Error(`A stat collector named "${name}" already exists`);
    this.#names.add(name);
    let stats = this.#byScape.get(scape);
    if (!stats) this.#byScape.set(scape, (stats = { measures: [], values: [], distributions: [] }));
    switch (collector.kind) {
      case 'count':
      case 'measure':
        stats.measures.push({
          name,
          scape,
          value: collector.kind === 'measure' ? collector.value : undefined,
          when: collector.when,
          acc: { count: 0, sum: 0, min: 0, max: 0, runningMean: 0, m2: 0 },
          outputs: collector.series.map((s) => ({
            column: this.#addColumn(s),
            statistic: s.statistic as Statistic,
          })),
        });
        break;
      case 'value':
        stats.values.push({ column: this.#addColumn(collector.series[0]), collector });
        break;
      case 'distribution': {
        const distribution = { collector, scape, counts: collector.counts() };
        stats.distributions.push(distribution);
        this.#distributions.set(name, distribution);
        break;
      }
    }
  }

  /** The bin counts of the latest sample of a distribution (all zero before the first sample). */
  distributionCounts(name: string): Uint32Array {
    const found = this.#distributions.get(name);
    if (!found) throw new Error(`No distribution named "${name}"`);
    return found.counts;
  }

  /** Describes a declared distribution: its bin count and value range. */
  distributionInfo(name: string): DistributionCollector {
    const found = this.#distributions.get(name);
    if (!found) throw new Error(`No distribution named "${name}"`);
    return found.collector;
  }

  /** One plain object per retained sample: `{ period, [seriesId]: value }`. */
  toRows(): Record<string, number>[] {
    const rows: Record<string, number>[] = [];
    for (let i = 0; i < this.#length; i++) {
      const row: Record<string, number> = { period: this.#periodBuffer[i]! };
      for (const series of this.#series) row[series.id] = this.#columns.get(series.id)!.buffer[i]!;
      rows.push(row);
    }
    return rows;
  }

  /**
   * CSV text: a header (`period`, then series ids) and one line per retained
   * sample, with `\n` line endings, full-precision numbers and `NaN` as an
   * empty field. Ids containing commas or quotes are quoted.
   */
  toCSV(): string {
    const columns = this.#series.map((s) => this.#columns.get(s.id)!);
    const lines = ['period,' + this.#series.map((s) => csvField(s.id)).join(',')];
    // Period first, then each series; kept simple since export is not hot.
    for (let i = 0; i < this.#length; i++) {
      const fields = [String(this.#periodBuffer[i]!)];
      for (const column of columns) fields.push(csvNumber(column.buffer[i]!));
      lines.push(fields.join(','));
    }
    return lines.join('\n') + '\n';
  }

  /** Engine-internal: starts the collection for a period. */
  begin(period: number): void {
    let slot = this.#length;
    if (this.history) {
      if (slot === this.#periodBuffer.length) this.#grow();
    } else {
      slot = 0;
    }
    this.#periodBuffer[slot] = period;
    this.#slot = slot;
    // Calculated values read `latest`, which looks at the slot being written.
    this.#length = this.history ? slot + 1 : 1;
    this.#samples++;
  }

  /** Engine-internal: collects the statistics a scape keeps of its members. */
  collectMembers(scape: Scape<Agent>): void {
    const stats = this.#byScape.get(scape);
    if (!stats) return;
    const slot = this.#slot;
    for (const measure of stats.measures) {
      accumulate(measure);
      const acc = measure.acc;
      for (const { column, statistic } of measure.outputs) {
        column.buffer[slot] = statisticOf(acc, statistic);
      }
    }
    for (const distribution of stats.distributions) fillDistribution(distribution);
  }

  /** Engine-internal: calculates a scape's values, once its members and the scapes below it are done. */
  calculate(scape: Scape<Agent>): void {
    const stats = this.#byScape.get(scape);
    if (!stats) return;
    for (const { column, collector } of stats.values) {
      column.buffer[this.#slot] = collector.compute(scape);
    }
  }

  #column(id: string): Column {
    const column = this.#columns.get(id);
    if (!column) throw new Error(`No series with id "${id}"`);
    return column;
  }

  #addColumn(series: Series): Column {
    const column: Column = {
      series,
      buffer: new Float64Array(this.history ? this.#periodBuffer.length : 1),
    };
    this.#series.push(series);
    this.#columns.set(series.id, column);
    return column;
  }

  #grow(): void {
    const capacity = this.#periodBuffer.length * 2;
    const periods = new Float64Array(capacity);
    periods.set(this.#periodBuffer);
    this.#periodBuffer = periods;
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
  const { counts, collector } = distribution;
  counts.fill(0);
  const { bins, min, max, name, when, value } = collector;
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
