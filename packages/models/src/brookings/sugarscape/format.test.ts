// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { capacityAt, MAX_SUGAR, SUGAR_PEAKS } from './cells';
import { gasII1, gasII2, gasII3 } from './chapter-2';
import { formatSourceOf } from '../../format-model';
import { gasII1Format, gasII2Format, gasII3Format } from './format';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/*
 * The format versions of II-1, II-2 and II-3 against the coded ports. The runs are not the same
 * run (the random draws are made in other places and orders), so the comparison is statistical:
 * over the same seeds, the means and the spread of the statistics the charts show.
 */

/** What the test reads of an interpreted cell. */
interface FormatCell {
  readonly x: number;
  readonly y: number;
  readonly values: unknown[];
  readonly info: { readonly attribute: Map<string, { readonly index: number }> };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- models differ in their schemas
type AnyModel = Model<any>;

/** The series the two versions record, by what they measure. */
const CODED = { population: 'population', sugar: 'sugar.mean', vision: 'vision.mean' } as const;
const FORMAT = {
  population: 'sugarAgent.count',
  sugar: 'sugarAgent.sugar.mean',
  vision: 'sugarAgent.vision.mean',
} as const;
type Measure = keyof typeof CODED;

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const deviation = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** What a model's statistics were at the given periods, one value per seed. */
function observe(
  model: AnyModel,
  series: Record<Measure, string>,
  seedList: number[],
  periods: number[],
): Record<number, Record<Measure, number[]>> {
  const seen: Record<number, Record<Measure, number[]>> = {};
  for (const period of periods) seen[period] = { population: [], sugar: [], vision: [] };
  for (const seed of seedList) {
    const root = new RootScape(model, { seed });
    let at = 0;
    for (const period of periods) {
      root.run(period - at);
      at = period;
      for (const measure of ['population', 'sugar', 'vision'] as const) {
        seen[period]![measure].push(root.data.latest(series[measure])!);
      }
    }
  }
  return seen;
}

/**
 * The means differ by at most 3.5 standard errors of the difference (the two-sample statistic;
 * a wrong rule would be many times that: the population is 400 and its seed-to-seed spread
 * about 7), and the spreads by at most a factor of 3 (the 99% range of a ratio of two
 * deviations from 10 runs each is about 0.43 to 2.3).
 */
function expectSameStatistics(
  coded: number[],
  format: number[],
  what: string,
  floor: number,
): void {
  const standardError = Math.sqrt(
    deviation(coded) ** 2 / coded.length + deviation(format) ** 2 / format.length,
  );
  const difference = Math.abs(mean(coded) - mean(format));
  expect(difference, `${what}: means ${mean(coded)} and ${mean(format)}`).toBeLessThanOrEqual(
    3.5 * Math.max(standardError, floor),
  );
  const ratio = deviation(format) / Math.max(deviation(coded), floor);
  expect(ratio, `${what}: spreads ${deviation(coded)} and ${deviation(format)}`).toBeGreaterThan(
    1 / 3,
  );
  expect(ratio, `${what}: spreads ${deviation(coded)} and ${deviation(format)}`).toBeLessThan(3);
}

function compare(
  coded: AnyModel,
  format: AnyModel,
  seedList: number[],
  periods: number[],
  floors: Record<Measure, number>,
): void {
  const a = observe(coded, CODED, seedList, periods);
  const b = observe(format, FORMAT, seedList, periods);
  for (const period of periods) {
    for (const measure of ['population', 'sugar', 'vision'] as const) {
      expectSameStatistics(
        a[period]![measure],
        b[period]![measure],
        `${measure} at period ${period}`,
        floors[measure],
      );
    }
  }
}

// The floors keep a statistic with almost no spread (mean vision, to two decimals) from making
// the test ask for exact agreement: 1 agent, 1 sugar, 0.02 vision.
const FLOORS = { population: 1, sugar: 1, vision: 0.02 };

describe('the format versions of II-1 to II-3', () => {
  it('lay out the same sugar landscape as the coded port', () => {
    const root = new RootScape(gasII1Format, { seed: 1 });
    const grid = root.scapes.find((scape) => scape.name === 'Sugar Lattice')!;
    const cells = grid.members as unknown as FormatCell[];
    expect(cells).toHaveLength(2500);
    const index = cells[0]!.info.attribute.get('capacity')!.index;
    for (const cell of cells) {
      // The coded map rounds in Java's single precision; the two agree on all 2,500 cells.
      const expected = capacityAt(cell.x, cell.y, 50, 50, SUGAR_PEAKS, 0.004, MAX_SUGAR);
      expect([cell.x, cell.y, cell.values[index]]).toEqual([cell.x, cell.y, expected]);
    }
  });

  it('have the same landscape in II-1, II-2 and II-3, and repeat with a seed', () => {
    const run = (model: AnyModel, seed: number) => {
      const root = new RootScape(model, { seed });
      root.run(10);
      return root.data.toCSV();
    };
    expect(run(gasII2Format, 4)).toBe(run(gasII2Format, 4));
    expect(run(gasII2Format, 4)).not.toBe(run(gasII2Format, 5));
    // II-3 has II-2's rules, so with a seed it is the same run.
    expect(run(gasII3Format, 4)).toBe(run(gasII2Format, 4));
  });

  it('are overlays: II-2 differs from II-1 by its growback rule, and II-3 from II-2 by its name', () => {
    const flat = (model: Model) => formatSourceOf(model)!.model;
    const cellActs = (model: Model) =>
      (flat(model).agents!['sugarCell'] as { acts: Record<string, unknown> }).acts;
    expect(Object.keys(cellActs(gasII1Format)).slice(-2)).toEqual(['growBack', 'toCapacityAtOnce']);
    expect(Object.keys(cellActs(gasII2Format)).slice(-4)).toEqual([
      'growBack',
      'oneMore',
      'notMore',
      'grown',
    ]);
    // Everything but the growback acts and the root's name is II-1 as written.
    const rest = (model: Model) => {
      const { id, label, description, ...others } = clone(flat(model));
      void [id, label, description];
      const cell = others.agents!['sugarCell'] as { acts: Record<string, unknown> };
      for (const act of ['growBack', 'toCapacityAtOnce', 'oneMore', 'notMore', 'grown']) {
        delete cell.acts[act];
      }
      return others;
    };
    expect(rest(gasII2Format)).toEqual(rest(gasII1Format));
    const { id: id2, label: label2, description: description2, ...same2 } = flat(gasII2Format);
    const { id: id3, label: label3, description: description3, ...same3 } = flat(gasII3Format);
    expect([id3, label3, description3]).not.toEqual([id2, label2, description2]);
    expect(same3).toEqual(same2);
  });

  it('II-1 keeps the statistics of the coded port', () => {
    compare(gasII1, gasII1Format, seeds(10), [10, 35], FLOORS);
  });

  it('II-2 keeps the statistics of the coded port', () => {
    compare(gasII2, gasII2Format, seeds(10), [10, 45], FLOORS);
  });

  it('II-3 keeps the statistics of the coded port', () => {
    compare(gasII3, gasII3Format, seeds(6), [45], FLOORS);
  });
});
