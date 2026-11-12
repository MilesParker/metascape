// SPDX-License-Identifier: EPL-2.0
import { ParameterError, Simulation, type GridScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { MAX_RADIUS, norms, RING_SIZE, type NormCell } from './norms';

type Params = Partial<Simulation<typeof norms.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new Simulation(norms, { seed, parameters });
const cells = (sim: Simulation) => [...sim.scape('Norm Model')] as NormCell[];

describe('Norms', () => {
  it('runs 100 ticks with defaults', () => {
    const sim = make();
    expect(sim.run(100)).toBe(100);
    expect(cells(sim)).toHaveLength(RING_SIZE);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(40);
      return sim.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('starts with radii in 1..initMaxRadius-1 and a roughly even split of norms', () => {
    const sim = make(5, { initMaxRadius: 10 });
    for (const cell of cells(sim)) {
      expect(cell.radius).toBeGreaterThanOrEqual(1);
      expect(cell.radius).toBeLessThanOrEqual(9);
    }
    const zeros = sim.data.latest('strategy0');
    expect(zeros + sim.data.latest('strategy1')).toBe(RING_SIZE);
    expect(zeros).toBeGreaterThan(60);
    expect(zeros).toBeLessThan(130);
  });

  it('keeps radii within 1..max and norms binary', () => {
    const sim = make(4, { initMaxRadius: 95 });
    for (let t = 0; t < 60; t++) {
      sim.step();
      for (const cell of cells(sim)) {
        expect(cell.radius).toBeGreaterThanOrEqual(1);
        expect(cell.radius).toBeLessThanOrEqual(MAX_RADIUS);
        expect([0, 1]).toContain(cell.strategy);
      }
    }
  });

  it('samples a ring: radius r covers 2r+1 cells, wrapping at the ends', () => {
    const sim = make(1, { initMaxRadius: 1 });
    const grid = sim.scape('Norm Model') as unknown as GridScape<NormCell>;
    const first = cells(sim)[0] as NormCell;
    const near = grid.within(first, 2, { metric: 'chebyshev', includeSelf: true });
    expect(near).toHaveLength(5);
    expect(near.map((c) => c.x).sort((a, b) => a - b)).toEqual([
      0,
      1,
      2,
      RING_SIZE - 2,
      RING_SIZE - 1,
    ]);
  });

  it('keeps unanimous norms without noise (lock-in)', () => {
    const sim = make(3, { lockIn: true, ambientNoise: 0 });
    expect(sim.data.latest('strategy0')).toBe(RING_SIZE);
    sim.run(80);
    expect(sim.data.latest('strategy0')).toBe(RING_SIZE);
    expect(sim.data.latest('strategy1')).toBe(0);
  });

  it('shrinks the sampling radius: agents learn to be thoughtless', () => {
    const sim = make(1, { lockIn: true });
    const start = sim.data.latest('radius.mean');
    sim.run(100);
    expect(sim.data.latest('radius.mean')).toBeLessThan(start / 2);
    expect(sim.data.latest('strategy0')).toBeGreaterThan(150);
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { ambientNoise: 2 })).toThrow(ParameterError);
    expect(() => make(1, { initMaxRadius: 0 })).toThrow(ParameterError);
  });

  it('declares only series that its views use', () => {
    const sim = make();
    const known = new Set(sim.data.series.map((s) => s.id));
    expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
    for (const view of sim.views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
  });
});
