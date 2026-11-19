// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  conwayLife,
  conwayLifeFormat,
  conwayLifeSmallWorld,
  conwayLifeSmallWorldFormat,
  smallConwayLife,
  smallConwayLifeFormat,
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
const lattice = (root: RootScape) =>
  root.findScape('Lattice') as unknown as {
    readonly members: readonly FormatCell[];
    readonly space: { at(x: number, y: number): FormatCell | undefined };
  };
const slot = (cell: FormatCell, id: string) => cell.info.attributes.findIndex((a) => a.id === id);
const liveSet = (root: RootScape) =>
  lattice(root)
    .members.filter((c) => c.values[slot(c, 'on')] === true)
    .map((c) => `${c.x},${c.y}`)
    .sort();
const place = (root: RootScape, cells: [number, number][]) => {
  for (const c of lattice(root).members) {
    c.values[slot(c, 'on')] = false;
    if (slot(c, 'next') >= 0) c.values[slot(c, 'next')] = false;
  }
  for (const [x, y] of cells) {
    const c = lattice(root).space.at(x, y)!;
    c.values[slot(c, 'on')] = true;
  }
};

const formats = [
  ['ConwayLife', conwayLifeFormat],
  ['ConwayLifeSmallWorld', conwayLifeSmallWorldFormat],
  ['SmallConwayLife', smallConwayLifeFormat],
] as const;

describe("Conway's Life (format)", () => {
  it.each(formats)('%s runs 30 periods and is deterministic', (_, model) => {
    const csv = (seed: number) => {
      const root = make(model, seed);
      expect(root.run(30)).toBe(30);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('starts with about the initial density', () => {
    const root = make(conwayLifeFormat, 3, { initialAliveDensity: 0.3 });
    const n = root.data.latest('cell.on');
    expect(n / (51 * 51)).toBeGreaterThan(0.25);
    expect(n / (51 * 51)).toBeLessThan(0.35);
  });

  it('oscillates a blinker and moves a glider synchronously on the torus', () => {
    const root = make(conwayLifeFormat, 1, { 'world.width': 20, 'world.height': 20 });
    place(root, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    root.iterate();
    expect(liveSet(root)).toEqual(['6,4', '6,5', '6,6']);
    root.iterate();
    expect(liveSet(root)).toEqual(['5,5', '6,5', '7,5']);
    const glider: [number, number][] = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    place(root, glider);
    root.run(4);
    expect(liveSet(root)).toEqual(glider.map(([x, y]) => `${x + 1},${y + 1}`).sort());
    // Twenty periods of four carry it round the torus.
    root.run(76);
    expect(liveSet(root)).toEqual(glider.map(([x, y]) => `${x},${y}`).sort());
  });

  it('has hard edges in the small-world model: a glider crashes into the corner', () => {
    const root = make(conwayLifeSmallWorldFormat, 1, { 'world.width': 20, 'world.height': 20 });
    place(root, [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    root.run(100);
    // On a torus a glider lives for ever; against an edge it ends as a block or nothing.
    expect(root.data.latest('cell.on')).toBeLessThanOrEqual(4);
    // A blinker in a corner, whose cells have fewer neighbours, is not one on a torus.
    place(root, [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    root.iterate();
    expect(liveSet(root)).toEqual(['1,0', '1,1']);
  });

  it('kills every initially live cell in the first step of SmallConwayLife, and not after', () => {
    const root = make(smallConwayLifeFormat, 4, { 'world.width': 20, 'world.height': 20 });
    // A block is still life in Life, but the quirk kills it once.
    place(root, [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ]);
    root.iterate();
    expect(liveSet(root)).toEqual([]);
    place(root, [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ]);
    // `next` is false everywhere after the first step, so the cells' `next` now follow `on`.
    for (const c of lattice(root).members) c.values[slot(c, 'next')] = c.values[slot(c, 'on')];
    root.iterate();
    expect(liveSet(root)).toEqual(['5,5', '5,6', '6,5', '6,6']);
  });

  /*
   * Statistical equivalence with the coded ports (they draw their random numbers
   * in other orders, so only distributions can agree). For each of 12 seeds both
   * versions run 60 periods and the count of live cells is averaged over the
   * first five periods (which shows SmallConwayLife's first-step quirk) and over
   * periods 31 to 60. Across seeds the means of the two versions must differ by
   * less than four standard errors of their difference, and their spreads by
   * less than a factor of three.
   */
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const PERIODS = 60;

  const summary = (samples: readonly number[]) => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };

  const counts = (model: Model, series: string, seed: number) => {
    const root = make(model, seed);
    const values: number[] = [];
    for (let t = 0; t < PERIODS; t++) {
      root.run(1);
      values.push(root.data.latest(series));
    }
    return values;
  };

  const average = (values: number[], from: number, to: number) =>
    values.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);

  it.each([
    ['ConwayLife', conwayLife, conwayLifeFormat],
    ['ConwayLifeSmallWorld', conwayLifeSmallWorld, conwayLifeSmallWorldFormat],
    ['SmallConwayLife', smallConwayLife, smallConwayLifeFormat],
  ] as const)(
    '%s agrees with the coded port in distribution',
    (_, coded, format) => {
      const a = SEEDS.map((seed) => counts(coded as Model, 'Alive', seed));
      const b = SEEDS.map((seed) => counts(format, 'cell.on', seed));
      for (const [name, from, to] of [
        ['periods 1 to 5', 0, 5],
        ['periods 31 to 60', 30, 60],
      ] as const) {
        const x = summary(a.map((run) => average(run, from, to)));
        const y = summary(b.map((run) => average(run, from, to)));
        const se = Math.sqrt((x.sd ** 2 + y.sd ** 2) / SEEDS.length);
        expect(Math.abs(x.mean - y.mean), name).toBeLessThan(4 * se);
        const ratio = y.sd / x.sd;
        expect(ratio, name).toBeGreaterThan(1 / 3);
        expect(ratio, name).toBeLessThan(3);
      }
    },
    60_000,
  );
});
