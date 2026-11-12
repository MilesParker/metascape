// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type ParameterValues, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { gini, sugarscape, type SugarCell, type Walker } from './sugarscape';

type Params = Partial<ParameterValues<typeof sugarscape.parameters>>;

const make = (parameters: Params = {}, seed = 1) =>
  new Simulation(sugarscape, { seed, parameters });
const land = (sim: Simulation<typeof sugarscape.parameters>) =>
  sim.scape('land') as GridScape<SugarCell>;
const agents = (sim: Simulation<typeof sugarscape.parameters>) =>
  sim.scape('agents') as Scape<Walker>;

describe('sugarscape', () => {
  it('runs 200 ticks with default parameters', () => {
    const sim = make();
    expect(sim.run(200)).toBe(200);
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
    const views = sim.views;
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
    expect(() => make({ agents: -1 })).toThrow();
    expect(() => make({ growback: 9 })).toThrow();
    expect(() => make({ visionMin: 0 })).toThrow();
    expect(() => make({ visionMin: 5, visionMax: 2 })).toThrow();
  });

  it('starts with 400 agents of the specified traits on distinct cells', () => {
    const sim = make();
    const members = agents(sim).members;
    expect(members).toHaveLength(400);
    for (const a of members) {
      expect(a.vision).toBeGreaterThanOrEqual(1);
      expect(a.vision).toBeLessThanOrEqual(6);
      expect(a.metabolism).toBeGreaterThanOrEqual(1);
      expect(a.metabolism).toBeLessThanOrEqual(4);
      expect(a.sugar).toBeGreaterThanOrEqual(5);
      expect(a.sugar).toBeLessThanOrEqual(25);
    }
    expect(new Set(members.map((a) => a.cell)).size).toBe(400);
  });

  it('keeps the invariants of the rules every tick', () => {
    const sim = make();
    const cells = land(sim).members;
    const capacity = cells.reduce((total, c) => total + c.capacity, 0);
    expect(Math.max(...cells.map((c) => c.capacity))).toBe(4);
    expect(Math.min(...cells.map((c) => c.capacity))).toBe(0);
    for (let tick = 0; tick < 100; tick++) {
      sim.step();
      expect(cells.reduce((total, c) => total + c.sugar, 0)).toBeLessThanOrEqual(capacity);
      for (const c of cells) {
        expect(c.sugar).toBeLessThanOrEqual(c.capacity);
        expect(c.occupants.length).toBeLessThanOrEqual(1);
      }
      for (const a of agents(sim).members) expect(a.sugar).toBeGreaterThan(0);
    }
  });

  it('thins the population towards a stable carrying capacity', () => {
    const sim = make();
    sim.run(300);
    const population = sim.data.values('population');
    expect(population[0]).toBe(400);
    const at = (tick: number) => population[tick]!;
    expect(at(100)).toBeLessThan(380);
    expect(at(300)).toBeLessThan(300);
    expect(at(300)).toBeGreaterThan(100);
    // Stable: little change over the last 100 ticks.
    expect(Math.abs(at(300) - at(200))).toBeLessThanOrEqual(0.1 * at(300));
  });

  it('selects for vision and low metabolism', () => {
    const sim = make();
    const start = sim.data.latest('vision.mean');
    const startMetabolism = sim.data.latest('metabolism.mean');
    sim.run(200);
    expect(sim.data.latest('vision.mean')).toBeGreaterThan(start);
    expect(sim.data.latest('metabolism.mean')).toBeLessThan(startMetabolism);
  });

  it('keeps the population constant with replacement and ages agents out', () => {
    const sim = make({ replacement: true });
    sim.run(150);
    expect(sim.data.latest('population')).toBe(400);
    for (const a of agents(sim).members) expect(a.age).toBeLessThanOrEqual(100);
  });

  it('computes the Gini coefficient', () => {
    expect(gini(Float64Array.of(5, 5, 5, 5), 4)).toBeCloseTo(0);
    expect(gini(Float64Array.of(0, 0, 0, 10), 4)).toBeCloseTo(0.75);
    expect(gini(new Float64Array(0), 0)).toBe(0);
    const sim = make();
    const g = sim.data.latest('gini');
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
});
