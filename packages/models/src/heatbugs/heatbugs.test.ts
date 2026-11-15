// SPDX-License-Identifier: EPL-2.0
import { RootScape, type ParameterValues } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { heatbugs, type HeatBug, type HeatCell } from './heatbugs';

type Params = Partial<ParameterValues<typeof heatbugs.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new RootScape(heatbugs, { seed, parameters });

describe('heatbugs', () => {
  it('runs 200 iterations with default parameters', () => {
    expect(make().run(200)).toBe(200);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const root = make({}, seed);
      root.run(40);
      return root.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
  });

  it('only refers to existing series and distributions in its views', () => {
    const root = make();
    const views = root.allViews;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(() => root.data.get(id)).not.toThrow();
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make({ randomMove: 2 })).toThrow();
    expect(() => make({ diffusionRate: -0.1 })).toThrow();
    expect(() => make({ bugs: -5 })).toThrow();
    expect(() => make({ idealMin: 50, idealMax: 10 })).toThrow();
  });

  it('reduces mean unhappiness over the first 200 iterations and never makes negative heat', () => {
    const root = make();
    const cells = root.findScape<HeatCell>('lattice').members;
    const start = root.data.latest('unhappiness.mean');
    for (let i = 0; i < 200; i++) {
      root.iterate();
      for (const cell of cells) expect(cell.heat).toBeGreaterThanOrEqual(0);
    }
    const series = root.data.values('unhappiness.mean');
    const late = series.slice(-20).reduce((a, b) => a + b, 0) / 20;
    expect(late).toBeLessThan(start * 0.8);
    expect(root.data.latest('heat.sum')).toBeGreaterThan(0);
  });

  it('keeps bugs on distinct cells and conserves their number', () => {
    const root = make();
    root.run(50);
    const bugs = root.findScape<HeatBug>('bugs').members;
    expect(bugs).toHaveLength(200);
    expect(new Set(bugs.map((bug) => bug.hostCell)).size).toBe(200);
  });
});
