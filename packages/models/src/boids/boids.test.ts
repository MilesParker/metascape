// SPDX-License-Identifier: EPL-2.0
import { ParameterError, RootScape, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { boids, type Boid } from './boids';
import type { Continuous2D } from '@metascape/engine';

const make = (
  seed: number | string = 1,
  parameters: Partial<RootScape<typeof boids.parameters>['parameters']> = {},
) => new RootScape(boids, { seed, parameters });

describe('boids', () => {
  it('runs 200 iterations with defaults', () => {
    const root = make();
    expect(root.run(200)).toBe(200);
    expect(root.data.latest('polarization')).toBeGreaterThanOrEqual(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(50);
      return root.data.toCSV();
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
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
    expect(() => make(1, { count: 1 })).toThrow(ParameterError);
    expect(() => make(1, { vision: 0 })).toThrow(ParameterError);
    expect(() => make(1, { maxTurn: 10 })).toThrow(ParameterError);
  });

  it('aligns: polarization rises well above its initial value', () => {
    const root = make(3);
    const initial = root.data.latest('polarization');
    root.run(300);
    expect(root.data.latest('polarization')).toBeGreaterThan(Math.max(0.7, initial + 0.4));
  });

  it('never exceeds the maximum speed and stays inside the space', () => {
    const root = make(5, { maxSpeed: 1.5 });
    const scape = root.findScape('boids').space as unknown as Continuous2D<Boid>;
    for (let t = 0; t < 100; t++) {
      root.iterate();
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
