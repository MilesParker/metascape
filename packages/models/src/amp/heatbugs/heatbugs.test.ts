// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { heatbugs, type HeatBug, type HeatCell } from './heatbugs';

const small = { width: 30, height: 30, heatBugCount: 40 };
const make = (seed = 1, parameters: Record<string, number> = small) =>
  new Simulation(heatbugs, { seed, parameters });

describe('Heatbugs (AMP)', () => {
  it('runs 50 ticks', () => {
    const sim = make();
    expect(sim.run(50)).toBe(50);
    expect(sim.data.latest('Heat Bugs Population')).toBe(40);
  });

  it('is deterministic and seed dependent', () => {
    const csv = (seed: number) => {
      const sim = make(seed);
      sim.run(30);
      return sim.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('draws ideal temperatures and outputs from the configured ranges', () => {
    const sim = make();
    for (const b of sim.scape('Heat Bugs') as unknown as Iterable<HeatBug>) {
      expect(b.idealTemperature).toBeGreaterThanOrEqual(135);
      expect(b.idealTemperature).toBeLessThan(240);
      expect(b.outputHeat).toBeGreaterThanOrEqual(23);
      expect(b.outputHeat).toBeLessThan(76);
    }
  });

  it('keeps one bug per cell and heat within [0, maximumHeat]', () => {
    const sim = make(3);
    for (let t = 0; t < 40; t++) {
      sim.step();
      for (const c of sim.scape('Heat Grids') as GridScape<HeatCell>) {
        expect(c.occupants.length).toBeLessThanOrEqual(1);
        expect(c.heat).toBeGreaterThanOrEqual(0);
        expect(c.heat).toBeLessThanOrEqual(340);
      }
    }
  });

  it('with no bugs, diffusion alone loses heat only by evaporation', () => {
    const sim = make(1, { ...small, heatBugCount: 0 });
    const grid = sim.scape('Heat Grids') as GridScape<HeatCell>;
    grid.at(15, 15)!.heat = 100;
    const before = 100;
    sim.step();
    const total = [...grid].reduce((s, c) => s + c.heat, 0);
    // Bounded grid with uneven neighbour counts: heat is not exactly conserved before evaporation,
    // but one step must spread it to the neighbours and cap the total near the evaporated amount.
    expect(grid.at(15, 15)!.heat).toBeLessThan(before);
    expect(grid.at(16, 15)!.heat).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThan(101);
  });

  it('adds output heat to the cell the bug started on', () => {
    const sim = make(1, { ...small, heatBugCount: 1, diffusionRate: 0, evaporationRate: 0 });
    const bug = [...(sim.scape('Heat Bugs') as unknown as Iterable<HeatBug>)][0]!;
    const start = bug.cell!;
    sim.step();
    expect(start.heat).toBeCloseTo(bug.outputHeat, 9);
    expect(bug.cell).not.toBe(start);
  });

  it('views refer to existing series', () => {
    const sim = make();
    for (const v of sim.views) {
      if (v.type === 'timeSeries')
        for (const id of v.series) expect(() => sim.data.get(id)).not.toThrow();
    }
  });
});
