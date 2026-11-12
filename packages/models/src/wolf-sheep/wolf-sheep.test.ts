// SPDX-License-Identifier: EPL-2.0
import { ParameterError, Simulation, type GridScape, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { wolfSheep, type Patch } from './wolf-sheep';

type Params = Partial<Simulation<typeof wolfSheep.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new Simulation(wolfSheep, { seed, parameters });

describe('wolf sheep predation', () => {
  it('runs 200 ticks with defaults', () => {
    const sim = make();
    sim.run(200);
    expect(sim.tick).toBeGreaterThan(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(100);
      return sim.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const sim = make();
    const known = new Set(sim.data.series.map((s) => s.id));
    const views: ViewSpec[] = wolfSheep.views!(sim);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => sim.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { sheepReproduce: 2 })).toThrow(ParameterError);
    expect(() => make(1, { grassRegrowth: 0 })).toThrow(ParameterError);
    expect(() => make(1, { initialWolves: -1 })).toThrow(ParameterError);
  });

  it('keeps counts equal to scape sizes and leaves no dead animal on a cell', () => {
    const sim = make(5);
    const grid = sim.scape('grass') as unknown as GridScape<Patch>;
    for (let t = 0; t < 120; t++) {
      sim.step();
      expect(sim.data.latest('sheep')).toBe(sim.scape('sheep').size);
      expect(sim.data.latest('wolves')).toBe(sim.scape('wolves').size);
      expect(sim.data.latest('grass')).toBe(grid.count((patch) => patch.grown));
      let animals = 0;
      for (const patch of grid.members) {
        for (const occupant of patch.occupants) {
          expect(occupant.alive).toBe(true);
          animals++;
        }
      }
      expect(animals).toBe(sim.scape('sheep').size + sim.scape('wolves').size);
      if (sim.stopped) break;
    }
  });

  it('never grows the sheep population without wolves or sheep reproduction', () => {
    const sim = make(8, { initialWolves: 0, sheepReproduce: 0 });
    sim.run(100);
    const sheep = sim.data.values('sheep');
    for (let i = 1; i < sheep.length; i++) expect(sheep[i]!).toBeLessThanOrEqual(sheep[i - 1]!);
  });

  it('stops when every animal is gone', () => {
    const sim = make(3, { initialWolves: 0, initialSheep: 0 });
    sim.run(10);
    expect(sim.stopped).toBe(true);
    expect(sim.stopReason).toBe('all animals are gone');
  });
});
