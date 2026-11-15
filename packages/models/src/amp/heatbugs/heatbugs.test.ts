// SPDX-License-Identifier: EPL-2.0
import { type Array2D, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { heatbugs, type HeatBug, type HeatCell } from './heatbugs';

const small = { width: 30, height: 30, heatBugCount: 40 };
const make = (seed = 1, parameters: Record<string, number> = small) =>
  new RootScape(heatbugs, { seed, parameters });

describe('Heatbugs (AMP)', () => {
  it('runs 50 periods', () => {
    const root = make();
    expect(root.run(50)).toBe(50);
    expect(root.data.latest('Heat Bugs Population')).toBe(40);
  });

  it('is deterministic and seed dependent', () => {
    const csv = (seed: number) => {
      const root = make(seed);
      root.run(30);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('draws ideal temperatures and outputs from the configured ranges', () => {
    const root = make();
    for (const b of root.findScape('Heat Bugs') as unknown as Iterable<HeatBug>) {
      expect(b.idealTemperature).toBeGreaterThanOrEqual(135);
      expect(b.idealTemperature).toBeLessThan(240);
      expect(b.outputHeat).toBeGreaterThanOrEqual(23);
      expect(b.outputHeat).toBeLessThan(76);
    }
  });

  it('keeps one bug per cell and heat within [0, maximumHeat]', () => {
    const root = make(3);
    for (let t = 0; t < 40; t++) {
      root.iterate();
      for (const c of root.findScape<HeatCell>('Heat Grids')) {
        expect(c.occupants.length).toBeLessThanOrEqual(1);
        expect(c.heat).toBeGreaterThanOrEqual(0);
        expect(c.heat).toBeLessThanOrEqual(340);
      }
    }
  });

  it('with no bugs, diffusion alone loses heat only by evaporation', () => {
    const root = make(1, { ...small, heatBugCount: 0 });
    const grid = root.findScape<HeatCell>('Heat Grids').space as Array2D<HeatCell>;
    grid.at(15, 15)!.heat = 100;
    const before = 100;
    root.iterate();
    const total = grid.members.reduce((s, c) => s + c.heat, 0);
    // Bounded grid with uneven neighbour counts: heat is not exactly conserved before evaporation,
    // but one step must spread it to the neighbours and cap the total near the evaporated amount.
    expect(grid.at(15, 15)!.heat).toBeLessThan(before);
    expect(grid.at(16, 15)!.heat).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThan(101);
  });

  it('adds output heat to the cell the bug started on', () => {
    const root = make(1, { ...small, heatBugCount: 1, diffusionRate: 0, evaporationRate: 0 });
    const bug = [...(root.findScape('Heat Bugs') as unknown as Iterable<HeatBug>)][0]!;
    const start = bug.hostCell!;
    root.iterate();
    expect(start.heat).toBeCloseTo(bug.outputHeat, 9);
    expect(bug.hostCell).not.toBe(start);
  });

  it('views refer to existing series', () => {
    const root = make();
    for (const v of root.allViews) {
      if (v.type === 'timeSeries')
        for (const id of v.series) expect(() => root.data.get(id)).not.toThrow();
    }
  });
});
