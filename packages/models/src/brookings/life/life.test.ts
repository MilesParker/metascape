// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { conwayLife, conwayLifeSmallWorld, smallConwayLife } from './life-models';
import type { LifeCell } from './life-cell';

const lattice = (sim: Simulation) => sim.scape('Lattice') as GridScape<LifeCell>;
const liveSet = (sim: Simulation) =>
  lattice(sim)
    .members.filter((c) => c.on)
    .map((c) => `${c.x},${c.y}`)
    .sort();
const place = (sim: Simulation, cells: [number, number][]) => {
  for (const c of lattice(sim).members) {
    c.on = false;
    c.next = false;
  }
  for (const [x, y] of cells) lattice(sim).at(x, y)!.on = true;
};

describe('Conway life family', () => {
  it('lists three models', () => {
    expect(family.models).toHaveLength(3);
  });

  for (const model of [conwayLife, conwayLifeSmallWorld, smallConwayLife] as Model[]) {
    it(`${model.name} runs 30 ticks and is deterministic`, () => {
      const csv = (seed: number) => {
        const sim = new Simulation(model, { seed });
        expect(sim.run(30)).toBe(30);
        return sim.data.toCSV();
      };
      expect(csv(1)).toBe(csv(1));
      expect(csv(1)).not.toBe(csv(2));
    });
  }

  it('starts with about the initial density', () => {
    const sim = new Simulation(conwayLife, { seed: 3, parameters: { initialAliveDensity: 0.3 } });
    const n = sim.data.latest('Alive');
    expect(n / (51 * 51)).toBeGreaterThan(0.25);
    expect(n / (51 * 51)).toBeLessThan(0.35);
  });

  it('oscillates a blinker and moves a glider synchronously on the torus', () => {
    const sim = new Simulation(conwayLife, { seed: 1, parameters: { width: 20, height: 20 } });
    place(sim, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    sim.step();
    expect(liveSet(sim)).toEqual(['6,4', '6,5', '6,6']);
    sim.step();
    expect(liveSet(sim)).toEqual(['5,5', '6,5', '7,5']);
    const glider: [number, number][] = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    place(sim, glider);
    sim.run(4);
    expect(liveSet(sim)).toEqual(glider.map(([x, y]) => `${x + 1},${y + 1}`).sort());
    sim.run(76);
    expect(liveSet(sim)).toEqual(glider.map(([x, y]) => `${x},${y}`).sort());
  });

  it('has hard edges in the small-world variant', () => {
    const sim = new Simulation(conwayLifeSmallWorld, { seed: 1 });
    // Three cells in a column at the left edge would wrap on a torus; on a bounded lattice they do not.
    place(sim, [
      [0, 10],
      [0, 11],
      [0, 12],
    ]);
    sim.step();
    expect(liveSet(sim)).toEqual(['0,11', '1,11']);
  });

  it('rewires neighborhoods when randomEdgeRatio is positive', () => {
    const plain = lattice(new Simulation(conwayLifeSmallWorld, { seed: 1 }));
    expect(plain.members[0]!.neighbors).toHaveLength(3);
    const g = lattice(
      new Simulation(conwayLifeSmallWorld, { seed: 1, parameters: { randomEdgeRatio: 1 } }),
    );
    const cell = g.members[100]!;
    expect(cell.neighbors).toHaveLength(g.within(cell, 1).length);
    expect(new Set(cell.neighbors).size).toBe(cell.neighbors.length);
    expect(cell.neighbors).not.toEqual(g.within(cell, 1));
  });

  it('kills every initially live cell in the first step of SmallConwayLife (kept bug)', () => {
    const sim = new Simulation(smallConwayLife, {
      seed: 4,
      parameters: { initialAliveDensity: 0.4 },
    });
    const before = new Set(liveSet(sim));
    sim.step();
    expect(liveSet(sim).some((c) => before.has(c))).toBe(false);
  });

  it('oscillates a blinker in SmallConwayLife after the first step', () => {
    const sim = new Simulation(smallConwayLife, { seed: 4 });
    place(sim, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    sim.step(); // first step: the blinker's cells die (stale nextAlive) and nothing is born
    place(sim, [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    for (const c of lattice(sim).members) c.next = c.on;
    sim.step();
    expect(liveSet(sim)).toEqual(['6,4', '6,5', '6,6']);
  });
});
