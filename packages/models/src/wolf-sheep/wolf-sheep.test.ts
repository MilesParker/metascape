// SPDX-License-Identifier: EPL-2.0
import { ParameterError, RootScape, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { wolfSheep, type Patch } from './wolf-sheep';

type Params = Partial<RootScape<typeof wolfSheep.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new RootScape(wolfSheep, { seed, parameters });

describe('wolf sheep predation', () => {
  it('runs 200 iterations with defaults', () => {
    const root = make();
    root.run(200);
    expect(root.period).toBeGreaterThan(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(100);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    const views: readonly ViewSpec[] = root.allViews;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { sheepReproduce: 2 })).toThrow(ParameterError);
    expect(() => make(1, { grassRegrowth: 0 })).toThrow(ParameterError);
    expect(() => make(1, { initialWolves: -1 })).toThrow(ParameterError);
  });

  it('keeps counts equal to scape sizes and leaves no dead animal on a cell', () => {
    const root = make(5);
    const grid = root.findScape<Patch>('grass');
    for (let t = 0; t < 120; t++) {
      root.iterate();
      expect(root.data.latest('sheep')).toBe(root.findScape('sheep').size);
      expect(root.data.latest('wolves')).toBe(root.findScape('wolves').size);
      expect(root.data.latest('grass')).toBe(grid.count((patch) => patch.grown));
      let animals = 0;
      for (const patch of grid.members) {
        for (const occupant of patch.occupants) {
          expect(occupant.alive).toBe(true);
          animals++;
        }
      }
      expect(animals).toBe(root.findScape('sheep').size + root.findScape('wolves').size);
      if (root.stopped) break;
    }
  });

  it('never grows the sheep population without wolves or sheep reproduction', () => {
    const root = make(8, { initialWolves: 0, sheepReproduce: 0 });
    root.run(100);
    const sheep = root.data.values('sheep');
    for (let i = 1; i < sheep.length; i++) expect(sheep[i]!).toBeLessThanOrEqual(sheep[i - 1]!);
  });

  it('stops when every animal is gone', () => {
    const root = make(3, { initialWolves: 0, initialSheep: 0 });
    root.run(10);
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toBe('all animals are gone');
  });
});
