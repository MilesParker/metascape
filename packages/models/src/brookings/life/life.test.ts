// SPDX-License-Identifier: EPL-2.0
import { type Array2D, type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { conwayLife, conwayLifeSmallWorld, smallConwayLife } from './life-models';
import type { LifeCell } from './life-cell';

const lattice = (root: RootScape) => root.findScape<LifeCell>('Lattice');
const space = (root: RootScape) => lattice(root).space as Array2D<LifeCell>;
const liveSet = (root: RootScape) =>
  lattice(root)
    .members.filter((c) => c.on)
    .map((c) => `${c.x},${c.y}`)
    .sort();
const place = (root: RootScape, cells: [number, number][]) => {
  for (const c of lattice(root).members) {
    c.on = false;
    c.next = false;
  }
  for (const [x, y] of cells) space(root).at(x, y)!.on = true;
};

describe('Conway life family', () => {
  it('lists three models', () => {
    expect(family.models).toHaveLength(3);
  });

  for (const model of [conwayLife, conwayLifeSmallWorld, smallConwayLife] as Model[]) {
    it(`${model.name} runs 30 periods and is deterministic`, () => {
      const csv = (seed: number) => {
        const root = new RootScape(model, { seed });
        expect(root.run(30)).toBe(30);
        return root.data.toCSV();
      };
      expect(csv(1)).toBe(csv(1));
      expect(csv(1)).not.toBe(csv(2));
    });
  }

  it('starts with about the initial density', () => {
    const root = new RootScape(conwayLife, { seed: 3, parameters: { initialAliveDensity: 0.3 } });
    const n = root.data.latest('Alive');
    expect(n / (51 * 51)).toBeGreaterThan(0.25);
    expect(n / (51 * 51)).toBeLessThan(0.35);
  });

  it('oscillates a blinker and moves a glider synchronously on the torus', () => {
    const root = new RootScape(conwayLife, { seed: 1, parameters: { width: 20, height: 20 } });
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
    root.run(76);
    expect(liveSet(root)).toEqual(glider.map(([x, y]) => `${x},${y}`).sort());
  });

  it('has hard edges in the small-world variant', () => {
    const root = new RootScape(conwayLifeSmallWorld, { seed: 1 });
    // Three cells in a column at the left edge would wrap on a torus; on a bounded lattice they do not.
    place(root, [
      [0, 10],
      [0, 11],
      [0, 12],
    ]);
    root.iterate();
    expect(liveSet(root)).toEqual(['0,11', '1,11']);
  });

  it('rewires neighborhoods when randomEdgeRatio is positive', () => {
    const plain = lattice(new RootScape(conwayLifeSmallWorld, { seed: 1 }));
    expect(plain.members[0]!.neighbors).toHaveLength(3);
    const g = space(
      new RootScape(conwayLifeSmallWorld, { seed: 1, parameters: { randomEdgeRatio: 1 } }),
    );
    const cell = g.members[100]!;
    expect(cell.neighbors).toHaveLength(g.findWithin(cell, 1).length);
    expect(new Set(cell.neighbors).size).toBe(cell.neighbors.length);
    expect(cell.neighbors).not.toEqual(g.findWithin(cell, 1));
  });

  it('kills every initially live cell in the first step of SmallConwayLife (kept bug)', () => {
    const root = new RootScape(smallConwayLife, {
      seed: 4,
      parameters: { initialAliveDensity: 0.4 },
    });
    const before = new Set(liveSet(root));
    root.iterate();
    expect(liveSet(root).some((c) => before.has(c))).toBe(false);
  });

  it('oscillates a blinker in SmallConwayLife after the first step', () => {
    const root = new RootScape(smallConwayLife, { seed: 4 });
    place(root, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    root.iterate(); // first step: the blinker's cells die (stale nextAlive) and nothing is born
    place(root, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    for (const c of lattice(root).members) c.next = c.on;
    root.iterate();
    expect(liveSet(root)).toEqual(['6,4', '6,5', '6,6']);
  });
});
