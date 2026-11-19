// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { LocatedAgent, RootScape, Scape, type Model, type ParameterSchema } from '../index';
import { Continuous2D } from './index';

/** How the test space is made. */
interface Options {
  readonly width: number;
  readonly height: number;
  readonly periodic?: boolean;
  readonly cellSize?: number;
  readonly size?: number;
  readonly create?: (index: number) => LocatedAgent;
}

/** A scape with a continuous space. */
function continuous<A extends LocatedAgent>(
  name: string,
  options: Omit<Options, 'create'> & { readonly create?: (index: number) => A },
): Scape<A> {
  const { width, height, periodic, cellSize, size, create } = options;
  return new Scape<A>({
    name,
    space: new Continuous2D<A>(cellSize === undefined ? {} : { cellSize }),
    extent: [width, height],
    ...(periodic !== undefined && { periodic }),
    ...(size !== undefined && { size }),
    ...(create && { prototypeAgent: create }),
  });
}

/** Builds a model with one continuous scape; `scape` is its space. */
function build(options: Options, seed = 1) {
  const model: Model<ParameterSchema> & { scape: Continuous2D } = {
    name: 'test',
    parameters: {},
    scape: undefined as unknown as Continuous2D,
    build(root: RootScape) {
      model.scape = root.add(continuous('space', options)).space as Continuous2D;
    },
  };
  const root = new RootScape(model, { seed });
  return { root, scape: model.scape };
}

const empty = (width = 10, height = 10, periodic = true) =>
  build({ width, height, periodic }).scape;

describe('construction and placement', () => {
  it('rejects bad dimensions', () => {
    expect(() => continuous('a', { width: 0, height: 5 })).toThrow(RangeError);
    expect(() => continuous('a', { width: 5, height: -1 })).toThrow(RangeError);
    expect(() => continuous('a', { width: 5, height: 5, cellSize: 0 })).toThrow(RangeError);
  });

  it('places unpositioned agents randomly inside the rectangle, reproducibly', () => {
    const positions = (seed: number) =>
      build(
        { width: 20, height: 5, size: 50, create: () => new LocatedAgent() },
        seed,
      ).scape.members.map((a) => [a.x, a.y]);
    const first = positions(3);
    for (const [x, y] of first) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(20);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(5);
    }
    expect(positions(3)).toEqual(first);
    expect(positions(4)).not.toEqual(first);
    expect(new Set(first.map(([x]) => x)).size).toBeGreaterThan(40);
  });

  it('keeps a given position, normalized', () => {
    const { scape } = build({
      width: 10,
      height: 10,
      size: 2,
      create: (i) => (i === 0 ? new LocatedAgent(3, 4) : new LocatedAgent(13, -1)),
    });
    const [a, b] = scape.members;
    expect([a?.x, a?.y]).toEqual([3, 4]);
    expect([b?.x, b?.y]).toEqual([3, 9]);
  });

  it('places agents spawned later and exposes randomPoint', () => {
    const { scape } = build({ width: 10, height: 10, create: () => new LocatedAgent() });
    const agent = scape.scape.newAgent();
    expect(agent.x).toBeLessThan(10);
    const p = scape.randomPoint();
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThan(10);
  });
});

describe('normalize, moveTo and moveBy', () => {
  it('wraps on a torus', () => {
    const scape = empty();
    expect(scape.normalize(12, -3)).toEqual({ x: 2, y: 7 });
    expect(scape.normalize(-1e-20, 10)).toEqual({ x: 0, y: 0 });
  });

  it('clamps when bounded, staying below the upper edge', () => {
    const scape = empty(10, 10, false);
    const p = scape.normalize(15, -2);
    expect(p.x).toBeLessThan(10);
    expect(p.x).toBeGreaterThan(9.999999);
    expect(p.y).toBe(0);
  });

  it('moves agents through moveTo and moveBy', () => {
    const { scape } = build({ width: 10, height: 10, create: () => new LocatedAgent(1, 1) });
    const a = scape.scape.newAgent();
    a.moveTo(9, 9);
    expect([a.x, a.y]).toEqual([9, 9]);
    a.moveBy(2, 3);
    expect([a.x, a.y]).toEqual([1, 2]);
    expect(() => a.moveTo(Number.NaN, 0)).toThrow(RangeError);
  });

  it('clamps movement in a bounded space', () => {
    const { scape } = build({
      width: 10,
      height: 10,
      periodic: false,
      create: () => new LocatedAgent(9, 1),
    });
    const a = scape.scape.newAgent();
    a.moveBy(5, -5);
    expect(a.x).toBeLessThan(10);
    expect(a.x).toBeGreaterThan(9.99);
    expect(a.y).toBe(0);
  });

  it('requires a position for moveBy, and moves freely outside a scape', () => {
    expect(() => new LocatedAgent().moveBy(1, 1)).toThrow();
    const loose = new LocatedAgent();
    loose.moveTo(2, 3);
    expect([loose.x, loose.y]).toEqual([2, 3]);
  });
});

describe('geometry', () => {
  it('computes displacement and distance across the wrap', () => {
    const scape = empty(10, 10, true);
    expect(scape.displacement({ x: 9, y: 1 }, { x: 1, y: 9 })).toEqual({ dx: 2, dy: -2 });
    expect(scape.displacement({ x: 1, y: 1 }, { x: 9, y: 1 })).toEqual({ dx: -2, dy: 0 });
    expect(scape.distance({ x: 9, y: 1 }, { x: 1, y: 9 })).toBeCloseTo(Math.hypot(2, 2));
  });

  it('does not wrap in a bounded space', () => {
    const scape = empty(10, 10, false);
    expect(scape.displacement({ x: 9, y: 1 }, { x: 1, y: 1 })).toEqual({ dx: -8, dy: 0 });
    expect(scape.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('accepts agents as well as points, and gives headings', () => {
    const { scape } = build({
      width: 10,
      height: 10,
      size: 2,
      create: (i) => new LocatedAgent(i === 0 ? 9 : 1, 5),
    });
    const [a, b] = scape.members as [LocatedAgent, LocatedAgent];
    expect(scape.distance(a, b)).toBe(2);
    expect(scape.heading(a, b)).toBeCloseTo(0);
    expect(scape.heading(b, a)).toBeCloseTo(Math.PI);
    expect(scape.heading({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('queries', () => {
  const setup = (periodic = true) => {
    const spots: [number, number][] = [
      [5, 5],
      [6, 5],
      [5, 7],
      [9.5, 5],
      [0.5, 5],
    ];
    return build({
      width: 10,
      height: 10,
      periodic,
      cellSize: 2,
      size: spots.length,
      create: (i) => new LocatedAgent(...(spots[i] as [number, number])),
    }).scape;
  };

  it('finds other agents within a radius in id order, excluding the origin', () => {
    const scape = setup();
    const [a] = scape.members as [LocatedAgent];
    expect(scape.findWithin(a, 2).map((m) => m.id)).toEqual([1, 2]);
    expect(scape.findWithin({ x: 5, y: 5 }, 0.5).map((m) => m.id)).toEqual([0]);
    expect(scape.countWithin(a, 2)).toBe(2);
    expect(scape.findWithin(a, 2, (m) => m.y === 7).map((m) => m.id)).toEqual([2]);
    expect(scape.findWithin(a, -1)).toEqual([]);
    expect(scape.findWithin(a, Infinity)).toHaveLength(4);
  });

  it('sees across the wrap only on a torus', () => {
    const torus = setup(true);
    const bounded = setup(false);
    expect(torus.findWithin({ x: 9.8, y: 5 }, 1).map((m) => m.id)).toEqual([3, 4]);
    expect(bounded.findWithin({ x: 9.8, y: 5 }, 1).map((m) => m.id)).toEqual([3]);
  });

  it('finds the nearest agent, with ties going to the lowest id', () => {
    const scape = setup();
    expect(scape.findNearest({ x: 5.2, y: 5 })?.id).toBe(0);
    expect(scape.findNearest(scape.members[0] as LocatedAgent)?.id).toBe(1);
    expect(scape.findNearest({ x: 5.5, y: 5 })?.id).toBe(0);
    expect(scape.findNearest({ x: 5, y: 5 }, (m) => m.id > 1)?.id).toBe(2);
    expect(scape.findNearest({ x: 5, y: 5 }, undefined, 0.5)?.id).toBe(0);
    expect(scape.findNearest({ x: 2, y: 2 }, undefined, 0.5)).toBeUndefined();
    expect(scape.findNearest({ x: 5, y: 5 }, () => false)).toBeUndefined();
    expect(empty().findNearest({ x: 1, y: 1 })).toBeUndefined();
  });

  it('ignores dead agents and sees new ones', () => {
    const scape = setup();
    const [a, b] = scape.members as [LocatedAgent, LocatedAgent];
    b.die();
    expect(scape.findWithin(a, 2).map((m) => m.id)).toEqual([2]);
    expect(scape.findNearest(a)?.id).toBe(2);
    const added = scape.scape.add(new LocatedAgent(5, 5.1));
    expect(scape.findNearest(a)).toBe(added);
  });
});

describe('moveToward and moveAway', () => {
  const one = (x: number, y: number, periodic = true) =>
    build({ width: 10, height: 10, periodic, size: 1, create: () => new LocatedAgent(x, y) }).scape;

  it('moves the requested distance without overshooting', () => {
    const scape = one(1, 1);
    const a = scape.members[0] as LocatedAgent;
    expect(scape.moveToward(a, { x: 4, y: 5 }, 2.5)).toBe(2.5);
    expect(a.x).toBeCloseTo(1 + 1.5);
    expect(a.y).toBeCloseTo(1 + 2);
    expect(scape.moveToward(a, { x: 4, y: 5 }, 100)).toBeCloseTo(2.5);
    expect([a.x, a.y]).toEqual([4, 5]);
    expect(scape.moveToward(a, { x: 4, y: 5 }, 1)).toBe(0);
  });

  it('takes the short way round the wrap', () => {
    const scape = one(9, 1);
    const a = scape.members[0] as LocatedAgent;
    scape.moveToward(a, { x: 1, y: 1 }, 1);
    expect(a.x).toBeCloseTo(0);
    scape.moveToward(a, { x: 1, y: 1 }, 5);
    expect(a.x).toBeCloseTo(1);
  });

  it('moves away from a target, and not at all from itself', () => {
    const scape = one(5, 5);
    const a = scape.members[0] as LocatedAgent;
    expect(scape.moveAway(a, { x: 5, y: 5 }, 1)).toBe(0);
    scape.moveAway(a, { x: 3, y: 5 }, 1);
    expect([a.x, a.y]).toEqual([6, 5]);
  });
});

describe('spatial index against brute force', () => {
  for (const periodic of [true, false]) {
    it(`agrees with a brute-force scan over many iterations (${periodic ? 'periodic' : 'aperiodic'})`, () => {
      const width = 40;
      const height = 25;
      const { root, scape } = build(
        {
          width,
          height,
          periodic,
          cellSize: 3,
          size: 300,
          create: () => new LocatedAgent(),
        },
        periodic ? 11 : 12,
      );
      const rng = root.random.fork();
      const radii = [0.5, 2, 3, 7, 14, 21, 30, 80];

      const check = () => {
        const all = [...scape.members];
        const origins: (LocatedAgent | { x: number; y: number })[] = [
          ...Array.from({ length: 8 }, () => rng.pick(all)),
          ...Array.from({ length: 4 }, () => ({
            x: rng.float() * width,
            y: rng.float() * height,
          })),
          { x: 0, y: 0 },
        ];
        for (const origin of origins) {
          for (const radius of radii) {
            const expected = all
              .filter((m) => m !== origin && scape.distance(origin, m) <= radius)
              .sort((a, b) => a.id - b.id);
            expect(scape.findWithin(origin, radius).map((m) => m.id)).toEqual(
              expected.map((m) => m.id),
            );
            expect(scape.countWithin(origin, radius)).toBe(expected.length);
          }
          const odd = (m: LocatedAgent) => m.id % 2 === 1;
          for (const condition of [undefined, odd]) {
            const candidates = all.filter((m) => m !== origin && (!condition || condition(m)));
            let best: LocatedAgent | undefined;
            for (const m of candidates) {
              const better =
                !best ||
                scape.distance(origin, m) < scape.distance(origin, best) ||
                (scape.distance(origin, m) === scape.distance(origin, best) && m.id < best.id);
              if (better) best = m;
            }
            expect(scape.findNearest(origin, condition)).toBe(best);
            const capped = candidates.filter((m) => scape.distance(origin, m) <= 4);
            expect(scape.findNearest(origin, condition, 4) === undefined).toBe(capped.length === 0);
          }
        }
      };

      check();
      for (let round = 0; round < 6; round++) {
        for (const agent of [...scape.members]) {
          if (rng.chance(0.05)) agent.die();
          else if (rng.chance(0.7)) agent.moveBy(rng.float() * 30 - 15, rng.float() * 30 - 15);
          else if (rng.chance(0.2)) agent.moveTo(rng.float() * 100 - 30, rng.float() * 100 - 30);
        }
        for (let i = 0; i < 10; i++) scape.scape.add(new LocatedAgent());
        check();
      }
    });
  }

  it('stays correct when agents move and die in the middle of an iteration', () => {
    const { root, scape } = build({
      width: 30,
      height: 30,
      size: 100,
      cellSize: 2,
      create: () => new LocatedAgent(),
    });
    scape.scape.addRule('jitter', (agent) => {
      agent.moveBy(agent.random.float() - 0.5, agent.random.float() - 0.5);
      const near = scape.findWithin(agent, 3);
      const brute = scape.members.filter((m) => m !== agent && scape.distance(agent, m) <= 3);
      expect(near.map((m) => m.id)).toEqual(brute.map((m) => m.id).sort((a, b) => a - b));
      if (agent.random.chance(0.02)) agent.die();
      if (agent.random.chance(0.02)) scape.scape.add(new LocatedAgent());
    });
    root.run(15);
  });
});

describe('a flocking-like model', () => {
  class Boid extends LocatedAgent {
    heading = 0;
    override initialize(): void {
      this.heading = this.random.float() * Math.PI * 2;
    }
  }

  const run = (seed: number) => {
    const model: Model<ParameterSchema> & { scape: Scape<Boid> } = {
      name: 'flock',
      parameters: {},
      scape: undefined as unknown as Scape<Boid>,
      build(root: RootScape) {
        const boids = root.add(
          continuous<Boid>('boids', { width: 50, height: 50, size: 80, create: () => new Boid() }),
        );
        const scape = boids.space as Continuous2D<Boid>;
        boids.addRule('flock', (boid) => {
          const friends = scape.findWithin(boid, 6);
          const target = scape.findNearest(boid);
          if (target && friends.length > 0) {
            boid.heading = scape.heading(boid, target) + boid.random.float() * 0.2;
          }
          boid.moveBy(Math.cos(boid.heading), Math.sin(boid.heading));
        });
        model.scape = boids;
      },
    };
    const root = new RootScape(model, { seed });
    root.run(25);
    return model.scape.members.map((b) => [b.id, b.x, b.y, b.heading]);
  };

  it('is deterministic for a seed', () => {
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
});
