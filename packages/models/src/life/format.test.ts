// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { life } from './life';
import { lifeFormat } from './format';

/** A cell of the format model: its attribute values are a slot array, read by attribute ID. */
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
  for (const c of lattice(root).members) c.values[slot(c, 'on')] = false;
  for (const [x, y] of cells) {
    const c = lattice(root).space.at(x, y)!;
    c.values[slot(c, 'on')] = true;
  }
};

const GLIDER: [number, number][] = [
  [1, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];
const shift = (cells: [number, number][], dx: number, dy: number) =>
  cells.map(([x, y]) => `${x + dx},${y + dy}`).sort();

describe('Game of Life (format)', () => {
  it('is in the catalogue beside the coded model, with its explorations', () => {
    expect(lifeFormat.name).toBe('Game of Life (format)');
    expect(lifeFormat.explorations?.map((e) => e.title)).toEqual(
      life.explorations?.map((e) => e.title),
    );
    // The coded model's Wrap is the lattice's border rule.
    expect(lifeFormat.parameters).toHaveProperty('world.edges');
    // Every exploration names parameters the model has.
    for (const e of lifeFormat.explorations ?? []) {
      for (const key of Object.keys(e.parameters ?? {}))
        expect(lifeFormat.parameters).toHaveProperty(key);
    }
  });

  it('is deterministic by seed and charts the live cells', () => {
    const csv = (seed: number) => {
      const root = make(lifeFormat, seed);
      root.run(20);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
    const root = make(lifeFormat, 1);
    const known = new Set(root.data.series.map((s) => s.id));
    for (const view of root.allViews.filter((v) => v.type === 'timeSeries')) {
      for (const id of view.series) expect(known.has(id)).toBe(true);
    }
  });

  it('starts with about the density, in a random soup', () => {
    const root = make(lifeFormat, 3, { density: 0.5 });
    const n = root.data.latest('cell.on');
    expect(n / 3600).toBeGreaterThan(0.45);
    expect(n / 3600).toBeLessThan(0.55);
  });

  it('places each named pattern in the middle, as the coded model does', () => {
    for (const [name, pattern] of [
      ['glider', 'glider'],
      ['blinker', 'blinker'],
      ['rPentomino', 'r-pentomino'],
    ] as const) {
      const coded = make(life, 1, { pattern });
      const format = make(lifeFormat, 1, { pattern: name });
      const codedCells = (
        coded.findScape<never>('cells').members as unknown as {
          x: number;
          y: number;
          on: boolean;
        }[]
      )
        .filter((c) => c.on)
        .map((c) => `${c.x},${c.y}`)
        .sort();
      expect(liveSet(format), name).toEqual(codedCells);
    }
    // And on a lattice of another size.
    const odd = make(lifeFormat, 1, { pattern: 'blinker', 'world.width': 21, 'world.height': 15 });
    expect(liveSet(odd)).toEqual(['10,6', '11,6', '9,6']);
  });

  it('moves a glider round the torus and oscillates a blinker', () => {
    const torus = make(lifeFormat, 1, { 'world.width': 20, 'world.height': 20 });
    place(torus, GLIDER);
    torus.run(4);
    expect(liveSet(torus)).toEqual(shift(GLIDER, 1, 1));
    torus.run(76);
    expect(liveSet(torus)).toEqual(shift(GLIDER, 0, 0));
    place(torus, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    torus.iterate();
    expect(liveSet(torus)).toEqual(['6,4', '6,5', '6,6']);
  });

  it('lets a glider crash into the edge when the lattice stops there, cell for cell as the coded model', () => {
    const coded = make(life, 1, { pattern: 'glider', wrap: false, width: 12, height: 12 });
    const format = make(lifeFormat, 1, {
      pattern: 'glider',
      'world.edges': 'sticky',
      'world.width': 12,
      'world.height': 12,
    });
    const codedLive = () =>
      (
        coded.findScape<never>('cells').members as unknown as {
          x: number;
          y: number;
          on: boolean;
        }[]
      )
        .filter((c) => c.on)
        .map((c) => `${c.x},${c.y}`)
        .sort();
    for (let t = 0; t < 40; t++) {
      expect(liveSet(format), `period ${t}`).toEqual(codedLive());
      coded.iterate();
      format.iterate();
    }
    // The glider has become a block in the corner, where on the torus it would go on.
    expect(liveSet(format)).toHaveLength(4);
  });

  /*
   * Statistical equivalence with the coded model (they draw their random numbers
   * in other orders, so only distributions can agree). For each of 12 seeds both
   * run 60 periods, and the count of live cells is
   * averaged over periods 1 to 5 and 31 to 60. Across seeds the means of the
   * two must differ by less than four standard errors of their difference, and
   * their spreads by less than a factor of three.
   */
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const summary = (samples: readonly number[]) => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };
  const counts = (model: Model, series: string, seed: number, parameters: object) => {
    const root = make(model, seed, parameters);
    const values: number[] = [];
    for (let t = 0; t < 60; t++) {
      root.run(1);
      values.push(root.data.latest(series));
    }
    return values;
  };
  const average = (values: number[], from: number, to: number) =>
    values.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);

  it('agrees with the coded model in distribution', () => {
    const a = SEEDS.map((seed) => counts(life, 'live', seed, {}));
    const b = SEEDS.map((seed) => counts(lifeFormat, 'cell.on', seed, {}));
    for (const [name, from, to] of [
      ['periods 1 to 5', 0, 5],
      ['periods 31 to 60', 30, 60],
    ] as const) {
      const x = summary(a.map((run) => average(run, from, to)));
      const y = summary(b.map((run) => average(run, from, to)));
      const se = Math.sqrt((x.sd ** 2 + y.sd ** 2) / SEEDS.length);
      expect(Math.abs(x.mean - y.mean), name).toBeLessThan(4 * se);
      expect(y.sd / x.sd, name).toBeGreaterThan(1 / 3);
      expect(y.sd / x.sd, name).toBeLessThan(3);
    }
  }, 60_000);
});
