// SPDX-License-Identifier: EPL-2.0
import {
  colors,
  ContinuousScape,
  continuousView,
  defineModel,
  gradient,
  int,
  PointAgent,
  real,
  timeSeriesView,
  type Rule,
  type Simulation,
} from '@metascape/engine';

/** A bird-like object that steers by separation, alignment and cohesion. */
export class Boid extends PointAgent {
  /** Current velocity, in space units per tick. */
  vx: number;
  vy: number;
  /** Velocity computed in `execute`, applied in `update`. */
  nextVx: number;
  nextVy: number;

  constructor(vx: number, vy: number) {
    super();
    this.vx = this.nextVx = vx;
    this.vy = this.nextVy = vy;
  }

  /** Direction of travel in radians. */
  get heading(): number {
    return Math.atan2(this.vy, this.vx);
  }
}

const parameters = {
  count: int(150, { min: 2, max: 2000, label: 'Boids', description: 'Number of boids.' }),
  size: real(100, {
    min: 20,
    max: 500,
    label: 'Space size',
    description: 'Side length of the square, wrapped space.',
  }),
  vision: real(12, {
    min: 1,
    max: 100,
    label: 'Vision radius',
    description: 'How far a boid sees its neighbors.',
  }),
  minSeparation: real(2.5, {
    min: 0,
    max: 50,
    label: 'Minimum separation',
    description: 'Boids closer than this push each other apart.',
  }),
  separationWeight: real(1.5, {
    min: 0,
    max: 5,
    label: 'Separation weight',
    description: 'How strongly a boid steers away from crowding neighbors.',
  }),
  alignmentWeight: real(0.8, {
    min: 0,
    max: 5,
    label: 'Alignment weight',
    description: 'How strongly a boid matches the mean velocity of its neighbors.',
  }),
  cohesionWeight: real(0.08, {
    min: 0,
    max: 5,
    label: 'Cohesion weight',
    description: 'How strongly a boid steers toward the center of its neighbors.',
  }),
  maxSpeed: real(1, {
    min: 0.1,
    max: 10,
    label: 'Maximum speed',
    description:
      'Upper limit on speed, in space units per tick. Boids never go slower than 40% of it.',
  }),
  maxTurn: real(0.35, {
    min: 0.01,
    max: Math.PI,
    label: 'Maximum turn',
    description: 'Largest change of heading in one tick, in radians.',
  }),
} as const;

/** Steering rule: reads the current state, writes only `nextVx`/`nextVy`. */
function steering(sim: Simulation<typeof parameters>, scape: ContinuousScape<Boid>): Rule<Boid> {
  const p = sim.parameters;
  const minSpeed = 0.4 * p.maxSpeed;
  return {
    name: 'steer',
    execute(boid) {
      let sepX = 0;
      let sepY = 0;
      let sumVx = 0;
      let sumVy = 0;
      let cohX = 0;
      let cohY = 0;
      let n = 0;
      for (const other of scape.within(boid, p.vision)) {
        const { dx, dy } = scape.displacement(boid, other);
        const d = Math.hypot(dx, dy);
        n++;
        sumVx += other.vx;
        sumVy += other.vy;
        cohX += dx;
        cohY += dy;
        if (d < p.minSeparation) {
          // Push away, harder the closer the neighbor is.
          const push = d === 0 ? 0 : (1 - d / p.minSeparation) / d;
          sepX -= dx * push;
          sepY -= dy * push;
        }
      }
      let vx = boid.vx;
      let vy = boid.vy;
      if (n > 0) {
        const toward = (p.maxSpeed * p.cohesionWeight) / (n * p.vision);
        const apart = p.maxSpeed * p.separationWeight;
        vx += p.alignmentWeight * (sumVx / n - boid.vx) + toward * cohX + apart * sepX;
        vy += p.alignmentWeight * (sumVy / n - boid.vy) + toward * cohY + apart * sepY;
      }
      // Limit the turn and the speed.
      const oldAngle = Math.atan2(boid.vy, boid.vx);
      let angle = Math.atan2(vy, vx);
      let speed = Math.hypot(vx, vy);
      if (speed === 0) {
        angle = oldAngle;
        speed = Math.hypot(boid.vx, boid.vy);
      }
      let turn = angle - oldAngle;
      turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
      turn = Math.max(-p.maxTurn, Math.min(p.maxTurn, turn));
      speed = Math.max(minSpeed, Math.min(p.maxSpeed, speed));
      boid.nextVx = Math.cos(oldAngle + turn) * speed;
      boid.nextVy = Math.sin(oldAngle + turn) * speed;
    },
    update(boid) {
      boid.vx = boid.nextVx;
      boid.vy = boid.nextVy;
      boid.moveBy(boid.vx, boid.vy);
    },
  };
}

const headingColor = gradient(
  colors.blue,
  colors.teal,
  colors.green,
  colors.yellow,
  colors.red,
  colors.purple,
  colors.blue,
);

/**
 * Reynolds' boids: flocking from three local steering rules.
 */
export const boids = defineModel({
  name: 'Boids',
  description:
    "Craig Reynolds' boids (1987): each bird steers by three local rules, separation from crowding neighbors, alignment with the mean velocity of neighbors in sight, and cohesion toward their center, yet the group flocks without any leader or global plan. The model runs in a wrapped square space with synchronous updating and tracks polarization (the length of the mean unit velocity, near 0 for disorder and 1 for perfect alignment) and the mean distance to the nearest neighbor.",
  parameters,
  build(sim) {
    const p = sim.parameters;
    const scape: ContinuousScape<Boid> = sim.addScape(
      new ContinuousScape<Boid>({
        name: 'boids',
        width: p.size,
        height: p.size,
        wrap: true,
        cellSize: Math.max(p.vision, p.size / 32),
        size: p.count,
        create: () => {
          const angle = scape.random.float() * 2 * Math.PI;
          const speed = p.maxSpeed * (0.5 + 0.5 * scape.random.float());
          return new Boid(Math.cos(angle) * speed, Math.sin(angle) * speed);
        },
        order: 'sequential',
      }),
    );
    scape.addRule(steering(sim, scape));

    sim.data.value('polarization', () => {
      let sx = 0;
      let sy = 0;
      const members = scape.members;
      for (let i = 0; i < members.length; i++) {
        const b = members[i]!;
        const speed = Math.hypot(b.vx, b.vy);
        if (speed === 0) continue;
        sx += b.vx / speed;
        sy += b.vy / speed;
      }
      return members.length === 0 ? 0 : Math.hypot(sx, sy) / members.length;
    });
    sim.data.value('nearestDistance', () => {
      let total = 0;
      let counted = 0;
      for (const boid of scape.members) {
        const nearest = scape.nearest(boid);
        if (!nearest) continue;
        total += scape.distance(boid, nearest);
        counted++;
      }
      return counted === 0 ? 0 : total / counted;
    });

    sim.addView(
      continuousView<Boid>({
        title: 'Flock',
        scape,
        heading: (boid) => boid.heading,
        color: (boid) => headingColor((boid.heading + Math.PI) / (2 * Math.PI)),
        radius: () => 1,
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Polarization',
        series: ['polarization'],
        yMin: 0,
        yMax: 1,
        colors: { polarization: colors.blue },
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Nearest-neighbor distance',
        series: ['nearestDistance'],
        yMin: 0,
        colors: { nearestDistance: colors.orange },
      }),
    );
  },
});
