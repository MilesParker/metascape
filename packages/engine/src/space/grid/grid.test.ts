// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Scape } from '../../scape';
import { Simulation } from '../../simulation';
import { Cell, diffusion, GridScape, Occupant, type GridScapeOptions } from './index';

class Patch extends Cell {
  amount = 0;
}

interface World<C extends Cell = Cell> {
  sim: Simulation;
  grid: GridScape<C>;
  walkers: Scape<Walker>;
}

class Walker extends Occupant {
  steps = 0;
}

function world<C extends Cell = Cell>(
  options: Partial<GridScapeOptions<C>> & { width: number; height: number },
  walkerCount = 0,
  seed = 1,
): World<C> {
  const holder = {} as World<C>;
  const sim = new Simulation(
    {
      name: 'grid-test',
      parameters: {},
      build(s: Simulation) {
        holder.grid = s.addScape(new GridScape<C>({ name: 'grid', ...options }));
        holder.walkers = s.addScape(
          new Scape<Walker>({ name: 'walkers', size: walkerCount, create: () => new Walker() }),
        );
      },
    },
    { seed },
  );
  holder.sim = sim;
  return holder;
}

const coords = (cells: readonly (Cell | undefined)[]): string[] =>
  cells.map((cell) => (cell ? `${cell.x},${cell.y}` : 'none'));
const sorted = (cells: readonly Cell[]): string[] => coords(cells).sort();

describe('population', () => {
  it('creates cells in row-major order with coordinates', () => {
    const { grid } = world({ width: 3, height: 2 });
    expect(grid.size).toBe(6);
    expect(coords(grid.members)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
    expect(grid.members.map((c) => c.id)).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => grid.members[0]!.id + i),
    );
  });

  it('uses a custom create function and defaults to plain cells', () => {
    const custom = world<Patch>({
      width: 2,
      height: 2,
      create: (x, y) => Object.assign(new Patch(), { amount: x + 10 * y }),
    });
    expect(custom.grid.members.map((p) => p.amount)).toEqual([0, 1, 10, 11]);
    expect(world({ width: 1, height: 1 }).grid.at(0, 0)).toBeInstanceOf(Cell);
  });

  it('rejects invalid sizes', () => {
    expect(() => new GridScape({ name: 'bad', width: 0, height: 3 })).toThrow(RangeError);
    expect(() => new GridScape({ name: 'bad', width: 3, height: 2.5 })).toThrow(RangeError);
  });

  it('has fixed membership', () => {
    const { grid } = world({ width: 2, height: 2 });
    expect(() => grid.add(new Cell())).toThrow(/fixed membership/);
    expect(() => grid.spawn()).toThrow(/fixed membership/);
    expect(() => grid.remove(grid.at(0, 0)!)).toThrow(/fixed membership/);
    expect(() => grid.at(1, 1)!.die()).toThrow(/fixed membership/);
    expect(grid.size).toBe(4);
  });

  it('cell properties delegate to the grid', () => {
    const { grid } = world({ width: 3, height: 3 });
    const cell = grid.at(1, 1)!;
    expect(cell.grid).toBe(grid);
    expect(cell.neighbors).toBe(grid.neighbors(cell));
    expect(cell.occupants).toEqual([]);
    expect(cell.occupant).toBeUndefined();
    expect(cell.isAvailable).toBe(true);
  });
});

describe('at', () => {
  it('wraps on a torus', () => {
    const { grid } = world({ width: 5, height: 4 });
    expect(coords([grid.at(-1, -1), grid.at(5, 4), grid.at(7, -3), grid.at(2, 2)])).toEqual([
      '4,3',
      '0,0',
      '2,1',
      '2,2',
    ]);
    expect(grid.at(0.5, 1)).toBeUndefined();
  });

  it('returns undefined out of range when bounded', () => {
    const { grid } = world({ width: 5, height: 4, wrap: false });
    expect(grid.at(-1, 0)).toBeUndefined();
    expect(grid.at(5, 0)).toBeUndefined();
    expect(grid.at(0, 4)).toBeUndefined();
    expect(coords([grid.at(4, 3)])).toEqual(['4,3']);
  });
});

describe('neighbors', () => {
  it('lists moore neighbors in documented order, cached and read-only', () => {
    const { grid } = world({ width: 5, height: 5 });
    const list = grid.neighbors(grid.at(2, 2)!);
    expect(coords(list)).toEqual(['1,1', '2,1', '3,1', '1,2', '3,2', '1,3', '2,3', '3,3']);
    expect(grid.neighbors(grid.at(2, 2)!)).toBe(list);
    expect(() => (list as Cell[]).push(grid.at(0, 0)!)).toThrow();
  });

  it('lists von Neumann neighbors in documented order', () => {
    const { grid } = world({ width: 5, height: 5, neighborhood: 'vonNeumann' });
    expect(coords(grid.neighbors(grid.at(2, 2)!))).toEqual(['2,1', '1,2', '3,2', '2,3']);
  });

  it('wraps at corners', () => {
    const { grid } = world({ width: 5, height: 5 });
    expect(sorted(grid.neighbors(grid.at(0, 0)!))).toEqual(
      ['4,4', '0,4', '1,4', '4,0', '1,0', '4,1', '0,1', '1,1'].sort(),
    );
  });

  it('has fewer neighbors at bounded edges', () => {
    const moore = world({ width: 5, height: 5, wrap: false }).grid;
    expect(coords(moore.neighbors(moore.at(0, 0)!))).toEqual(['1,0', '0,1', '1,1']);
    expect(moore.neighbors(moore.at(0, 2)!)).toHaveLength(5);
    expect(moore.neighbors(moore.at(2, 2)!)).toHaveLength(8);
    const vn = world({ width: 5, height: 5, wrap: false, neighborhood: 'vonNeumann' }).grid;
    expect(coords(vn.neighbors(vn.at(4, 4)!))).toEqual(['4,3', '3,4']);
  });

  it('never lists a cell twice or itself on tiny wrapped grids', () => {
    for (const neighborhood of ['moore', 'vonNeumann'] as const) {
      for (const [width, height] of [
        [1, 1],
        [2, 2],
        [3, 3],
        [2, 3],
        [1, 4],
      ] as const) {
        const { grid } = world({ width, height, neighborhood });
        for (const cell of grid.members) {
          const list = grid.neighbors(cell);
          expect(new Set(list).size).toBe(list.length);
          expect(list).not.toContain(cell);
        }
      }
    }
    const two = world({ width: 2, height: 2 }).grid;
    expect(sorted(two.neighbors(two.at(0, 0)!))).toEqual(['0,1', '1,0', '1,1']);
    const one = world({ width: 1, height: 1 }).grid;
    expect(one.neighbors(one.at(0, 0)!)).toEqual([]);
  });

  it('rejects cells of another grid', () => {
    const a = world({ width: 3, height: 3 }).grid;
    const b = world({ width: 3, height: 3 }).grid;
    expect(() => a.neighbors(b.at(1, 1)!)).toThrow(/not a member/);
  });
});

describe('distance', () => {
  it('measures all three metrics on a bounded grid', () => {
    const { grid } = world({ width: 10, height: 10, wrap: false });
    const a = grid.at(1, 1)!;
    const b = grid.at(4, 5)!;
    expect(grid.distance(a, b, 'chebyshev')).toBe(4);
    expect(grid.distance(a, b, 'manhattan')).toBe(7);
    expect(grid.distance(a, b, 'euclidean')).toBe(5);
    expect(grid.distance(a, a)).toBe(0);
  });

  it('takes the shortest way round on a torus', () => {
    const { grid } = world({ width: 10, height: 8 });
    const a = grid.at(0, 0)!;
    const b = grid.at(9, 7)!;
    expect(grid.distance(a, b, 'chebyshev')).toBe(1);
    expect(grid.distance(a, b, 'manhattan')).toBe(2);
    expect(grid.distance(a, b, 'euclidean')).toBeCloseTo(Math.SQRT2);
    expect(grid.distance(grid.at(1, 0)!, grid.at(6, 0)!, 'manhattan')).toBe(5);
  });

  it('defaults by neighborhood', () => {
    const moore = world({ width: 9, height: 9 }).grid;
    const vn = world({ width: 9, height: 9, neighborhood: 'vonNeumann' }).grid;
    expect(moore.distance(moore.at(0, 0)!, moore.at(2, 3)!)).toBe(3);
    expect(vn.distance(vn.at(0, 0)!, vn.at(2, 3)!)).toBe(5);
    expect(moore.defaultMetric).toBe('chebyshev');
    expect(vn.defaultMetric).toBe('manhattan');
  });
});

describe('within', () => {
  const box = (x0: number, x1: number, y0: number, y1: number): string[] => {
    const out: string[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(`${x},${y}`);
    return out;
  };

  it('returns the chebyshev square in row-major order', () => {
    const { grid } = world({ width: 5, height: 5 });
    const result = grid.within(grid.at(2, 2)!, 1);
    expect(coords(result)).toEqual(box(1, 3, 1, 3).filter((c) => c !== '2,2'));
    expect(coords(grid.within(grid.at(2, 2)!, 1, { includeSelf: true }))).toEqual(box(1, 3, 1, 3));
    expect(grid.within(grid.at(2, 2)!, 0)).toEqual([]);
    expect(grid.within(grid.at(2, 2)!, -1, { includeSelf: true })).toEqual([]);
    expect(coords(grid.within(grid.at(2, 2)!, 0, { includeSelf: true }))).toEqual(['2,2']);
  });

  it('handles manhattan and euclidean shapes', () => {
    const { grid } = world({ width: 7, height: 7, wrap: false });
    const o = grid.at(3, 3)!;
    expect(sorted(grid.within(o, 2, { metric: 'manhattan' }))).toEqual(
      ['3,1', '2,2', '3,2', '4,2', '1,3', '2,3', '4,3', '5,3', '2,4', '3,4', '4,4', '3,5'].sort(),
    );
    // radius 2 euclidean: no (+-2,+-2), but (+-2,+-1) etc. are out as sqrt(5)>2
    expect(sorted(grid.within(o, 2, { metric: 'euclidean' }))).toEqual(
      ['3,1', '2,2', '3,2', '4,2', '1,3', '2,3', '4,3', '5,3', '2,4', '3,4', '4,4', '3,5'].sort(),
    );
    expect(grid.within(o, 2.3, { metric: 'euclidean' })).toHaveLength(20);
  });

  it('is clipped at bounded corners', () => {
    const { grid } = world({ width: 5, height: 5, wrap: false });
    expect(coords(grid.within(grid.at(0, 0)!, 2))).toEqual([
      '1,0',
      '2,0',
      '0,1',
      '1,1',
      '2,1',
      '0,2',
      '1,2',
      '2,2',
    ]);
    expect(grid.within(grid.at(0, 0)!, 100)).toHaveLength(24);
  });

  it('wraps at corners of a torus', () => {
    const { grid } = world({ width: 5, height: 5 });
    expect(sorted(grid.within(grid.at(0, 0)!, 1))).toEqual(
      ['4,4', '0,4', '1,4', '4,0', '1,0', '4,1', '0,1', '1,1'].sort(),
    );
  });

  it('lists each cell once on small and over-large tori', () => {
    const three = world({ width: 3, height: 3 }).grid;
    for (const radius of [1, 2, 10]) {
      const result = three.within(three.at(1, 1)!, radius);
      expect(new Set(result).size).toBe(result.length);
      expect(result).toHaveLength(8);
    }
    expect(three.within(three.at(1, 1)!, 10, { includeSelf: true })).toHaveLength(9);
    const even = world({ width: 4, height: 2 }).grid;
    const result = even.within(even.at(0, 0)!, 3, { includeSelf: true });
    expect(new Set(result).size).toBe(8);
  });

  it('agrees with distance() for every metric', () => {
    for (const wrap of [true, false]) {
      const { grid } = world({ width: 6, height: 5, wrap });
      for (const metric of ['chebyshev', 'manhattan', 'euclidean'] as const) {
        for (const origin of [grid.at(0, 0)!, grid.at(3, 2)!, grid.at(5, 4)!]) {
          for (const radius of [1, 2, 3]) {
            const expected = grid.members
              .filter((c) => c !== origin && grid.distance(origin, c, metric) <= radius)
              .map((c) => `${c.x},${c.y}`)
              .sort();
            expect(sorted(grid.within(origin, radius, { metric }))).toEqual(expected);
          }
        }
      }
    }
  });

  it('is deterministic and repeatable (cached templates)', () => {
    const { grid } = world({ width: 6, height: 6 });
    const origin = grid.at(1, 1)!;
    expect(coords(grid.within(origin, 2))).toEqual(coords(grid.within(origin, 2)));
  });
});

describe('rays', () => {
  it('goes outward in each direction, nearest first', () => {
    const { grid } = world({ width: 5, height: 5, wrap: false });
    expect(coords(grid.rays(grid.at(2, 2)!, 2))).toEqual([
      '1,1',
      '0,0', // (-1,-1)
      '2,1',
      '2,0', // (0,-1)
      '3,1',
      '4,0', // (1,-1)
      '1,2',
      '0,2', // (-1,0)
      '3,2',
      '4,2', // (1,0)
      '1,3',
      '0,4', // (-1,1)
      '2,3',
      '2,4', // (0,1)
      '3,3',
      '4,4', // (1,1)
    ]);
  });

  it('supports von Neumann directions and short range', () => {
    const { grid } = world({ width: 5, height: 5, neighborhood: 'vonNeumann' });
    expect(coords(grid.rays(grid.at(2, 2)!, 1))).toEqual(['2,1', '1,2', '3,2', '2,3']);
    expect(grid.rays(grid.at(2, 2)!, 0)).toEqual([]);
  });

  it('stops at bounded edges', () => {
    const { grid } = world({ width: 5, height: 5, wrap: false });
    expect(coords(grid.rays(grid.at(0, 0)!, 10))).toEqual([
      '1,0',
      '2,0',
      '3,0',
      '4,0',
      '0,1',
      '0,2',
      '0,3',
      '0,4',
      '1,1',
      '2,2',
      '3,3',
      '4,4',
    ]);
  });

  it('wraps on a torus, never including the origin', () => {
    const { grid } = world({ width: 5, height: 5, neighborhood: 'vonNeumann' });
    expect(coords(grid.rays(grid.at(0, 0)!, 2))).toEqual([
      '0,4',
      '0,3',
      '4,0',
      '3,0',
      '1,0',
      '2,0',
      '0,1',
      '0,2',
    ]);
    const full = grid.rays(grid.at(0, 0)!, 100);
    expect(full).not.toContain(grid.at(0, 0));
    expect(new Set(full).size).toBe(full.length);
    expect(full).toHaveLength(8); // up and down rays cover the same column
  });

  it('never lists a cell twice on tiny tori', () => {
    for (const neighborhood of ['moore', 'vonNeumann'] as const) {
      for (const size of [1, 2, 3]) {
        const { grid } = world({ width: size, height: size, neighborhood });
        for (const cell of grid.members) {
          const list = grid.rays(cell, 7);
          expect(new Set(list).size).toBe(list.length);
          expect(list).not.toContain(cell);
        }
      }
    }
    const three = world({ width: 3, height: 3 }).grid;
    expect(sorted(three.rays(three.at(1, 1)!, 5))).toHaveLength(8);
  });
});

describe('nearest', () => {
  it('finds the closest match, excluding the origin', () => {
    const { grid } = world<Patch>({ width: 9, height: 9, wrap: false, create: () => new Patch() });
    grid.at(7, 7)!.amount = 1;
    grid.at(2, 1)!.amount = 1;
    const origin = grid.at(0, 0)!;
    origin.amount = 1;
    expect(coords([grid.nearest(origin, (c) => c.amount === 1)])).toEqual(['2,1']);
    expect(grid.nearest(origin, (c) => c.amount === 5)).toBeUndefined();
    expect(grid.nearest(origin, (c) => c.amount === 1, 1)).toBeUndefined();
    expect(coords([grid.nearest(origin, (c) => c.amount === 1, 2)])).toEqual(['2,1']);
  });

  it('uses the default metric to order candidates', () => {
    const vn = world({ width: 9, height: 9, neighborhood: 'vonNeumann', wrap: false }).grid;
    const origin = vn.at(4, 4)!;
    // (6,6) is chebyshev 2 but manhattan 4; (4,0) is manhattan 4 too; (6,5) manhattan 3 wins.
    const targets = new Set([vn.at(6, 6)!, vn.at(4, 0)!, vn.at(6, 5)!]);
    expect(coords([vn.nearest(origin, (c) => targets.has(c))])).toEqual(['6,5']);
  });

  it('works across the wrap', () => {
    const { grid } = world({ width: 10, height: 10 });
    const target = grid.at(9, 9)!;
    expect(grid.nearest(grid.at(0, 0)!, (c) => c === target)).toBe(target);
  });

  it('breaks ties reproducibly per seed and reaches every tied cell', () => {
    const pick = (seed: number): string => {
      const { grid } = world({ width: 5, height: 5, wrap: false }, 0, seed);
      const found = grid.nearest(grid.at(2, 2)!, () => true)!;
      return `${found.x},${found.y}`;
    };
    expect(pick(7)).toBe(pick(7));
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) seen.add(pick(seed));
    expect([...seen].sort()).toEqual(['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3']);
  });

  it('terminates when nothing matches on a tiny torus', () => {
    const { grid } = world({ width: 2, height: 2 });
    expect(grid.nearest(grid.at(0, 0)!, () => false)).toBeUndefined();
    const one = world({ width: 1, height: 1 }).grid;
    expect(one.nearest(one.at(0, 0)!, () => true)).toBeUndefined();
  });
});

describe('random cells', () => {
  it('picks cells reproducibly and honors conditions', () => {
    const run = (seed: number) => {
      const { grid } = world({ width: 6, height: 6 }, 0, seed);
      return [
        grid.randomCell(),
        grid.randomCell((c) => c.x === 5),
        grid.randomCell(() => false),
      ].map((c) => (c ? `${c.x},${c.y}` : 'none'));
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)[1]).toMatch(/^5,/);
    expect(run(3)[2]).toBe('none');
  });

  it('randomAvailableCell skips occupied cells', () => {
    const { grid, walkers } = world({ width: 2, height: 1 }, 1);
    const walker = walkers.members[0]!;
    walker.moveTo(grid.at(0, 0)!);
    for (let i = 0; i < 20; i++) expect(grid.randomAvailableCell()).toBe(grid.at(1, 0));
    const other = walkers.spawn();
    other.moveTo(grid.at(1, 0)!);
    expect(grid.randomAvailableCell()).toBeUndefined();
  });
});

describe('toward and away', () => {
  it('toward picks the neighbor that most reduces distance', () => {
    const { grid } = world({ width: 9, height: 9, wrap: false, neighborhood: 'vonNeumann' });
    expect(coords([grid.toward(grid.at(0, 4)!, grid.at(8, 4)!)])).toEqual(['1,4']);
    expect(coords([grid.away(grid.at(4, 4)!, grid.at(8, 4)!)])).toEqual(['3,4']);
  });

  it('breaks ties at random among equal neighbors', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const { grid } = world(
        { width: 9, height: 9, wrap: false, neighborhood: 'vonNeumann' },
        0,
        seed,
      );
      seen.add(coords([grid.toward(grid.at(0, 0)!, grid.at(5, 5)!)])[0]!);
    }
    expect([...seen].sort()).toEqual(['0,1', '1,0']);
  });

  it('returns undefined when nothing improves', () => {
    const { grid } = world({ width: 5, height: 5, wrap: false });
    expect(grid.toward(grid.at(2, 2)!, grid.at(2, 2)!)).toBeUndefined();
    expect(grid.away(grid.at(0, 0)!, grid.at(4, 4)!)).toBeUndefined();
    const vn = world({ width: 5, height: 5, wrap: false, neighborhood: 'vonNeumann' }).grid;
    expect(coords([vn.away(vn.at(0, 0)!, vn.at(1, 0)!)])).toEqual(['0,1']);
  });

  it('goes the short way across the wrap', () => {
    const { grid } = world({ width: 10, height: 10, neighborhood: 'vonNeumann' });
    expect(coords([grid.toward(grid.at(0, 0)!, grid.at(9, 0)!)])).toEqual(['9,0']);
  });
});

describe('occupancy', () => {
  it('moves, leaves, and tracks occupants', () => {
    const { grid, walkers } = world({ width: 3, height: 3 }, 2);
    const [a, b] = walkers.members as [Walker, Walker];
    expect(a.cell).toBeUndefined();
    a.moveTo(grid.at(1, 1)!);
    expect(a.cell).toBe(grid.at(1, 1));
    expect(grid.at(1, 1)!.occupants).toEqual([a]);
    expect(grid.at(1, 1)!.occupant).toBe(a);
    expect(grid.at(1, 1)!.isAvailable).toBe(false);
    a.moveTo(grid.at(1, 1)!);
    expect(grid.at(1, 1)!.occupants).toEqual([a]);
    a.moveTo(grid.at(2, 2)!);
    expect(grid.at(1, 1)!.isAvailable).toBe(true);
    expect(grid.at(2, 2)!.occupant).toBe(a);
    b.moveTo(grid.at(1, 1)!);
    a.leave();
    a.leave();
    expect(a.cell).toBeUndefined();
    expect(grid.at(2, 2)!.occupants).toEqual([]);
  });

  it('refuses occupied cells under single occupancy, leaving state intact', () => {
    const { grid, walkers } = world({ width: 3, height: 3 }, 2);
    const [a, b] = walkers.members as [Walker, Walker];
    a.moveTo(grid.at(0, 0)!);
    b.moveTo(grid.at(1, 0)!);
    expect(() => b.moveTo(grid.at(0, 0)!)).toThrow(/occupied/);
    expect(b.cell).toBe(grid.at(1, 0));
    expect(grid.at(0, 0)!.occupants).toEqual([a]);
  });

  it('allows several occupants with multiOccupancy', () => {
    const { grid, walkers } = world({ width: 2, height: 2, multiOccupancy: true }, 3);
    for (const walker of walkers.members) walker.moveTo(grid.at(0, 0)!);
    expect(grid.at(0, 0)!.occupants).toHaveLength(3);
    expect(grid.at(0, 0)!.occupant).toBe(walkers.members[0]);
    walkers.members[0]!.leave();
    expect(grid.at(0, 0)!.occupant).toBe(walkers.members[1]);
  });

  it('frees the cell when the occupant dies', () => {
    const { grid, walkers } = world({ width: 2, height: 2 }, 1);
    const walker = walkers.members[0]!;
    walker.moveTo(grid.at(0, 0)!);
    walker.die();
    expect(walker.cell).toBeUndefined();
    expect(grid.at(0, 0)!.isAvailable).toBe(true);
    expect(() => walker.moveTo(grid.at(1, 1)!)).toThrow();
    const next = walkers.spawn();
    next.moveTo(grid.at(0, 0)!);
    expect(grid.at(0, 0)!.occupant).toBe(next);
  });

  it('reports neighboring occupants and moves to available neighbors', () => {
    const { grid, walkers } = world({ width: 3, height: 3, neighborhood: 'vonNeumann' }, 5);
    const [center, n, e, s, w] = walkers.members as [Walker, Walker, Walker, Walker, Walker];
    center.moveTo(grid.at(1, 1)!);
    n.moveTo(grid.at(1, 0)!);
    e.moveTo(grid.at(2, 1)!);
    s.moveTo(grid.at(1, 2)!);
    w.moveTo(grid.at(0, 1)!);
    expect(center.neighboringOccupants()).toEqual([n, w, e, s]);
    expect(center.moveToRandomAvailableNeighbor()).toBe(false);
    expect(center.cell).toBe(grid.at(1, 1));
    s.leave();
    expect(center.moveToRandomAvailableNeighbor()).toBe(true);
    expect(center.cell).toBe(grid.at(1, 2));
    const loner = walkers.spawn();
    expect(loner.neighboringOccupants()).toEqual([]);
    expect(loner.moveToRandomAvailableNeighbor()).toBe(false);
  });

  it('subclass removed() works when calling super', () => {
    class Mortal extends Occupant {
      buried = false;
      override removed(): void {
        super.removed();
        this.buried = true;
      }
    }
    const grid = new GridScape({ name: 'g', width: 2, height: 2 });
    const mortals = new Scape<Mortal>({ name: 'm', size: 1, create: () => new Mortal() });
    new Simulation({
      name: 't',
      parameters: {},
      build(sim) {
        sim.addScape(grid);
        sim.addScape(mortals);
      },
    });
    const mortal = mortals.members[0]!;
    mortal.moveTo(grid.at(0, 0)!);
    mortal.die();
    expect(mortal.buried).toBe(true);
    expect(grid.at(0, 0)!.isAvailable).toBe(true);
  });
});

describe('diffusion', () => {
  const diffuser = (
    options: Partial<GridScapeOptions<Patch>> & { width: number; height: number },
    rate: number,
    evaporation?: number,
  ) => {
    const w = world<Patch>({ create: () => new Patch(), ...options });
    w.grid.addRule(
      diffusion<Patch>({
        get: (c) => c.amount,
        set: (c, v) => {
          c.amount = v;
        },
        rate,
        ...(evaporation === undefined ? {} : { evaporation }),
      }),
    );
    return w;
  };
  const total = (grid: GridScape<Patch>) => grid.members.reduce((sum, c) => sum + c.amount, 0);

  it('conserves the total on a torus, in any order', () => {
    const { sim, grid } = diffuser({ width: 7, height: 5, order: 'shuffled' }, 0.4);
    grid.at(2, 3)!.amount = 100;
    grid.at(6, 0)!.amount = 25;
    for (let i = 0; i < 30; i++) {
      sim.step();
      expect(total(grid)).toBeCloseTo(125, 8);
    }
    expect(grid.at(0, 0)!.amount).toBeGreaterThan(0);
  });

  it('conserves the total on a bounded von Neumann grid too', () => {
    const { sim, grid } = diffuser(
      { width: 6, height: 4, wrap: false, neighborhood: 'vonNeumann' },
      0.7,
    );
    grid.at(0, 0)!.amount = 50;
    sim.run(25);
    expect(total(grid)).toBeCloseTo(50, 8);
  });

  it('spreads one step symmetrically', () => {
    const { sim, grid } = diffuser({ width: 5, height: 5 }, 0.8);
    grid.at(2, 2)!.amount = 80;
    sim.step();
    expect(grid.at(2, 2)!.amount).toBeCloseTo(16);
    for (const n of grid.neighbors(grid.at(2, 2)!)) expect(n.amount).toBeCloseTo(8);
    expect(grid.at(0, 0)!.amount).toBe(0);
    sim.run(5);
    expect(grid.at(1, 2)!.amount).toBeCloseTo(grid.at(3, 2)!.amount, 10);
    expect(grid.at(2, 1)!.amount).toBeCloseTo(grid.at(2, 3)!.amount, 10);
    expect(grid.at(1, 2)!.amount).toBeCloseTo(grid.at(2, 1)!.amount, 10);
  });

  it('with rate 0 changes nothing; evaporation removes a fraction', () => {
    const still = diffuser({ width: 3, height: 3 }, 0);
    still.grid.at(1, 1)!.amount = 9;
    still.sim.run(3);
    expect(still.grid.at(1, 1)!.amount).toBe(9);
    const decay = diffuser({ width: 3, height: 3 }, 0.5, 0.1);
    decay.grid.at(1, 1)!.amount = 90;
    decay.sim.step();
    expect(total(decay.grid)).toBeCloseTo(81);
  });

  it('does not depend on rule execution order', () => {
    const results = (['sequential', 'shuffled'] as const).map((order) => {
      const { sim, grid } = diffuser({ width: 4, height: 4, order }, 0.5);
      grid.at(0, 0)!.amount = 16;
      sim.run(3);
      return grid.members.map((c) => c.amount);
    });
    expect(results[0]).toEqual(results[1]);
  });

  it('validates its options', () => {
    const base = { get: () => 0, set: () => {} };
    expect(() => diffusion({ ...base, rate: 1.5 })).toThrow(RangeError);
    expect(() => diffusion({ ...base, rate: 0.5, evaporation: -0.1 })).toThrow(RangeError);
    expect(diffusion({ ...base, rate: 0.5 }).name).toBe('diffusion');
  });

  it('keeps a lone cell intact', () => {
    const { sim, grid } = diffuser({ width: 1, height: 1 }, 1);
    grid.at(0, 0)!.amount = 5;
    sim.step();
    expect(grid.at(0, 0)!.amount).toBe(5);
  });
});

describe('determinism', () => {
  const run = (seed: number): string => {
    const { sim, grid, walkers } = world({ width: 6, height: 6 }, 8, seed);
    for (const walker of walkers.members) walker.moveTo(grid.randomAvailableCell()!);
    walkers.addRule('walk', (walker) => {
      walker.steps++;
      walker.moveToRandomAvailableNeighbor();
    });
    sim.run(40);
    return walkers.members.map((w) => `${w.cell!.x},${w.cell!.y}`).join(' ');
  };

  it('repeats a random-walk model exactly with the same seed', () => {
    expect(run(11)).toBe(run(11));
    expect(run(11)).not.toBe(run(12));
  });
});
