// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  Boid,
  boidsAscape,
  Obstacle,
  periodicDistance,
  placeObstacle,
  WORLD,
  WORLD_SIZE,
  type BoidsWorld,
} from './boids';
import { family } from './index';

const make = (seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new RootScape(boidsAscape, { seed, parameters });
const worldOf = (root: RootScape): BoidsWorld => root.findScape(WORLD) as unknown as BoidsWorld;
const boidsOf = (root: RootScape): Boid[] =>
  worldOf(root).members.filter((a): a is Boid => a instanceof Boid);

describe('Boids (Ascape)', () => {
  it('is registered in its family', () => {
    expect(family.models).toEqual([boidsAscape]);
    expect(family.id).toBe('ascape-boids');
  });

  it('starts with 25 red and 25 blue boids, no obstacles, legacy defaults', () => {
    const root = make();
    const boids = boidsOf(root);
    expect(boids.filter((b) => b.team === 'red')).toHaveLength(25);
    expect(boids.filter((b) => b.team === 'blue')).toHaveLength(25);
    expect(worldOf(root).members.filter((a) => a instanceof Obstacle)).toHaveLength(0);
    for (const b of boids) {
      expect(b.velocity).toBe(1);
      expect(b.heading).toBeGreaterThanOrEqual(0);
      expect(b.heading).toBeLessThan(2 * Math.PI);
    }
  });

  it('runs 50 periods and records every series its views use', () => {
    const root = make();
    expect(root.run(50)).toBe(50);
    const known = new Set(root.data.series.map((s) => s.id));
    for (const view of root.allViews) {
      if (view.type === 'timeSeries')
        for (const id of view.series) expect(known.has(id)).toBe(true);
    }
    expect(root.allViews.some((v) => v.type === 'continuous')).toBe(true);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(40);
      return root.data.toCSV();
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('keeps the population, stays in the world and moves one unit a period', () => {
    const root = make(5);
    const before = new Map(boidsOf(root).map((b) => [b, { x: b.x, y: b.y }]));
    root.iterate();
    for (const b of boidsOf(root)) {
      const was = before.get(b)!;
      expect(periodicDistance(was, b)).toBeCloseTo(1, 6);
    }
    for (let t = 0; t < 100; t++) {
      root.iterate();
      expect(boidsOf(root)).toHaveLength(50);
      for (const b of boidsOf(root)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThan(WORLD_SIZE);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThan(WORLD_SIZE);
      }
    }
  });

  it('never turns red boids when there are no obstacles', () => {
    const root = make(6);
    const start = new Map(boidsOf(root).map((b) => [b, b.heading]));
    root.run(60);
    for (const b of boidsOf(root)) {
      if (b.team === 'red') expect(b.heading).toBe(start.get(b));
    }
  });

  it('flocks the blue team: team-mates end up much closer than the red ones', () => {
    for (const seed of [1, 2, 3]) {
      const root = make(seed);
      root.run(100);
      expect(root.data.latest('blueNearestMate')).toBeLessThan(
        0.7 * root.data.latest('redNearestMate'),
      );
    }
  });

  it('aligns blue headings early on', () => {
    const root = make(1);
    root.run(50);
    expect(root.data.latest('bluePolarization')).toBeGreaterThan(0.6);
  });

  it('steers diametrically away from the nearest obstacle in range', () => {
    const root = make(1, { numRedBoids: 1, numBlueBoids: 0 });
    const boid = boidsOf(root)[0]!;
    boid.moveTo(10, 10);
    boid.heading = 0;
    placeObstacle(root, 11, 10);
    placeObstacle(root, 10, 12);
    boid.avoidObstacles();
    expect(boid.heading).toBeCloseTo(Math.PI, 9);
    expect(boid.prioritySet).toBe(true);
    // Out of range: nothing happens.
    const far = make(1, { numRedBoids: 1, numBlueBoids: 0 });
    const lone = boidsOf(far)[0]!;
    lone.moveTo(10, 10);
    lone.heading = 0.5;
    placeObstacle(far, 20, 20);
    lone.avoidObstacles();
    expect(lone.heading).toBe(0.5);
    expect(lone.prioritySet).toBe(false);
  });

  it('moves a red boid away from an obstacle during a step', () => {
    const root = make(1, { numRedBoids: 1, numBlueBoids: 0 });
    const boid = boidsOf(root)[0]!;
    boid.moveTo(10, 10);
    boid.heading = 0;
    placeObstacle(root, 11, 10);
    root.iterate();
    expect(boid.x).toBeCloseTo(9, 9);
    expect(boid.y).toBeCloseTo(10, 9);
  });

  it('applies the steering priorities: collision beats cohesion beats alignment', () => {
    const root = make(1, { numRedBoids: 0, numBlueBoids: 3 });
    const [a, b, c] = boidsOf(root) as [Boid, Boid, Boid];
    a.moveTo(10, 10);
    b.moveTo(10.5, 10);
    c.moveTo(14, 10);
    a.heading = 1;
    a.prioritySet = false;
    a.avoidCollisions();
    expect(a.heading).toBeCloseTo(Math.PI, 9);
    // Priority already claimed: cohesion and alignment do nothing.
    const before = a.heading;
    a.cohesion();
    a.alignHeading();
    expect(a.heading).toBe(before);
    // Cohesion: lone boid 10 away from its single mate heads toward it.
    const sim2 = make(1, { numRedBoids: 0, numBlueBoids: 2 });
    const [d, e] = boidsOf(sim2) as [Boid, Boid];
    d.moveTo(10, 10);
    e.moveTo(20, 10);
    d.heading = 3;
    d.cohesion();
    expect(d.heading).toBeCloseTo(0, 9);
    expect(d.prioritySet).toBe(true);
    // Alignment: averages own heading with the mate's when close enough to align but not to clump.
    const sim3 = make(1, { numRedBoids: 0, numBlueBoids: 2 });
    const [f, g] = boidsOf(sim3) as [Boid, Boid];
    f.moveTo(10, 10);
    g.moveTo(12, 10);
    f.heading = 0;
    g.heading = 1;
    f.cohesion();
    expect(f.prioritySet).toBe(false);
    f.alignHeading();
    expect(f.heading).toBeCloseTo(0.5, 9);
    expect(f.prioritySet).toBe(true);
  });

  it('measures distance around the wrap', () => {
    expect(periodicDistance({ x: 1, y: 1 }, { x: 49, y: 1 })).toBeCloseTo(2, 9);
    expect(periodicDistance({ x: 49, y: 49 }, { x: 1, y: 1 })).toBeCloseTo(Math.SQRT2 * 2, 9);
  });
});
