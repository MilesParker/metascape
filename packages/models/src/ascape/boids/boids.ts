// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.boids.BaseModel, Boid, Obstacle
// (and, for how they are drawn only, org.ascape.examples.boids.view.BoidsView).
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  colors,
  ContinuousScape,
  continuousView,
  defineModel,
  int,
  PointAgent,
  real,
  timeSeriesView,
  type Point,
  type Rule,
  type Simulation,
} from '@metascape/engine';

/** Side length of the wrapped square world (the legacy `world.setExtent(50, 50)`). */
export const WORLD_SIZE = 50;

/** Tolerance of Ascape's `DataPointConcrete.equals`, used for ties and for "same place". */
const EQUALS_EPSILON = 1.0e-10;

/** Ascape's tolerant number equality. */
function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs((a - b) / (a + b)) < EQUALS_EPSILON || Math.abs(a - b) < EQUALS_EPSILON;
}

/**
 * Ascape's `Continuous2D.calculateDistance` for a periodic space, formula for
 * formula. Unlike the engine's `ContinuousScape.distance` it is also defined
 * (if odd) for points outside the world, which the cohesion rule produces.
 */
export function periodicDistance(origin: Point, target: Point): number {
  const axis = (o: number, t: number): number =>
    o < t ? Math.min(t - o, o + (WORLD_SIZE - t)) : Math.min(o - t, t + (WORLD_SIZE - o));
  const dx = axis(origin.x, target.x);
  const dy = axis(origin.y, target.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ascape's `Continuous2D.calculateRelativePosition` for a periodic space. */
export function periodicRelative(origin: Point, target: Point): Point {
  const axis = (o: number, t: number): number => {
    if (o < t) {
      const inside = t - o;
      const outside = o + (WORLD_SIZE - t);
      return inside < outside ? inside : -outside;
    }
    const inside = o - t;
    const outside = t + (WORLD_SIZE - o);
    return inside < outside ? -inside : outside;
  };
  return { x: axis(origin.x, target.x), y: axis(origin.y, target.y) };
}

/** Ascape excludes "self" from a search by comparing coordinates, not identity. */
function samePlace(a: Point, b: Point): boolean {
  return nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y);
}

/** The two teams. Red boids steer only around obstacles; see the README. */
export type Team = 'red' | 'blue';

/** Per-boid settings, copied from the model's parameters when a boid is initialized. */
export interface BoidSettings {
  readonly velocity: number;
  readonly headingRange: number;
  readonly obstacleRange: number;
  readonly flockRange: number;
  readonly clumpingRange: number;
  readonly collisionRange: number;
}

/** A fixed obstacle that boids steer away from. Legacy `Obstacle`. */
export class Obstacle extends PointAgent {}

/**
 * A boid. Legacy `Boid`: its steering methods are the ones the rules call, in
 * the order the model applies them, each yielding to those before it.
 */
export class Boid extends PointAgent {
  /** Distance moved per tick. */
  velocity = 0;
  /** Direction in radians. Not normalized to one turn, as in the original. */
  heading = 0;
  /** Set once a higher-priority steering rule has acted this tick. */
  prioritySet = false;

  #settings: BoidSettings;
  readonly #world: () => ContinuousScape<Boid | Obstacle>;

  constructor(
    readonly team: Team,
    settings: BoidSettings,
    world: () => ContinuousScape<Boid | Obstacle>,
  ) {
    super();
    this.#settings = settings;
    this.#world = world;
  }

  /** Legacy `Boid.initialize`: copy the settings and pick a random heading. */
  override initialize(): void {
    this.velocity = this.#settings.velocity;
    this.heading = this.random.float() * 2.0 * Math.PI;
    this.prioritySet = false;
  }

  /** Legacy `iterate`, run by the `boids` scape's iterate rule: clears the priority marker. */
  iterate(): void {
    this.prioritySet = false;
  }

  /** The same-team boids, excluding any at this boid's own place. */
  #teamMates(range: number): Boid[] {
    const found: Boid[] = [];
    for (const other of this.#world().members) {
      if (!(other instanceof Boid) || other.team !== this.team) continue;
      if (samePlace(this, other)) continue;
      if (periodicDistance(this, other) <= range) found.push(other);
    }
    return found;
  }

  /**
   * Ascape's `findNearest`: the closest candidate, ties (within tolerance)
   * broken at random.
   */
  #nearest<T extends PointAgent>(candidates: readonly T[]): T | undefined {
    let minValue = Number.MAX_VALUE;
    let minObject: T | undefined;
    let ties: T[] | undefined;
    for (const candidate of candidates) {
      const d = periodicDistance(this, candidate);
      if (d < minValue) {
        minValue = d;
        minObject = candidate;
        ties = undefined;
      } else if (nearlyEqual(d, minValue)) {
        ties ??= minObject === undefined ? [] : [minObject];
        ties.push(candidate);
      }
    }
    return ties ? this.random.pick(ties) : minObject;
  }

  /** The direction from this boid to a point, from raw coordinates (no wrapping). */
  #headingToward(target: Point): number {
    return Math.atan2(target.y - this.y, target.x - this.x);
  }

  /** Legacy `headAway`: turn diametrically away from a point. */
  #headAway(target: Point): void {
    this.heading = Math.PI + this.#headingToward(target);
  }

  /**
   * Find the closest obstacle within range and head directly away from it.
   * This is the highest priority.
   */
  avoidObstacles(): void {
    const obstacles: Obstacle[] = [];
    for (const other of this.#world().members) {
      if (!(other instanceof Obstacle) || samePlace(this, other)) continue;
      if (periodicDistance(this, other) <= this.#settings.obstacleRange) obstacles.push(other);
    }
    const obstacle = this.#nearest(obstacles);
    if (obstacle) {
      this.#headAway(obstacle);
      this.prioritySet = true;
    }
  }

  /** If the closest team-mate is within collision range, head away from it. */
  avoidCollisions(): void {
    if (this.prioritySet) return;
    const closest = this.#nearest(this.#teamMates(this.#settings.collisionRange));
    if (closest) {
      this.#headAway(closest);
      this.prioritySet = true;
    }
  }

  /** The average of team-mates' positions within `range`, as a point (or this boid's own place). */
  #centerOfMass(range: number): Point {
    const mates = this.#teamMates(range);
    if (mates.length === 0) return { x: this.x, y: this.y };
    let xSum = 0;
    let ySum = 0;
    for (const mate of mates) {
      const rel = periodicRelative(this, mate);
      xSum += rel.x;
      ySum += rel.y;
    }
    return { x: xSum / mates.length + this.x, y: ySum / mates.length + this.y };
  }

  /** If the flock's center of mass is farther than the clumping range, head toward it. */
  cohesion(): void {
    if (this.prioritySet) return;
    const center = this.#centerOfMass(this.#settings.flockRange);
    if (periodicDistance(this, center) > this.#settings.clumpingRange) {
      this.heading = this.#headingToward(center);
      this.prioritySet = true;
    }
  }

  /**
   * Set the heading to the mean of its own and the average heading of the
   * team-mates within heading range. Always claims the priority marker.
   */
  alignHeading(): void {
    if (this.prioritySet) return;
    const flock = this.#teamMates(this.#settings.headingRange);
    const average = averageHeading(flock);
    // The original marks "nobody around" with -1 and tests for it.
    if (average !== -1) this.heading = (this.heading + average) / 2.0;
    this.prioritySet = true;
  }

  /** Legacy `MomentumAgent.movement`: advance `velocity` along the heading, wrapping once. */
  movement(): void {
    let x = this.x + this.velocity * Math.cos(this.heading);
    let y = this.y + this.velocity * Math.sin(this.heading);
    if (x < 0) x += WORLD_SIZE;
    else if (x > WORLD_SIZE) x -= WORLD_SIZE;
    if (y < 0) y += WORLD_SIZE;
    else if (y > WORLD_SIZE) y -= WORLD_SIZE;
    this.moveTo(x, y);
  }
}

/** Legacy `calcAverageHeading`: the circular mean, or -1 for an empty flock. */
function averageHeading(flock: readonly Boid[]): number {
  if (flock.length === 0) return -1;
  let xSum = 0;
  let ySum = 0;
  for (const boid of flock) {
    xSum += Math.cos(boid.heading);
    ySum += Math.sin(boid.heading);
  }
  return Math.atan2(ySum, xSum);
}

/** Name of the scape holding every boid and obstacle. */
export const WORLD = 'world';

/** The parameters of the model; legacy defaults and meanings. */
export const parameters = {
  numRedBoids: int(25, {
    min: 0,
    max: 500,
    label: 'Red boids',
    description: 'Number of red boids. In this model red boids steer only around obstacles.',
  }),
  numBlueBoids: int(25, {
    min: 0,
    max: 500,
    label: 'Blue boids',
    description: 'Number of blue boids, which apply all four steering rules.',
  }),
  initialVelocity: real(1, {
    min: 0,
    max: 10,
    label: 'Initial velocity',
    description: 'Distance each boid moves per tick.',
  }),
  initialHeadingRange: real(3.5, {
    min: 0,
    max: 50,
    label: 'Heading range',
    description: 'Team-mates within this distance are averaged for alignment.',
  }),
  initialObstacleAvoidanceRange: real(2.5, {
    min: 0,
    max: 50,
    label: 'Obstacle avoidance range',
    description: 'A boid steers away from the nearest obstacle within this distance.',
  }),
  initialClumpingRange: real(8, {
    min: 0,
    max: 50,
    label: 'Clumping range',
    description: 'A boid heads for its flock only if the flock center is farther away than this.',
  }),
  initialFlockRange: real(15, {
    min: 0,
    max: 50,
    label: 'Flock range',
    description: 'Team-mates within this distance make up the flock whose center is sought.',
  }),
  initialCollisionRange: real(1, {
    min: 0,
    max: 50,
    label: 'Collision range',
    description: 'A boid steers away from a team-mate closer than this.',
  }),
  agentSize: int(1, {
    min: 1,
    max: 5,
    label: 'Agent size',
    description: 'Drawing size of boids and obstacles.',
  }),
} as const;

/** The world scape of a boids simulation. */
export type BoidsWorld = ContinuousScape<Boid | Obstacle>;

/** Mean pairwise heading agreement of a team: 0 scattered, 1 all parallel. */
function polarization(world: BoidsWorld, team: Team): number {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const agent of world.members) {
    if (!(agent instanceof Boid) || agent.team !== team) continue;
    sx += Math.cos(agent.heading);
    sy += Math.sin(agent.heading);
    n++;
  }
  return n === 0 ? 0 : Math.hypot(sx, sy) / n;
}

/** Mean distance from each boid of a team to its nearest team-mate. */
function nearestMate(world: BoidsWorld, team: Team): number {
  const mates = world.members.filter((a): a is Boid => a instanceof Boid && a.team === team);
  let total = 0;
  let counted = 0;
  for (const boid of mates) {
    let best = Infinity;
    for (const other of mates) {
      if (other === boid) continue;
      best = Math.min(best, periodicDistance(boid, other));
    }
    if (best < Infinity) {
      total += best;
      counted++;
    }
  }
  return counted === 0 ? 0 : total / counted;
}

/**
 * Places an obstacle, as shift-clicking the legacy overhead view did.
 * Returns the new obstacle. Works once the simulation is built.
 */
export function placeObstacle(sim: Simulation, x: number, y: number): Obstacle {
  const world = sim.scape(WORLD) as unknown as BoidsWorld;
  return world.add(new Obstacle(x, y)) as Obstacle;
}

/**
 * Craig Reynolds' boids as implemented in Ascape's examples: 25 red and 25
 * blue boids on a wrapped 50 by 50 plane, with optional obstacles.
 */
export const boidsAscape = defineModel({
  name: 'Boids (Ascape)',
  description:
    "An implementation of Craig Reynolds' Boids (1987), the classic A-Life model of flocking from simple rules. Boids steer by priority: avoid obstacles, avoid collisions, head for the flock, then align with it.",
  provenance: {
    authors: 'Craig W. Reynolds',
    citation:
      'Reynolds, C. W. (1987). Flocks, herds, and schools: A distributed behavioral model. Computer Graphics, 21(4), 25-34.',
    portedFrom: 'Ascape 5.6.1, org.ascape.examples.boids.BaseModel',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.',
    note: 'Ascape implementation by Miles Parker. The steering rules differ from the textbook ones; red boids apply only obstacle avoidance. Obstacles are placed with placeObstacle.',
  },
  parameters,
  build(sim: Simulation<typeof parameters>) {
    const p = sim.parameters;
    const settings: BoidSettings = {
      velocity: p.initialVelocity,
      headingRange: p.initialHeadingRange,
      obstacleRange: p.initialObstacleAvoidanceRange,
      flockRange: p.initialFlockRange,
      clumpingRange: p.initialClumpingRange,
      collisionRange: p.initialCollisionRange,
    };
    const world: BoidsWorld = sim.addScape(
      new ContinuousScape<Boid | Obstacle>({
        name: WORLD,
        width: WORLD_SIZE,
        height: WORLD_SIZE,
        wrap: true,
        size: p.numRedBoids + p.numBlueBoids,
        create: (index) => new Boid(index < p.numRedBoids ? 'red' : 'blue', settings, () => world),
      }),
    );

    const onBoid = (name: string, act: (boid: Boid) => void): Rule<Boid | Obstacle> => ({
      name,
      execute(agent) {
        if (agent instanceof Boid) act(agent);
      },
    });
    // Rules in the legacy order. Red boids had the flocking rules added
    // unselected, so they never ran: those three act on blue boids only.
    world.addRule(onBoid('Iterate', (b) => b.iterate()));
    world.addRule(onBoid('Avoid Obstacles Rule', (b) => b.avoidObstacles()));
    world.addRule(
      onBoid('Avoid Collisions Rule', (b) => {
        if (b.team === 'blue') b.avoidCollisions();
      }),
    );
    world.addRule(
      onBoid('Cohesion Rule', (b) => {
        if (b.team === 'blue') b.cohesion();
      }),
    );
    world.addRule(
      onBoid('Alignment Rule', (b) => {
        if (b.team === 'blue') b.alignHeading();
      }),
    );
    world.addRule(onBoid('Movement', (b) => b.movement()));

    sim.data.value('redPolarization', () => polarization(world, 'red'));
    sim.data.value('bluePolarization', () => polarization(world, 'blue'));
    sim.data.value('redNearestMate', () => nearestMate(world, 'red'));
    sim.data.value('blueNearestMate', () => nearestMate(world, 'blue'));

    sim.addView(
      continuousView<Boid | Obstacle>({
        title: 'Continuous Overhead View',
        scape: world,
        background: colors.white,
        color: (agent) =>
          agent instanceof Obstacle
            ? colors.black
            : agent.team === 'red'
              ? colors.red
              : colors.blue,
        radius: () => p.agentSize,
        heading: (agent) => (agent instanceof Boid ? agent.heading : undefined),
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Heading agreement',
        series: ['redPolarization', 'bluePolarization'],
        yMin: 0,
        yMax: 1,
        colors: { redPolarization: colors.red, bluePolarization: colors.blue },
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Distance to nearest team-mate',
        series: ['redNearestMate', 'blueNearestMate'],
        yMin: 0,
        colors: { redNearestMate: colors.red, blueNearestMate: colors.blue },
      }),
    );
  },
});
