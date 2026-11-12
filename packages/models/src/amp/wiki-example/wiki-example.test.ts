// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { wikiExample, type Block, type Individual } from './wiki-example';

const make = (seed = 1, parameters = {}) => new Simulation(wikiExample, { seed, parameters });

describe('Wiki example', () => {
  it('runs 50 ticks with defaults', () => {
    const sim = make();
    expect(sim.run(50)).toBe(50);
    expect(sim.data.latest('Individuals Population')).toBe(50);
  });

  it('is deterministic and seed dependent', () => {
    const csv = (seed: number) => {
      const sim = make(seed);
      sim.run(30);
      return sim.data.toCSV();
    };
    expect(csv(2)).toBe(csv(2));
    expect(csv(2)).not.toBe(csv(3));
  });

  it('draws ages below maximumAge and wealth in [0,1)', () => {
    const sim = make(1, { individualCount: 200, maximumAge: 7 });
    for (const i of sim.scape('Individuals') as unknown as Iterable<Individual>) {
      expect(i.age).toBeGreaterThanOrEqual(0);
      expect(i.age).toBeLessThan(7);
      expect(i.wealth).toBeGreaterThanOrEqual(0);
      expect(i.wealth).toBeLessThan(1);
    }
  });

  it('keeps at most one individual per block and never changes ages', () => {
    const sim = make(4);
    const people = sim.scape('Individuals') as unknown as Iterable<Individual>;
    const ages = [...people].map((i) => i.age);
    sim.run(40);
    expect([...people].map((i) => i.age)).toEqual(ages);
    for (const b of sim.scape('City') as GridScape<Block>)
      expect(b.occupants.length).toBeLessThanOrEqual(1);
  });

  it('clusters same-aged individuals', () => {
    const sim = make(1);
    const start = sim.data.latest('Same-age neighbour.mean');
    sim.run(200);
    expect(sim.data.latest('Same-age neighbour.mean')).toBeGreaterThan(start);
    expect(sim.data.latest('Same-age neighbour.mean')).toBeGreaterThan(0.6);
  });

  it('views refer to existing series', () => {
    for (const v of make().views) {
      if (v.type === 'timeSeries')
        for (const id of v.series) expect(() => make().data.get(id)).not.toThrow();
    }
  });
});
