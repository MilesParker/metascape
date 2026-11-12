// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type ParameterValues, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { heatbugs, type HeatBug, type HeatCell } from './heatbugs';

type Params = Partial<ParameterValues<typeof heatbugs.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new Simulation(heatbugs, { seed, parameters });

describe('heatbugs', () => {
  it('runs 200 ticks with default parameters', () => {
    expect(make().run(200)).toBe(200);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const sim = make({}, seed);
      sim.run(40);
      return sim.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
  });

  it('only refers to existing series and distributions in its views', () => {
    const sim = make();
    const views = heatbugs.views!(sim);
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
    expect(() => make({ randomMove: 2 })).toThrow();
    expect(() => make({ diffusionRate: -0.1 })).toThrow();
    expect(() => make({ bugs: -5 })).toThrow();
    expect(() => make({ idealMin: 50, idealMax: 10 })).toThrow();
  });

  it('reduces mean unhappiness over the first 200 ticks and never makes negative heat', () => {
    const sim = make();
    const cells = (sim.scape('world') as GridScape<HeatCell>).members;
    const start = sim.data.latest('unhappiness.mean');
    for (let tick = 0; tick < 200; tick++) {
      sim.step();
      for (const cell of cells) expect(cell.heat).toBeGreaterThanOrEqual(0);
    }
    const series = sim.data.values('unhappiness.mean');
    const late = series.slice(-20).reduce((a, b) => a + b, 0) / 20;
    expect(late).toBeLessThan(start * 0.8);
    expect(sim.data.latest('heat.sum')).toBeGreaterThan(0);
  });

  it('keeps bugs on distinct cells and conserves their number', () => {
    const sim = make();
    sim.run(50);
    const bugs = (sim.scape('bugs') as Scape<HeatBug>).members;
    expect(bugs).toHaveLength(200);
    expect(new Set(bugs.map((bug) => bug.cell)).size).toBe(200);
  });
});
