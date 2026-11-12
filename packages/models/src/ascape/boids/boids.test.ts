// SPDX-License-Identifier: EPL-2.0
import { Simulation } from '@metascape/engine';
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
  new Simulation(boidsAscape, { seed, parameters });
const worldOf = (sim: Simulation): BoidsWorld => sim.scape(WORLD) as unknown as BoidsWorld;
const boidsOf = (sim: Simulation): Boid[] =>
  worldOf(sim).members.filter((a): a is Boid => a instanceof Boid);

describe('Boids (Ascape)', () => {
  it('is registered in its family', () => {
    expect(family.models).toEqual([boidsAscape]);
    expect(family.id).toBe('ascape-boids');
  });

  it('starts with 25 red and 25 blue boids, no obstacles, legacy defaults', () => {
    const sim = make();
    const boids = boidsOf(sim);
    expect(boids.filter((b) => b.team === 'red')).toHaveLength(25);
    expect(boids.filter((b) => b.team === 'blue')).toHaveLength(25);
    expect(worldOf(sim).members.filter((a) => a instanceof Obstacle)).toHaveLength(0);
    for (const b of boids) {
      expect(b.velocity).toBe(1);
      expect(b.heading).toBeGreaterThanOrEqual(0);
      expect(b.heading).toBeLessThan(2 * Math.PI);
    }
  });

  it('runs 50 ticks and records every series its views use', () => {
    const sim = make();
    expect(sim.run(50)).toBe(50);
    const known = new Set(sim.data.series.map((s) => s.id));
    for (const view of sim.views) {
      if (view.type === 'timeSeries')
        for (const id of view.series) expect(known.has(id)).toBe(true);
    }
    expect(sim.views.some((v) => v.type === 'continuous')).toBe(true);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(40);
      return sim.data.toCSV();
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('keeps the population, stays in the world and moves one unit a tick', () => {
    const sim = make(5);
    const before = new Map(boidsOf(sim).map((b) => [b, { x: b.x, y: b.y }]));
    sim.step();
    for (const b of boidsOf(sim)) {
      const was = before.get(b)!;
      expect(periodicDistance(was, b)).toBeCloseTo(1, 6);
    }
    for (let t = 0; t < 100; t++) {
      sim.step();
      expect(boidsOf(sim)).toHaveLength(50);
      for (const b of boidsOf(sim)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThan(WORLD_SIZE);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThan(WORLD_SIZE);
      }
    }
  });

  it('never turns red boids when there are no obstacles', () => {
    const sim = make(6);
    const start = new Map(boidsOf(sim).map((b) => [b, b.heading]));
    sim.run(60);
    for (const b of boidsOf(sim)) {
      if (b.team === 'red') expect(b.heading).toBe(start.get(b));
    }
  });

  it('flocks the blue team: team-mates end up much closer than the red ones', () => {
    for (const seed of [1, 2, 3]) {
      const sim = make(seed);
      sim.run(100);
      expect(sim.data.latest('blueNearestMate')).toBeLessThan(
        0.7 * sim.data.latest('redNearestMate'),
      );
    }
  });

  it('aligns blue headings early on', () => {
    const sim = make(1);
    sim.run(50);
    expect(sim.data.latest('bluePolarization')).toBeGreaterThan(0.6);
  });

  it('steers diametrically away from the nearest obstacle in range', () => {
    const sim = make(1, { numRedBoids: 1, numBlueBoids: 0 });
    const boid = boidsOf(sim)[0]!;
    boid.moveTo(10, 10);
    boid.heading = 0;
    placeObstacle(sim, 11, 10);
    placeObstacle(sim, 10, 12);
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
    const sim = make(1, { numRedBoids: 1, numBlueBoids: 0 });
    const boid = boidsOf(sim)[0]!;
    boid.moveTo(10, 10);
    boid.heading = 0;
    placeObstacle(sim, 11, 10);
    sim.step();
    expect(boid.x).toBeCloseTo(9, 9);
    expect(boid.y).toBeCloseTo(10, 9);
  });

  it('applies the steering priorities: collision beats cohesion beats alignment', () => {
    const sim = make(1, { numRedBoids: 0, numBlueBoids: 3 });
    const [a, b, c] = boidsOf(sim) as [Boid, Boid, Boid];
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
