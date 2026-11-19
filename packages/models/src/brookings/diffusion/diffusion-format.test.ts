// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  abcDiffusion,
  abcDiffusionFormat,
  abcdefDiffusion,
  abcdefDiffusionFormat,
  abDiffusion,
  abDiffusionFormat,
  bigAbcdefDiffusion,
  bigAbcdefDiffusionBWFormat,
  bigAbcdefDiffusionFormat,
  family,
} from './index';

/** A cell of a format model: its attribute values are a slot array, read by attribute ID. */
interface FormatCell {
  readonly x: number;
  readonly y: number;
  readonly info: { readonly attributes: readonly { readonly id: string }[] };
  readonly values: unknown[];
}

const make = (model: Model, seed: number, parameters: object = {}) =>
  new RootScape(model as never, { seed, parameters: parameters as never });
const cells = (root: RootScape) =>
  (root.findScape('Lattice') as unknown as { members: readonly FormatCell[] }).members;
const read = (cell: FormatCell, id: string) =>
  cell.values[cell.info.attributes.findIndex((a) => a.id === id)];

describe('Diffusion (format)', () => {
  it('lists each coded model followed by its format version', () => {
    expect(family.models).toHaveLength(10);
    for (let i = 0; i < 10; i += 2) {
      expect(family.models[i + 1]!.name).toBe(`${family.models[i]!.name} (format)`);
    }
  });

  it.each([
    ['AB', abDiffusionFormat, 2],
    ['ABC', abcDiffusionFormat, 3],
    ['ABCDEF', abcdefDiffusionFormat, 6],
  ] as const)('%s starts everyone on action B and is deterministic by seed', (_, model, n) => {
    const root = make(model, 1);
    expect(root.data.latest('cell.action.b')).toBe(cells(root).length);
    const csv = (seed: number) => {
      const r = make(model, seed);
      r.run(30);
      return r.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
    const r = make(model, 2);
    r.run(20);
    const actions = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
    expect(actions.reduce((sum, a) => sum + r.data.latest(`cell.action.${a}`), 0)).toBe(
      cells(r).length,
    );
  });

  it('gives cells their characteristic by the checkerboard and the halves', () => {
    const root = make(abcDiffusionFormat, 1);
    for (const cell of cells(root)) {
      const expected = (cell.x + cell.y) % 2 === 0 ? 'medium' : cell.y < 5 ? 'high' : 'low';
      expect(read(cell, 'characteristic'), `${cell.x},${cell.y}`).toBe(expected);
    }
  });

  it('gives an action with a payoff below 1 no weight: low cells in ABC always take A', () => {
    const root = make(abcDiffusionFormat, 3);
    root.run(60);
    for (const cell of cells(root)) {
      if (read(cell, 'characteristic') === 'low' && read(cell, 'action') !== 'b') {
        // Low cells were never weighed towards B or C (payoffs 0), so a decision gives them A.
        expect(read(cell, 'action')).toBe('a');
      }
    }
  });

  it('runs the same model on a larger lattice, and in black and white', () => {
    const big = make(bigAbcdefDiffusionFormat, 1);
    expect(cells(big)).toHaveLength(400);
    const bw = make(bigAbcdefDiffusionBWFormat, 1);
    expect(cells(bw)).toHaveLength(400);
    expect(bw.parameters.blackAndWhite).toBe(true);
    expect(big.parameters.blackAndWhite).toBe(false);
  });

  it('charts the actions it records', () => {
    for (const model of [abDiffusionFormat, abcDiffusionFormat, abcdefDiffusionFormat]) {
      const root = make(model, 1);
      const known = new Set(root.data.series.map((s) => s.id));
      const charts = root.allViews.filter((v) => v.type === 'timeSeries');
      expect(charts).toHaveLength(1);
      for (const v of charts) for (const id of v.series) expect(known.has(id)).toBe(true);
    }
  });

  /*
   * Statistical equivalence with the coded ports (the format versions draw their
   * random numbers in other places and orders, and each cell decides with a
   * chance in place of exactly 25 draws a period, so only distributions can
   * agree). For each of 16 seeds both versions run, and the share of cells
   * playing each action is averaged over the later half of the periods, over
   * the whole lattice and, for ABC and ABCDEF, over its upper and lower halves
   * (read off the cells of the format version). Across seeds the means of the
   * two versions must differ by less than four standard errors of their
   * difference, and their spreads by less than a factor of three.
   */
  const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

  const summary = (samples: readonly number[]) => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };

  const expectEquivalent = (name: string, coded: number[], format: number[]) => {
    const x = summary(coded);
    const y = summary(format);
    const se = Math.sqrt((x.sd ** 2 + y.sd ** 2) / SEEDS.length);
    // A series that does not vary (an action nobody plays) agrees exactly.
    if (x.sd === 0 && y.sd === 0) return expect(y.mean, name).toBeCloseTo(x.mean, 6);
    expect(Math.abs(x.mean - y.mean), name).toBeLessThan(4 * Math.max(se, 1e-9));
    expect(y.sd / x.sd, name).toBeGreaterThan(1 / 3);
    expect(y.sd / x.sd, name).toBeLessThan(3);
  };

  /** Labels of the coded series for actions A to F. */
  const CODED = ['A', 'B', 'C', 'D', 'E', 'F'];
  const LEGACY = ['.6', '.5', '.4', '.9', '.8', '.7'];

  const compare = (
    coded: Model,
    format: Model,
    n: number,
    parameters: { coded?: object; format?: object },
    periods: number,
    names: readonly string[],
  ) => {
    const actions = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
    const from = periods / 2;
    // [action][seed] averages of the share of all, above and below cells.
    const make3 = () => actions.map(() => SEEDS.map(() => 0));
    const sums = {
      coded: make3(),
      format: make3(),
      codedAbove: make3(),
      formatAbove: make3(),
      codedBelow: make3(),
      formatBelow: make3(),
    };
    SEEDS.forEach((seed, s) => {
      const a = make(coded, seed, parameters.coded);
      const b = make(format, seed, parameters.format);
      const total = cells(b).length;
      const height = Math.max(...cells(b).map((c) => c.y)) + 1;
      for (let t = 1; t <= periods; t++) {
        a.run(1);
        b.run(1);
        if (t <= from) continue;
        const above = new Array<number>(n).fill(0);
        const below = new Array<number>(n).fill(0);
        for (const cell of cells(b)) {
          const k = actions.indexOf(read(cell, 'action') as string);
          if (cell.y < Math.floor(height / 2)) above[k]!++;
          else below[k]!++;
        }
        actions.forEach((action, k) => {
          const weight = 1 / (periods - from);
          sums.format[k]![s]! += (b.data.latest(`cell.action.${action}`) / total) * weight;
          sums.formatAbove[k]![s]! += (above[k]! / total) * weight;
          sums.formatBelow[k]![s]! += (below[k]! / total) * weight;
          if (names.length === 0) {
            sums.coded[k]![s]! += (a.data.latest(CODED[k]!) / total) * weight;
          } else {
            const up = a.data.latest(`${names[k]} Above`);
            const down = a.data.latest(`${names[k]} Below`);
            sums.coded[k]![s]! += ((up + down) / total) * weight;
            sums.codedAbove[k]![s]! += (up / total) * weight;
            sums.codedBelow[k]![s]! += (down / total) * weight;
          }
        });
      }
    });
    actions.forEach((action, k) => {
      expectEquivalent(`${action} overall`, sums.coded[k]!, sums.format[k]!);
      if (names.length > 0) {
        expectEquivalent(`${action} above`, sums.codedAbove[k]!, sums.formatAbove[k]!);
        expectEquivalent(`${action} below`, sums.codedBelow[k]!, sums.formatBelow[k]!);
      }
    });
    return sums;
  };

  it('AB agrees with the coded port in distribution', () => {
    // A small lattice, so that it settles within the run.
    const sums = compare(
      abDiffusion,
      abDiffusionFormat,
      2,
      { coded: { span: 10 }, format: { 'world.width': 10, 'world.height': 10 } },
      400,
      [],
    );
    void sums;
  }, 60_000);

  it('ABC agrees with the coded port in distribution', () => {
    compare(abcDiffusion, abcDiffusionFormat, 3, {}, 200, ['A', 'B', 'C']);
  }, 60_000);

  it('ABCDEF agrees with the coded port in distribution', () => {
    compare(abcdefDiffusion, abcdefDiffusionFormat, 6, {}, 200, LEGACY);
  }, 60_000);

  it('Big ABCDEF agrees with the coded port in distribution', () => {
    compare(bigAbcdefDiffusion, bigAbcdefDiffusionFormat, 6, {}, 100, LEGACY);
  }, 60_000);
});
