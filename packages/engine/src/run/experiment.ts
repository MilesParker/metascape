// SPDX-License-Identifier: EPL-2.0
import type { ParameterSchema, ParameterValue, ParameterValues } from '../parameters';
import { Random } from '../random';
import { Simulation, type Model } from '../simulation';

/** A value that can appear in a result row. */
export type ExperimentValue = number | string | boolean;

/** The columns every row has, before parameter values and measures. */
export interface RunInfo {
  /** Zero-based index of the run within the experiment. */
  readonly run: number;
  /** Zero-based replicate number within one parameter combination. */
  readonly replicate: number;
  /** The seed this run used (derived from the experiment's base seed). */
  readonly seed: number;
  /** Ticks executed. */
  readonly ticks: number;
  /** Why the run ended: the model's stop reason, `'stopped'` if it gave none, or `'maxTicks'`. */
  readonly stopReason: string;
}

/** One result row: {@link RunInfo}, then every parameter's value, then the measures. */
export type ExperimentRow = RunInfo & Readonly<Record<string, ExperimentValue>>;

/** The parameter values to try, per parameter name; each value must suit that parameter's type. */
export type ParameterGrid<S extends ParameterSchema> = {
  readonly [K in keyof S]?: readonly ParameterValue<S[K]>[];
};

export interface ExperimentDesign<S extends ParameterSchema> {
  /**
   * Values to try for each named parameter. Parameters not listed keep their defaults.
   * Unlinked parameters are crossed with each other.
   */
  readonly parameters?: ParameterGrid<S>;
  /**
   * Groups of parameter names that advance together instead of being crossed:
   * the first values of all parameters in a group are used together, then the
   * second values, and so on. Value lists in a group must have equal length,
   * and a name may belong to one group only.
   */
  readonly linked?: readonly (readonly (keyof S & string)[])[];
  /** Runs per parameter combination. Default 1. */
  readonly replicates?: number;
  /** Base seed from which each run's seed is derived. Default 0. */
  readonly seed?: number | string;
  /** Each run stops at this many ticks if it has not stopped itself. */
  readonly maxTicks: number;
  /** Reads the outcome of a finished run into named columns. */
  measure(sim: Simulation<S>): Record<string, ExperimentValue>;
  /** Called on each fresh simulation before it runs, for example to attach observers. */
  setup?(sim: Simulation<S>): void;
}

const BUILT_IN_COLUMNS = ['run', 'replicate', 'seed', 'ticks', 'stopReason'];

/**
 * The inclusive list `start, start + step, ...` up to `end`, free of
 * floating-point drift: `range(0, 1, 0.1)` has exactly 11 values and ends in 1.
 * `step` may be negative (then `start` should exceed `end`). Returns an empty
 * list if `step` points away from `end`, and throws if `step` is zero or any
 * argument is not finite.
 */
export function range(start: number, end: number, step: number): number[] {
  if (![start, end, step].every(Number.isFinite))
    throw new RangeError('range: arguments must be finite');
  if (step === 0) throw new RangeError('range: step must not be zero');
  const span = (end - start) / step;
  if (span < -1e-9) return [];
  const count = Math.floor(span + 1e-9) + 1;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(Number((start + i * step).toPrecision(12)));
  }
  if (Math.abs(values[count - 1]! - end) < Math.abs(step) * 1e-9) values[count - 1] = end;
  return values;
}

interface Factor {
  /** Parameter names set by this factor. */
  readonly names: readonly string[];
  /** One entry per level: the values for `names`, in order. */
  readonly levels: readonly (readonly unknown[])[];
}

function buildFactors<S extends ParameterSchema>(
  model: Model<S>,
  design: ExperimentDesign<S>,
): Factor[] {
  const grid = (design.parameters ?? {}) as Readonly<Record<string, readonly unknown[]>>;
  const declared = Object.keys(grid).filter((name) => grid[name] !== undefined);
  for (const name of declared) {
    if (!Object.hasOwn(model.parameters, name)) throw new Error(`Unknown parameter "${name}"`);
    if (grid[name]!.length === 0) throw new Error(`Parameter "${name}" has no values`);
  }
  const groupOf = new Map<string, readonly string[]>();
  for (const group of design.linked ?? []) {
    if (group.length === 0) throw new Error('A linked group must name at least one parameter');
    for (const name of group) {
      if (!declared.includes(name)) throw new Error(`Linked parameter "${name}" has no values`);
      if (groupOf.has(name))
        throw new Error(`Parameter "${name}" is in more than one linked group`);
      groupOf.set(name, group);
    }
    const length = grid[group[0]!]!.length;
    if (group.some((name) => grid[name]!.length !== length)) {
      throw new Error(`Linked parameters ${group.join(', ')} need equal numbers of values`);
    }
  }
  const factors: Factor[] = [];
  const placed = new Set<readonly string[]>();
  for (const name of declared) {
    const group = groupOf.get(name);
    if (!group) {
      factors.push({ names: [name], levels: grid[name]!.map((value) => [value]) });
    } else if (!placed.has(group)) {
      placed.add(group);
      factors.push({
        names: group,
        levels: grid[group[0]!]!.map((_, level) => group.map((member) => grid[member]![level])),
      });
    }
  }
  return factors;
}

/**
 * Runs `model` once per design point and replicate, yielding one result row per
 * run as it finishes, so the caller can interleave other work or stop early.
 *
 * Run order: the design points are the Cartesian product of the unlinked
 * parameters and the linked groups. Factors are ordered by the position of
 * their first parameter in `design.parameters` (a linked group sits where its
 * first listed member would). The first factor varies slowest and the last
 * fastest; replicates of one design point are consecutive. `run` numbers the
 * rows from 0 in this order.
 *
 * Each run's seed is derived from the base seed and its run index, so an
 * experiment is exactly reproducible while replicates differ. Arguments are
 * validated immediately, not when the first row is requested.
 */
export function experimentRuns<S extends ParameterSchema>(
  model: Model<S>,
  design: ExperimentDesign<S>,
): Generator<ExperimentRow, void, undefined> {
  const replicates = design.replicates ?? 1;
  if (!Number.isInteger(replicates) || replicates < 1) {
    throw new RangeError('replicates must be a positive integer');
  }
  if (!Number.isInteger(design.maxTicks) || design.maxTicks < 0) {
    throw new RangeError('maxTicks must be a non-negative integer');
  }
  for (const name of Object.keys(model.parameters)) {
    if (BUILT_IN_COLUMNS.includes(name)) {
      throw new Error(`Parameter "${name}" collides with a built-in result column`);
    }
  }
  const factors = buildFactors(model, design);
  return generate(model, design, factors, replicates);
}

function* generate<S extends ParameterSchema>(
  model: Model<S>,
  design: ExperimentDesign<S>,
  factors: readonly Factor[],
  replicates: number,
): Generator<ExperimentRow, void, undefined> {
  const baseSeed = design.seed ?? 0;
  const points = factors.reduce((total, factor) => total * factor.levels.length, 1);
  for (let point = 0; point < points; point++) {
    // Decode the point index with the last factor as the fastest digit.
    const overrides: Record<string, unknown> = {};
    let rest = point;
    for (let f = factors.length - 1; f >= 0; f--) {
      const factor = factors[f]!;
      const level = factor.levels[rest % factor.levels.length]!;
      rest = Math.floor(rest / factor.levels.length);
      factor.names.forEach((name, i) => (overrides[name] = level[i]));
    }
    for (let replicate = 0; replicate < replicates; replicate++) {
      const run = point * replicates + replicate;
      const seed = new Random(`${baseSeed}/${run}`).uint32();
      const sim = new Simulation(model, {
        seed,
        parameters: overrides as Partial<ParameterValues<S>>,
      });
      design.setup?.(sim);
      sim.run(design.maxTicks);
      yield makeRow(sim, design, run, replicate, seed);
    }
  }
}

function makeRow<S extends ParameterSchema>(
  sim: Simulation<S>,
  design: ExperimentDesign<S>,
  run: number,
  replicate: number,
  seed: number,
): ExperimentRow {
  const row: Record<string, ExperimentValue> = {
    run,
    replicate,
    seed,
    ticks: sim.tick,
    stopReason: sim.stopped ? (sim.stopReason ?? 'stopped') : 'maxTicks',
    ...(sim.parameters as Readonly<Record<string, ExperimentValue>>),
  };
  for (const [key, value] of Object.entries(design.measure(sim))) {
    if (Object.hasOwn(row, key)) {
      throw new Error(`Measure "${key}" collides with a built-in or parameter column`);
    }
    row[key] = value;
  }
  return row as ExperimentRow;
}

/** Runs the whole experiment and collects the rows. See {@link experimentRuns} for ordering. */
export function runExperiment<S extends ParameterSchema>(
  model: Model<S>,
  design: ExperimentDesign<S>,
): ExperimentRow[] {
  return [...experimentRuns(model, design)];
}

function quote(cell: ExperimentValue | undefined): string {
  if (cell === undefined) return '';
  const text = String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Formats rows as CSV: a header of the first row's keys, then one line per row.
 * Lines are joined with `\n` (no trailing newline). Strings containing commas,
 * quotes or line breaks are quoted with doubled inner quotes; booleans print as
 * `true`/`false`. A key missing from a later row gives an empty cell. No rows
 * gives an empty string.
 */
export function rowsToCSV(rows: readonly Readonly<Record<string, ExperimentValue>>[]): string {
  const first = rows[0];
  if (!first) return '';
  const keys = Object.keys(first);
  const lines = [keys.map(quote).join(',')];
  for (const row of rows) lines.push(keys.map((key) => quote(row[key])).join(','));
  return lines.join('\n');
}
