// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Simulation, type Model, type ParameterSchema } from '../../index';
import { ContinuousScape, PointAgent, type ContinuousScapeOptions } from './index';

type Options = Omit<ContinuousScapeOptions<PointAgent>, 'name'>;

function build(options: Options, seed = 1) {
  const model: Model<ParameterSchema> & { scape: ContinuousScape } = {
    name: 'test',
    parameters: {},
    scape: undefined as unknown as ContinuousScape,
    build(sim: Simulation) {
      model.scape = sim.addScape(new ContinuousScape({ name: 'space', ...options }));
    },
  };
  const sim = new Simulation(model, { seed });
  return { sim, scape: model.scape };
}

const empty = (width = 10, height = 10, wrap = true) => build({ width, height, wrap }).scape;

describe('construction and placement', () => {
  it('rejects bad dimensions', () => {
    expect(() => new ContinuousScape({ name: 'a', width: 0, height: 5 })).toThrow(RangeError);
    expect(() => new ContinuousScape({ name: 'a', width: 5, height: -1 })).toThrow(RangeError);
    expect(() => new ContinuousScape({ name: 'a', width: 5, height: 5, cellSize: 0 })).toThrow(
      RangeError,
    );
  });

  it('places unpositioned agents randomly inside the rectangle, reproducibly', () => {
    const positions = (seed: number) =>
      build(
        { width: 20, height: 5, size: 50, create: () => new PointAgent() },
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
      create: (i) => (i === 0 ? new PointAgent(3, 4) : new PointAgent(13, -1)),
    });
    const [a, b] = scape.members;
    expect([a?.x, a?.y]).toEqual([3, 4]);
    expect([b?.x, b?.y]).toEqual([3, 9]);
  });

  it('places agents spawned later and exposes randomPoint', () => {
    const { scape } = build({ width: 10, height: 10, create: () => new PointAgent() });
    const agent = scape.spawn();
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
    const { scape } = build({ width: 10, height: 10, create: () => new PointAgent(1, 1) });
    const a = scape.spawn();
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
      wrap: false,
      create: () => new PointAgent(9, 1),
    });
    const a = scape.spawn();
    a.moveBy(5, -5);
    expect(a.x).toBeLessThan(10);
    expect(a.x).toBeGreaterThan(9.99);
    expect(a.y).toBe(0);
  });

  it('requires a position for moveBy and a continuous scape for moveTo', () => {
    expect(() => new PointAgent().moveBy(1, 1)).toThrow();
    const loose = new PointAgent();
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
      create: (i) => new PointAgent(i === 0 ? 9 : 1, 5),
    });
    const [a, b] = scape.members as [PointAgent, PointAgent];
    expect(scape.distance(a, b)).toBe(2);
    expect(scape.heading(a, b)).toBeCloseTo(0);
    expect(scape.heading(b, a)).toBeCloseTo(Math.PI);
    expect(scape.heading({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('queries', () => {
  const setup = (wrap = true) => {
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
      wrap,
      cellSize: 2,
      size: spots.length,
      create: (i) => new PointAgent(...(spots[i] as [number, number])),
    }).scape;
  };

  it('finds other agents within a radius in id order, excluding the origin', () => {
    const scape = setup();
    const [a] = scape.members as [PointAgent];
    expect(scape.within(a, 2).map((m) => m.id)).toEqual([1, 2]);
    expect(scape.within({ x: 5, y: 5 }, 0.5).map((m) => m.id)).toEqual([0]);
    expect(scape.countWithin(a, 2)).toBe(2);
    expect(scape.within(a, 2, (m) => m.y === 7).map((m) => m.id)).toEqual([2]);
    expect(scape.within(a, -1)).toEqual([]);
    expect(scape.within(a, Infinity)).toHaveLength(4);
  });

  it('sees across the wrap only on a torus', () => {
    const torus = setup(true);
    const bounded = setup(false);
    expect(torus.within({ x: 9.8, y: 5 }, 1).map((m) => m.id)).toEqual([3, 4]);
    expect(bounded.within({ x: 9.8, y: 5 }, 1).map((m) => m.id)).toEqual([3]);
  });

  it('finds the nearest agent, with ties going to the lowest id', () => {
    const scape = setup();
    expect(scape.nearest({ x: 5.2, y: 5 })?.id).toBe(0);
    expect(scape.nearest(scape.members[0] as PointAgent)?.id).toBe(1);
    expect(scape.nearest({ x: 5.5, y: 5 })?.id).toBe(0);
    expect(scape.nearest({ x: 5, y: 5 }, (m) => m.id > 1)?.id).toBe(2);
    expect(scape.nearest({ x: 5, y: 5 }, undefined, 0.5)?.id).toBe(0);
    expect(scape.nearest({ x: 2, y: 2 }, undefined, 0.5)).toBeUndefined();
    expect(scape.nearest({ x: 5, y: 5 }, () => false)).toBeUndefined();
    expect(empty().nearest({ x: 1, y: 1 })).toBeUndefined();
  });

  it('ignores dead agents and sees new ones', () => {
    const scape = setup();
    const [a, b] = scape.members as [PointAgent, PointAgent];
    b.die();
    expect(scape.within(a, 2).map((m) => m.id)).toEqual([2]);
    expect(scape.nearest(a)?.id).toBe(2);
    const added = scape.add(new PointAgent(5, 5.1));
    expect(scape.nearest(a)).toBe(added);
  });
});

describe('moveToward and moveAway', () => {
  const one = (x: number, y: number, wrap = true) =>
    build({ width: 10, height: 10, wrap, size: 1, create: () => new PointAgent(x, y) }).scape;

  it('moves the requested distance without overshooting', () => {
    const scape = one(1, 1);
    const a = scape.members[0] as PointAgent;
    expect(scape.moveToward(a, { x: 4, y: 5 }, 2.5)).toBe(2.5);
    expect(a.x).toBeCloseTo(1 + 1.5);
    expect(a.y).toBeCloseTo(1 + 2);
    expect(scape.moveToward(a, { x: 4, y: 5 }, 100)).toBeCloseTo(2.5);
    expect([a.x, a.y]).toEqual([4, 5]);
    expect(scape.moveToward(a, { x: 4, y: 5 }, 1)).toBe(0);
  });

  it('takes the short way round the wrap', () => {
    const scape = one(9, 1);
    const a = scape.members[0] as PointAgent;
    scape.moveToward(a, { x: 1, y: 1 }, 1);
    expect(a.x).toBeCloseTo(0);
    scape.moveToward(a, { x: 1, y: 1 }, 5);
    expect(a.x).toBeCloseTo(1);
  });

  it('moves away from a target, and not at all from itself', () => {
    const scape = one(5, 5);
    const a = scape.members[0] as PointAgent;
    expect(scape.moveAway(a, { x: 5, y: 5 }, 1)).toBe(0);
    scape.moveAway(a, { x: 3, y: 5 }, 1);
    expect([a.x, a.y]).toEqual([6, 5]);
  });
});

describe('spatial index against brute force', () => {
  for (const wrap of [true, false]) {
    it(`agrees with a brute-force scan over many steps (${wrap ? 'wrapped' : 'bounded'})`, () => {
      const width = 40;
      const height = 25;
      const { sim, scape } = build(
        {
          width,
          height,
          wrap,
          cellSize: 3,
          size: 300,
          create: () => new PointAgent(),
        },
        wrap ? 11 : 12,
      );
      const rng = sim.random.fork();
      const radii = [0.5, 2, 3, 7, 14, 21, 30, 80];

      const check = () => {
        const all = [...scape.members];
        const origins: (PointAgent | { x: number; y: number })[] = [
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
            expect(scape.within(origin, radius).map((m) => m.id)).toEqual(
              expected.map((m) => m.id),
            );
            expect(scape.countWithin(origin, radius)).toBe(expected.length);
          }
          const odd = (m: PointAgent) => m.id % 2 === 1;
          for (const condition of [undefined, odd]) {
            const candidates = all.filter((m) => m !== origin && (!condition || condition(m)));
            let best: PointAgent | undefined;
            for (const m of candidates) {
              const better =
                !best ||
                scape.distance(origin, m) < scape.distance(origin, best) ||
                (scape.distance(origin, m) === scape.distance(origin, best) && m.id < best.id);
              if (better) best = m;
            }
            expect(scape.nearest(origin, condition)).toBe(best);
            const capped = candidates.filter((m) => scape.distance(origin, m) <= 4);
            expect(scape.nearest(origin, condition, 4) === undefined).toBe(capped.length === 0);
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
        for (let i = 0; i < 10; i++) scape.add(new PointAgent());
        check();
      }
    });
  }

  it('stays correct when agents move and die in the middle of a step', () => {
    const { sim, scape } = build({
      width: 30,
      height: 30,
      size: 100,
      cellSize: 2,
      create: () => new PointAgent(),
    });
    scape.addRule('jitter', (agent) => {
      agent.moveBy(agent.random.float() - 0.5, agent.random.float() - 0.5);
      const near = scape.within(agent, 3);
      const brute = scape.members.filter((m) => m !== agent && scape.distance(agent, m) <= 3);
      expect(near.map((m) => m.id)).toEqual(brute.map((m) => m.id).sort((a, b) => a - b));
      if (agent.random.chance(0.02)) agent.die();
      if (agent.random.chance(0.02)) scape.add(new PointAgent());
    });
    sim.run(15);
  });
});

describe('a flocking-like model', () => {
  class Boid extends PointAgent {
    heading = 0;
    override initialize(): void {
      this.heading = this.random.float() * Math.PI * 2;
    }
  }

  const run = (seed: number) => {
    const model: Model<ParameterSchema> & { scape: ContinuousScape<Boid> } = {
      name: 'flock',
      parameters: {},
      scape: undefined as unknown as ContinuousScape<Boid>,
      build(sim: Simulation) {
        const scape = sim.addScape(
          new ContinuousScape<Boid>({
            name: 'boids',
            width: 50,
            height: 50,
            size: 80,
            create: () => new Boid(),
          }),
        );
        scape.addRule('flock', (boid) => {
          const friends = scape.within(boid, 6);
          const target = scape.nearest(boid);
          if (target && friends.length > 0) {
            boid.heading = scape.heading(boid, target) + boid.random.float() * 0.2;
          }
          boid.moveBy(Math.cos(boid.heading), Math.sin(boid.heading));
        });
        model.scape = scape;
      },
    };
    const sim = new Simulation(model, { seed });
    sim.run(25);
    return model.scape.members.map((b) => [b.id, b.x, b.y, b.heading]);
  };

  it('is deterministic for a seed', () => {
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
});
