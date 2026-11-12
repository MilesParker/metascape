// SPDX-License-Identifier: EPL-2.0
import { ParameterError, Simulation, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { boids, type Boid } from './boids';
import type { ContinuousScape } from '@metascape/engine';

const make = (
  seed: number | string = 1,
  parameters: Partial<Simulation<typeof boids.parameters>['parameters']> = {},
) => new Simulation(boids, { seed, parameters });

describe('boids', () => {
  it('runs 200 ticks with defaults', () => {
    const sim = make();
    expect(sim.run(200)).toBe(200);
    expect(sim.data.latest('polarization')).toBeGreaterThanOrEqual(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(50);
      return sim.data.toCSV();
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  it('only references recorded series and distributions in its views', () => {
    const sim = make();
    const known = new Set(sim.data.series.map((s) => s.id));
    const views: ViewSpec[] = boids.views!(sim);
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
    expect(() => make(1, { count: 1 })).toThrow(ParameterError);
    expect(() => make(1, { vision: 0 })).toThrow(ParameterError);
    expect(() => make(1, { maxTurn: 10 })).toThrow(ParameterError);
  });

  it('aligns: polarization rises well above its initial value', () => {
    const sim = make(3);
    const initial = sim.data.latest('polarization');
    sim.run(300);
    expect(sim.data.latest('polarization')).toBeGreaterThan(Math.max(0.7, initial + 0.4));
  });

  it('never exceeds the maximum speed and stays inside the space', () => {
    const sim = make(5, { maxSpeed: 1.5 });
    const scape = sim.scape('boids') as unknown as ContinuousScape<Boid>;
    for (let t = 0; t < 100; t++) {
      sim.step();
      for (const boid of scape.members) {
        expect(Math.hypot(boid.vx, boid.vy)).toBeLessThanOrEqual(1.5 + 1e-9);
        expect(boid.x).toBeGreaterThanOrEqual(0);
        expect(boid.x).toBeLessThan(scape.width);
        expect(boid.y).toBeGreaterThanOrEqual(0);
        expect(boid.y).toBeLessThan(scape.height);
      }
    }
  });
});
