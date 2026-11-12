// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import type { Bug, Habitat } from './stupid-model';

const small = { width: 20, height: 20, bugCount: 30, bugVision: 3 };

describe('StupidModel family', () => {
  it.each(family.models.map((m) => [m.name, m] as const))('%s runs 30 ticks', (_name, model) => {
    const sim = new Simulation(model, { seed: 1, parameters: small });
    expect(sim.run(30)).toBe(30);
    expect(sim.data.latest('Bugs Population')).toBe(30);
  });

  it.each(family.models.map((m) => [m.name, m] as const))('%s is deterministic', (_n, model) => {
    const csv = (seed: number) => {
      const sim = new Simulation(model, { seed, parameters: small });
      sim.run(20);
      return sim.data.toCSV() + sim.scapes.flatMap((s) => [...s]).length;
    };
    expect(csv(3)).toBe(csv(3));
    const positions = (seed: number) => {
      const sim = new Simulation(model, { seed, parameters: small });
      sim.run(5);
      return [...sim.scape('Bugs')]
        .map((b) => `${(b as Bug).cell?.x},${(b as Bug).cell?.y}`)
        .join(';');
    };
    expect(positions(3)).not.toBe(positions(4));
  });

  it('keeps one bug per cell and moves at most bugVision cells', () => {
    const sim = new Simulation(family.models[0]!, { seed: 2, parameters: small });
    const grid = sim.scape('Habitats') as GridScape<Habitat>;
    const bugs = sim.scape('Bugs') as unknown as Iterable<Bug>;
    for (let t = 0; t < 20; t++) {
      const before = new Map([...bugs].map((b) => [b, b.cell!]));
      sim.step();
      for (const b of bugs) {
        expect(grid.distance(before.get(b)!, b.cell!, 'chebyshev')).toBeLessThanOrEqual(3);
      }
      for (const cell of grid) expect(cell.occupants.length).toBeLessThanOrEqual(1);
    }
  });

  it('grows bugs by one per tick in models 2 and 3', () => {
    for (const model of [family.models[1]!, family.models[2]!]) {
      const sim = new Simulation(model, { seed: 1, parameters: small });
      sim.run(12);
      expect(sim.data.latest('Bug size.mean')).toBe(12);
    }
  });

  it('model 1 has no size and no food', () => {
    const sim = new Simulation(family.models[0]!, { seed: 1, parameters: small });
    expect(() => sim.data.get('Bug size.mean')).toThrow();
  });

  it('model 3 habitats accumulate food at about 0.005 per tick', () => {
    const sim = new Simulation(family.models[2]!, { seed: 1, parameters: small });
    sim.run(100);
    expect(sim.data.latest('Food.mean')).toBeGreaterThan(0.4);
    expect(sim.data.latest('Food.mean')).toBeLessThan(0.6);
  });

  it('model 5 conserves food: produced = remaining + eaten', () => {
    const sim = new Simulation(family.models[3]!, { seed: 5, parameters: small });
    sim.run(40);
    const bugs = sim.scape('Bugs') as unknown as Iterable<Bug>;
    let eaten = 0;
    for (const b of bugs) {
      expect(b.size).toBeLessThanOrEqual(40 * 0.2 + 1e-9);
      eaten += b.size;
    }
    expect(eaten).toBeGreaterThan(0);
    const food = sim.data.latest('Food.mean') * 400;
    // Expected production 0.25 per cell per tick over 40 ticks, give or take noise.
    expect(food + eaten).toBeGreaterThan(0.25 * 400 * 40 * 0.9);
    expect(food + eaten).toBeLessThan(0.25 * 400 * 40 * 1.1);
  });

  it('views refer to existing series', () => {
    for (const model of family.models) {
      const sim = new Simulation(model, { seed: 1, parameters: small });
      for (const v of sim.views) {
        if (v.type === 'timeSeries')
          for (const id of v.series) expect(() => sim.data.get(id)).not.toThrow();
      }
    }
  });
});
