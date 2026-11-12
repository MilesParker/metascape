// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type ParameterValues, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { schelling, type Resident, type SchellingCell } from './schelling';

type Params = Partial<ParameterValues<typeof schelling.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new Simulation(schelling, { seed, parameters });

describe('schelling', () => {
  it('runs 200 ticks with default parameters', () => {
    const sim = make();
    sim.run(200);
    expect(sim.tick).toBeGreaterThan(0);
    expect(sim.tick).toBeLessThanOrEqual(200);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const sim = make({}, seed);
      sim.run(10);
      return sim.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
  });

  it('only refers to existing series and distributions in its views', () => {
    const sim = make();
    const views = schelling.views!(sim);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(() => sim.data.get(id)).not.toThrow();
      }
      if (view.type === 'histogram') {
        expect(() => sim.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make({ tolerance: 1.2 })).toThrow();
    expect(() => make({ density: -0.1 })).toThrow();
    expect(() => make({ ratio: 2 })).toThrow();
    expect(() => make({ width: 0 })).toThrow();
  });

  it('settles with nobody unhappy and more like neighbors than at the start', () => {
    const sim = make({ tolerance: 0.3 });
    const startLike = sim.data.latest('like.mean');
    expect(sim.data.latest('unhappy')).toBeGreaterThan(0);
    sim.run(1000);
    expect(sim.stopped).toBe(true);
    expect(sim.stopReason).toMatch(/unhappy/i);
    expect(sim.data.latest('unhappy')).toBe(0);
    expect(sim.data.latest('like.mean')).toBeGreaterThan(startLike);
  });

  it('conserves the agents and keeps one per cell', () => {
    const sim = make({ tolerance: 0.3 });
    const residents = sim.scape('residents') as Scape<Resident>;
    const cells = (sim.scape('town') as GridScape<SchellingCell>).members;
    const total = residents.size;
    expect(total).toBe(Math.round(0.9 * 40 * 40));
    for (let i = 0; i < 30; i++) {
      sim.step();
      expect(residents.size).toBe(total);
    }
    expect(cells.filter((c) => !c.isAvailable)).toHaveLength(total);
    expect(cells.every((c) => c.occupants.length <= 1)).toBe(true);
    expect(cells.filter((c) => c.freeIndex >= 0)).toHaveLength(cells.length - total);
  });

  it('splits the groups according to the ratio', () => {
    const sim = make({ ratio: 0.25 });
    const residents = (sim.scape('residents') as Scape<Resident>).members;
    const first = residents.filter((r) => r.group === 0).length;
    expect(first).toBe(Math.round(0.25 * residents.length));
  });
});
