// SPDX-License-Identifier: EPL-2.0
import { RootScape, type ParameterValues, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { schelling, type Resident, type SchellingCell } from './schelling';

type Params = Partial<ParameterValues<typeof schelling.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new RootScape(schelling, { seed, parameters });

describe('schelling', () => {
  it('runs 200 iterations with default parameters', () => {
    const root = make();
    root.run(200);
    expect(root.period).toBeGreaterThan(0);
    expect(root.period).toBeLessThanOrEqual(200);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const root = make({}, seed);
      root.run(10);
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
    expect(() => make({ tolerance: 1.2 })).toThrow();
    expect(() => make({ density: -0.1 })).toThrow();
    expect(() => make({ ratio: 2 })).toThrow();
    expect(() => make({ width: 0 })).toThrow();
  });

  it('settles with nobody unhappy and more like neighbors than at the start', () => {
    const root = make({ tolerance: 0.3 });
    const startLike = root.data.latest('like.mean');
    expect(root.data.latest('unhappy')).toBeGreaterThan(0);
    root.run(1000);
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toMatch(/unhappy/i);
    expect(root.data.latest('unhappy')).toBe(0);
    expect(root.data.latest('like.mean')).toBeGreaterThan(startLike);
  });

  it('conserves the agents and keeps one per cell', () => {
    const root = make({ tolerance: 0.3 });
    const residents = root.findScape('residents') as Scape<Resident>;
    const cells = root.findScape<SchellingCell>('town').members;
    const total = residents.size;
    expect(total).toBe(Math.round(0.9 * 40 * 40));
    for (let i = 0; i < 30; i++) {
      root.iterate();
      expect(residents.size).toBe(total);
    }
    expect(cells.filter((c) => !c.isAvailable)).toHaveLength(total);
    expect(cells.every((c) => c.occupants.length <= 1)).toBe(true);
    expect(cells.filter((c) => c.freeIndex >= 0)).toHaveLength(cells.length - total);
  });

  it('splits the groups according to the ratio', () => {
    const root = make({ ratio: 0.25 });
    const residents = root.findScape<Resident>('residents').members;
    const first = residents.filter((r) => r.group === 0).length;
    expect(first).toBe(Math.round(0.25 * residents.length));
  });
});
