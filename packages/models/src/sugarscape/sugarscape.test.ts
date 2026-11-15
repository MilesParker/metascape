// SPDX-License-Identifier: EPL-2.0
import { RootScape, type ParameterValues, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { gini, sugarscape, type SugarCell, type Walker } from './sugarscape';

type Params = Partial<ParameterValues<typeof sugarscape.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new RootScape(sugarscape, { seed, parameters });
const land = (root: RootScape<typeof sugarscape.parameters>) =>
  root.findScape('land') as Scape<SugarCell>;
const agents = (root: RootScape<typeof sugarscape.parameters>) =>
  root.findScape('agents') as Scape<Walker>;

describe('sugarscape', () => {
  it('runs 200 iterations with default parameters', () => {
    const root = make();
    expect(root.run(200)).toBe(200);
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
    expect(() => make({ agents: -1 })).toThrow();
    expect(() => make({ growback: 9 })).toThrow();
    expect(() => make({ visionMin: 0 })).toThrow();
    expect(() => make({ visionMin: 5, visionMax: 2 })).toThrow();
  });

  it('starts with 400 agents of the specified traits on distinct cells', () => {
    const root = make();
    const members = agents(root).members;
    expect(members).toHaveLength(400);
    for (const a of members) {
      expect(a.vision).toBeGreaterThanOrEqual(1);
      expect(a.vision).toBeLessThanOrEqual(6);
      expect(a.metabolism).toBeGreaterThanOrEqual(1);
      expect(a.metabolism).toBeLessThanOrEqual(4);
      expect(a.sugar).toBeGreaterThanOrEqual(5);
      expect(a.sugar).toBeLessThanOrEqual(25);
    }
    expect(new Set(members.map((a) => a.hostCell)).size).toBe(400);
  });

  it('keeps the invariants of the rules every iteration', () => {
    const root = make();
    const cells = land(root).members;
    const capacity = cells.reduce((total, c) => total + c.capacity, 0);
    expect(Math.max(...cells.map((c) => c.capacity))).toBe(4);
    expect(Math.min(...cells.map((c) => c.capacity))).toBe(0);
    for (let i = 0; i < 100; i++) {
      root.iterate();
      expect(cells.reduce((total, c) => total + c.sugar, 0)).toBeLessThanOrEqual(capacity);
      for (const c of cells) {
        expect(c.sugar).toBeLessThanOrEqual(c.capacity);
        expect(c.occupants.length).toBeLessThanOrEqual(1);
      }
      for (const a of agents(root).members) expect(a.sugar).toBeGreaterThan(0);
    }
  });

  it('thins the population towards a stable carrying capacity', () => {
    const root = make();
    root.run(300);
    const population = root.data.values('population');
    expect(population[0]).toBe(400);
    const at = (period: number) => population[period]!;
    expect(at(100)).toBeLessThan(380);
    expect(at(300)).toBeLessThan(300);
    expect(at(300)).toBeGreaterThan(100);
    // Stable: little change over the last 100 periods.
    expect(Math.abs(at(300) - at(200))).toBeLessThanOrEqual(0.1 * at(300));
  });

  it('selects for vision and low metabolism', () => {
    const root = make();
    const start = root.data.latest('vision.mean');
    const startMetabolism = root.data.latest('metabolism.mean');
    root.run(200);
    expect(root.data.latest('vision.mean')).toBeGreaterThan(start);
    expect(root.data.latest('metabolism.mean')).toBeLessThan(startMetabolism);
  });

  it('keeps the population constant with replacement and ages agents out', () => {
    const root = make({ replacement: true });
    root.run(150);
    expect(root.data.latest('population')).toBe(400);
    for (const a of agents(root).members) expect(a.age).toBeLessThanOrEqual(100);
  });

  it('computes the Gini coefficient', () => {
    expect(gini(Float64Array.of(5, 5, 5, 5), 4)).toBeCloseTo(0);
    expect(gini(Float64Array.of(0, 0, 0, 10), 4)).toBeCloseTo(0.75);
    expect(gini(new Float64Array(0), 0)).toBe(0);
    const root = make();
    const g = root.data.latest('gini');
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
});
