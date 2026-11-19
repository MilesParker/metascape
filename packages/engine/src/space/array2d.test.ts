// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it, vi } from 'vitest';
import { Cell, HostCell } from '../cell';
import { CellOccupant } from '../cell-occupant';
import { RootScape } from '../root';
import { Scape } from '../scape';
import { Array2D, Array2DMoore, Array2DVonNeumann, diffusion, type Neighborhood } from './index';

class Patch extends HostCell {
  amount = 0;
}

interface Fixture<C extends HostCell = HostCell> {
  root: RootScape;
  /** The space of the scape of cells. */
  grid: Array2D<C>;
  walkers: Scape<Walker>;
}

class Walker extends CellOccupant {
  steps = 0;
}

/** How the test lattice is made. */
interface LatticeOptions<C> {
  readonly width: number;
  readonly height: number;
  readonly periodic?: boolean;
  readonly neighborhood?: Neighborhood;
  readonly multiOccupancy?: boolean;
  readonly create?: (x: number, y: number) => C;
}

/** A scape of cells with a Moore or von Neumann lattice space. */
function lattice<C extends HostCell>(name: string, options: LatticeOptions<C>): Scape<C> {
  const { width, height, periodic, neighborhood, multiOccupancy, create } = options;
  const space =
    neighborhood === 'vonNeumann'
      ? new Array2DVonNeumann<C>({ multiOccupancy: multiOccupancy ?? false })
      : new Array2DMoore<C>({ multiOccupancy: multiOccupancy ?? false });
  return new Scape<C>({
    name,
    space,
    extent: [width, height],
    ...(periodic !== undefined && { periodic }),
    ...(create && { prototypeAgent: (i: number) => create(i % width, Math.floor(i / width)) }),
  });
}

function model<C extends HostCell = HostCell>(
  options: LatticeOptions<C>,
  walkerCount = 0,
  seed = 1,
): Fixture<C> {
  const holder = {} as Fixture<C>;
  const root = new RootScape(
    {
      name: 'grid-test',
      parameters: {},
      build(s: RootScape) {
        holder.grid = s.add(lattice<C>('grid', options)).space as Array2D<C>;
        holder.walkers = s.add(
          new Scape<Walker>({
            name: 'walkers',
            size: walkerCount,
            prototypeAgent: () => new Walker(),
          }),
        );
      },
    },
    { seed },
  );
  holder.root = root;
  return holder;
}

const coords = (cells: readonly (Cell | undefined)[]): string[] =>
  cells.map((cell) => (cell ? `${cell.x},${cell.y}` : 'none'));
const sorted = (cells: readonly Cell[]): string[] => coords(cells).sort();

describe('population', () => {
  it('creates cells in row-major order with coordinates', () => {
    const { grid } = model({ width: 3, height: 2 });
    expect(grid.scape.size).toBe(6);
    expect(coords(grid.members)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
    expect(grid.members.map((c) => c.id)).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => grid.members[0]!.id + i),
    );
  });

  it('uses a custom create function and defaults to plain cells', () => {
    const custom = model<Patch>({
      width: 2,
      height: 2,
      create: (x, y) => Object.assign(new Patch(), { amount: x + 10 * y }),
    });
    expect(custom.grid.members.map((p) => p.amount)).toEqual([0, 1, 10, 11]);
    expect(model({ width: 1, height: 1 }).grid.at(0, 0)).toBeInstanceOf(Cell);
  });

  it('rejects invalid sizes', () => {
    expect(() => lattice('bad', { width: 0, height: 3 })).toThrow(RangeError);
    expect(() => lattice('bad', { width: 3, height: 2.5 })).toThrow(RangeError);
  });

  it('has fixed membership', () => {
    const { grid } = model({ width: 2, height: 2 });
    expect(() => grid.scape.add(new HostCell())).toThrow(/fixed membership/);
    expect(() => grid.scape.newAgent()).toThrow(/fixed membership/);
    expect(() => grid.scape.remove(grid.at(0, 0)!)).toThrow(/fixed membership/);
    expect(() => grid.at(1, 1)!.die()).toThrow(/fixed membership/);
    expect(grid.scape.size).toBe(4);
  });

  it('cell properties delegate to the space of their scape', () => {
    const { grid } = model({ width: 3, height: 3 });
    const cell = grid.at(1, 1)!;
    expect(cell.scape.space).toBe(grid);
    expect(cell.neighbors).toBe(grid.neighbors(cell));
    expect(cell.occupants).toEqual([]);
    expect(cell.occupant).toBeUndefined();
    expect(cell.isAvailable).toBe(true);
  });
});

describe('at', () => {
  it('wraps on a torus', () => {
    const { grid } = model({ width: 5, height: 4 });
    expect(coords([grid.at(-1, -1), grid.at(5, 4), grid.at(7, -3), grid.at(2, 2)])).toEqual([
      '4,3',
      '0,0',
      '2,1',
      '2,2',
    ]);
    expect(grid.at(0.5, 1)).toBeUndefined();
  });

  it('returns undefined out of range when bounded', () => {
    const { grid } = model({ width: 5, height: 4, periodic: false });
    expect(grid.at(-1, 0)).toBeUndefined();
    expect(grid.at(5, 0)).toBeUndefined();
    expect(grid.at(0, 4)).toBeUndefined();
    expect(coords([grid.at(4, 3)])).toEqual(['4,3']);
  });
});

describe('neighbors', () => {
  it('lists moore neighbors in documented order, cached and read-only', () => {
    const { grid } = model({ width: 5, height: 5 });
    const list = grid.neighbors(grid.at(2, 2)!);
    expect(coords(list)).toEqual(['1,1', '2,1', '3,1', '1,2', '3,2', '1,3', '2,3', '3,3']);
    expect(grid.neighbors(grid.at(2, 2)!)).toBe(list);
    expect(() => (list as HostCell[]).push(grid.at(0, 0)!)).toThrow();
  });

  it('lists von Neumann neighbors in documented order', () => {
    const { grid } = model({ width: 5, height: 5, neighborhood: 'vonNeumann' });
    expect(coords(grid.neighbors(grid.at(2, 2)!))).toEqual(['2,1', '1,2', '3,2', '2,3']);
  });

  it('wraps at corners', () => {
    const { grid } = model({ width: 5, height: 5 });
    expect(sorted(grid.neighbors(grid.at(0, 0)!))).toEqual(
      ['4,4', '0,4', '1,4', '4,0', '1,0', '4,1', '0,1', '1,1'].sort(),
    );
  });

  it('has fewer neighbors at bounded edges', () => {
    const moore = model({ width: 5, height: 5, periodic: false }).grid;
    expect(coords(moore.neighbors(moore.at(0, 0)!))).toEqual(['1,0', '0,1', '1,1']);
    expect(moore.neighbors(moore.at(0, 2)!)).toHaveLength(5);
    expect(moore.neighbors(moore.at(2, 2)!)).toHaveLength(8);
    const vn = model({ width: 5, height: 5, periodic: false, neighborhood: 'vonNeumann' }).grid;
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
        const { grid } = model({ width, height, neighborhood });
        for (const cell of grid.members) {
          const list = grid.neighbors(cell);
          expect(new Set(list).size).toBe(list.length);
          expect(list).not.toContain(cell);
        }
      }
    }
    const two = model({ width: 2, height: 2 }).grid;
    expect(sorted(two.neighbors(two.at(0, 0)!))).toEqual(['0,1', '1,0', '1,1']);
    const one = model({ width: 1, height: 1 }).grid;
    expect(one.neighbors(one.at(0, 0)!)).toEqual([]);
  });

  it('rejects cells of another grid', () => {
    const a = model({ width: 3, height: 3 }).grid;
    const b = model({ width: 3, height: 3 }).grid;
    expect(() => a.neighbors(b.at(1, 1)!)).toThrow(/not a member/);
  });
});

describe('distance', () => {
  it('measures all three metrics on a bounded grid', () => {
    const { grid } = model({ width: 10, height: 10, periodic: false });
    const a = grid.at(1, 1)!;
    const b = grid.at(4, 5)!;
    expect(grid.distance(a, b, 'chebyshev')).toBe(4);
    expect(grid.distance(a, b, 'manhattan')).toBe(7);
    expect(grid.distance(a, b, 'euclidean')).toBe(5);
    expect(grid.distance(a, a)).toBe(0);
  });

  it('takes the shortest way round on a torus', () => {
    const { grid } = model({ width: 10, height: 8 });
    const a = grid.at(0, 0)!;
    const b = grid.at(9, 7)!;
    expect(grid.distance(a, b, 'chebyshev')).toBe(1);
    expect(grid.distance(a, b, 'manhattan')).toBe(2);
    expect(grid.distance(a, b, 'euclidean')).toBeCloseTo(Math.SQRT2);
    expect(grid.distance(grid.at(1, 0)!, grid.at(6, 0)!, 'manhattan')).toBe(5);
  });

  it('defaults by neighborhood', () => {
    const moore = model({ width: 9, height: 9 }).grid;
    const vn = model({ width: 9, height: 9, neighborhood: 'vonNeumann' }).grid;
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
    const { grid } = model({ width: 5, height: 5 });
    const result = grid.findWithin(grid.at(2, 2)!, 1);
    expect(coords(result)).toEqual(box(1, 3, 1, 3).filter((c) => c !== '2,2'));
    expect(coords(grid.findWithin(grid.at(2, 2)!, 1, { includeSelf: true }))).toEqual(
      box(1, 3, 1, 3),
    );
    expect(grid.findWithin(grid.at(2, 2)!, 0)).toEqual([]);
    expect(grid.findWithin(grid.at(2, 2)!, -1, { includeSelf: true })).toEqual([]);
    expect(coords(grid.findWithin(grid.at(2, 2)!, 0, { includeSelf: true }))).toEqual(['2,2']);
  });

  it('handles manhattan and euclidean shapes', () => {
    const { grid } = model({ width: 7, height: 7, periodic: false });
    const o = grid.at(3, 3)!;
    expect(sorted(grid.findWithin(o, 2, { metric: 'manhattan' }))).toEqual(
      ['3,1', '2,2', '3,2', '4,2', '1,3', '2,3', '4,3', '5,3', '2,4', '3,4', '4,4', '3,5'].sort(),
    );
    // radius 2 euclidean: no (+-2,+-2), but (+-2,+-1) etc. are out as sqrt(5)>2
    expect(sorted(grid.findWithin(o, 2, { metric: 'euclidean' }))).toEqual(
      ['3,1', '2,2', '3,2', '4,2', '1,3', '2,3', '4,3', '5,3', '2,4', '3,4', '4,4', '3,5'].sort(),
    );
    expect(grid.findWithin(o, 2.3, { metric: 'euclidean' })).toHaveLength(20);
  });

  it('is clipped at bounded corners', () => {
    const { grid } = model({ width: 5, height: 5, periodic: false });
    expect(coords(grid.findWithin(grid.at(0, 0)!, 2))).toEqual([
      '1,0',
      '2,0',
      '0,1',
      '1,1',
      '2,1',
      '0,2',
      '1,2',
      '2,2',
    ]);
    expect(grid.findWithin(grid.at(0, 0)!, 100)).toHaveLength(24);
  });

  it('wraps at corners of a torus', () => {
    const { grid } = model({ width: 5, height: 5 });
    expect(sorted(grid.findWithin(grid.at(0, 0)!, 1))).toEqual(
      ['4,4', '0,4', '1,4', '4,0', '1,0', '4,1', '0,1', '1,1'].sort(),
    );
  });

  it('lists each cell once on small and over-large tori', () => {
    const three = model({ width: 3, height: 3 }).grid;
    for (const radius of [1, 2, 10]) {
      const result = three.findWithin(three.at(1, 1)!, radius);
      expect(new Set(result).size).toBe(result.length);
      expect(result).toHaveLength(8);
    }
    expect(three.findWithin(three.at(1, 1)!, 10, { includeSelf: true })).toHaveLength(9);
    const even = model({ width: 4, height: 2 }).grid;
    const result = even.findWithin(even.at(0, 0)!, 3, { includeSelf: true });
    expect(new Set(result).size).toBe(8);
  });

  it('agrees with distance() for every metric', () => {
    for (const periodic of [true, false]) {
      const { grid } = model({ width: 6, height: 5, periodic });
      for (const metric of ['chebyshev', 'manhattan', 'euclidean'] as const) {
        for (const origin of [grid.at(0, 0)!, grid.at(3, 2)!, grid.at(5, 4)!]) {
          for (const radius of [1, 2, 3]) {
            const expected = grid.members
              .filter((c) => c !== origin && grid.distance(origin, c, metric) <= radius)
              .map((c) => `${c.x},${c.y}`)
              .sort();
            expect(sorted(grid.findWithin(origin, radius, { metric }))).toEqual(expected);
          }
        }
      }
    }
  });

  it('is deterministic and repeatable (cached templates)', () => {
    const { grid } = model({ width: 6, height: 6 });
    const origin = grid.at(1, 1)!;
    expect(coords(grid.findWithin(origin, 2))).toEqual(coords(grid.findWithin(origin, 2)));
  });
});

describe('rays', () => {
  it('goes outward in each direction, nearest first', () => {
    const { grid } = model({ width: 5, height: 5, periodic: false });
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
    const { grid } = model({ width: 5, height: 5, neighborhood: 'vonNeumann' });
    expect(coords(grid.rays(grid.at(2, 2)!, 1))).toEqual(['2,1', '1,2', '3,2', '2,3']);
    expect(grid.rays(grid.at(2, 2)!, 0)).toEqual([]);
  });

  it('stops at bounded edges', () => {
    const { grid } = model({ width: 5, height: 5, periodic: false });
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
    const { grid } = model({ width: 5, height: 5, neighborhood: 'vonNeumann' });
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
        const { grid } = model({ width: size, height: size, neighborhood });
        for (const cell of grid.members) {
          const list = grid.rays(cell, 7);
          expect(new Set(list).size).toBe(list.length);
          expect(list).not.toContain(cell);
        }
      }
    }
    const three = model({ width: 3, height: 3 }).grid;
    expect(sorted(three.rays(three.at(1, 1)!, 5))).toHaveLength(8);
  });
});

describe('nearest', () => {
  it('finds the closest match, excluding the origin', () => {
    const { grid } = model<Patch>({
      width: 9,
      height: 9,
      periodic: false,
      create: () => new Patch(),
    });
    grid.at(7, 7)!.amount = 1;
    grid.at(2, 1)!.amount = 1;
    const origin = grid.at(0, 0)!;
    origin.amount = 1;
    expect(coords([grid.findNearest(origin, (c) => c.amount === 1)])).toEqual(['2,1']);
    expect(grid.findNearest(origin, (c) => c.amount === 5)).toBeUndefined();
    expect(grid.findNearest(origin, (c) => c.amount === 1, 1)).toBeUndefined();
    expect(coords([grid.findNearest(origin, (c) => c.amount === 1, 2)])).toEqual(['2,1']);
  });

  it('uses the default metric to order candidates', () => {
    const vn = model({ width: 9, height: 9, neighborhood: 'vonNeumann', periodic: false }).grid;
    const origin = vn.at(4, 4)!;
    // (6,6) is chebyshev 2 but manhattan 4; (4,0) is manhattan 4 too; (6,5) manhattan 3 wins.
    const targets = new Set([vn.at(6, 6)!, vn.at(4, 0)!, vn.at(6, 5)!]);
    expect(coords([vn.findNearest(origin, (c) => targets.has(c))])).toEqual(['6,5']);
  });

  it('works across the wrap', () => {
    const { grid } = model({ width: 10, height: 10 });
    const target = grid.at(9, 9)!;
    expect(grid.findNearest(grid.at(0, 0)!, (c) => c === target)).toBe(target);
  });

  it('breaks ties reproducibly per seed and reaches every tied cell', () => {
    const pick = (seed: number): string => {
      const { grid } = model({ width: 5, height: 5, periodic: false }, 0, seed);
      const found = grid.findNearest(grid.at(2, 2)!, () => true)!;
      return `${found.x},${found.y}`;
    };
    expect(pick(7)).toBe(pick(7));
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) seen.add(pick(seed));
    expect([...seen].sort()).toEqual(['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3']);
  });

  it('terminates when nothing matches on a tiny torus', () => {
    const { grid } = model({ width: 2, height: 2 });
    expect(grid.findNearest(grid.at(0, 0)!, () => false)).toBeUndefined();
    const one = model({ width: 1, height: 1 }).grid;
    expect(one.findNearest(one.at(0, 0)!, () => true)).toBeUndefined();
  });
});

describe('random cells', () => {
  it('picks cells reproducibly and honors conditions', () => {
    const run = (seed: number) => {
      const { grid } = model({ width: 6, height: 6 }, 0, seed);
      return [
        grid.scape.findRandom(),
        grid.scape.findRandom((c) => c.x === 5),
        grid.scape.findRandom(() => false),
      ].map((c) => (c ? `${c.x},${c.y}` : 'none'));
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)[1]).toMatch(/^5,/);
    expect(run(3)[2]).toBe('none');
  });

  it('findRandomAvailable skips occupied cells', () => {
    const { grid, walkers } = model({ width: 2, height: 1 }, 1);
    const walker = walkers.members[0]!;
    walker.moveTo(grid.at(0, 0)!);
    for (let i = 0; i < 20; i++) expect(grid.findRandomAvailable()).toBe(grid.at(1, 0));
    const other = walkers.newAgent();
    other.moveTo(grid.at(1, 0)!);
    expect(grid.findRandomAvailable()).toBeUndefined();
  });
});

describe('toward and away', () => {
  it('toward picks the neighbor that most reduces distance', () => {
    const { grid } = model({ width: 9, height: 9, periodic: false, neighborhood: 'vonNeumann' });
    expect(coords([grid.toward(grid.at(0, 4)!, grid.at(8, 4)!)])).toEqual(['1,4']);
    expect(coords([grid.away(grid.at(4, 4)!, grid.at(8, 4)!)])).toEqual(['3,4']);
  });

  it('breaks ties at random among equal neighbors', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const { grid } = model(
        { width: 9, height: 9, periodic: false, neighborhood: 'vonNeumann' },
        0,
        seed,
      );
      seen.add(coords([grid.toward(grid.at(0, 0)!, grid.at(5, 5)!)])[0]!);
    }
    expect([...seen].sort()).toEqual(['0,1', '1,0']);
  });

  it('returns undefined when nothing improves', () => {
    const { grid } = model({ width: 5, height: 5, periodic: false });
    expect(grid.toward(grid.at(2, 2)!, grid.at(2, 2)!)).toBeUndefined();
    expect(grid.away(grid.at(0, 0)!, grid.at(4, 4)!)).toBeUndefined();
    const vn = model({ width: 5, height: 5, periodic: false, neighborhood: 'vonNeumann' }).grid;
    expect(coords([vn.away(vn.at(0, 0)!, vn.at(1, 0)!)])).toEqual(['0,1']);
  });

  it('goes the short way across the wrap', () => {
    const { grid } = model({ width: 10, height: 10, neighborhood: 'vonNeumann' });
    expect(coords([grid.toward(grid.at(0, 0)!, grid.at(9, 0)!)])).toEqual(['9,0']);
  });
});

describe('occupancy', () => {
  it('moves, leaves, and tracks occupants', () => {
    const { grid, walkers } = model({ width: 3, height: 3 }, 2);
    const [a, b] = walkers.members as [Walker, Walker];
    expect(a.hostCell).toBeUndefined();
    a.moveTo(grid.at(1, 1)!);
    expect(a.hostCell).toBe(grid.at(1, 1));
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
    expect(a.hostCell).toBeUndefined();
    expect(grid.at(2, 2)!.occupants).toEqual([]);
  });

  it('refuses occupied cells under single occupancy, leaving state intact', () => {
    const { grid, walkers } = model({ width: 3, height: 3 }, 2);
    const [a, b] = walkers.members as [Walker, Walker];
    a.moveTo(grid.at(0, 0)!);
    b.moveTo(grid.at(1, 0)!);
    expect(() => b.moveTo(grid.at(0, 0)!)).toThrow(/occupied/);
    expect(b.hostCell).toBe(grid.at(1, 0));
    expect(grid.at(0, 0)!.occupants).toEqual([a]);
  });

  it('allows several occupants with multiOccupancy', () => {
    const { grid, walkers } = model({ width: 2, height: 2, multiOccupancy: true }, 3);
    for (const walker of walkers.members) walker.moveTo(grid.at(0, 0)!);
    expect(grid.at(0, 0)!.occupants).toHaveLength(3);
    expect(grid.at(0, 0)!.occupant).toBe(walkers.members[0]);
    walkers.members[0]!.leave();
    expect(grid.at(0, 0)!.occupant).toBe(walkers.members[1]);
  });

  it('frees the cell when the occupant dies', () => {
    const { grid, walkers } = model({ width: 2, height: 2 }, 1);
    const walker = walkers.members[0]!;
    walker.moveTo(grid.at(0, 0)!);
    walker.die();
    expect(walker.hostCell).toBeUndefined();
    expect(grid.at(0, 0)!.isAvailable).toBe(true);
    expect(() => walker.moveTo(grid.at(1, 1)!)).toThrow();
    const next = walkers.newAgent();
    next.moveTo(grid.at(0, 0)!);
    expect(grid.at(0, 0)!.occupant).toBe(next);
  });

  it('reports neighboring occupants and moves to available neighbors', () => {
    const { grid, walkers } = model({ width: 3, height: 3, neighborhood: 'vonNeumann' }, 5);
    const [center, n, e, s, w] = walkers.members as [Walker, Walker, Walker, Walker, Walker];
    center.moveTo(grid.at(1, 1)!);
    n.moveTo(grid.at(1, 0)!);
    e.moveTo(grid.at(2, 1)!);
    s.moveTo(grid.at(1, 2)!);
    w.moveTo(grid.at(0, 1)!);
    expect(center.neighboringOccupants()).toEqual([n, w, e, s]);
    expect(center.randomWalkAvailable()).toBe(false);
    expect(center.hostCell).toBe(grid.at(1, 1));
    s.leave();
    expect(center.randomWalkAvailable()).toBe(true);
    expect(center.hostCell).toBe(grid.at(1, 2));
    const loner = walkers.newAgent();
    expect(loner.neighboringOccupants()).toEqual([]);
    expect(loner.randomWalkAvailable()).toBe(false);
  });

  it('draws exactly one random number, matching a pick over the available neighbors', () => {
    const setup = () => {
      const w = model({ width: 5, height: 5, neighborhood: 'moore' }, 4, 7);
      const [mover, ...others] = w.walkers.members as [Walker, Walker, Walker, Walker];
      mover.moveTo(w.grid.at(2, 2)!);
      others[0]!.moveTo(w.grid.at(1, 1)!);
      others[1]!.moveTo(w.grid.at(3, 2)!);
      others[2]!.moveTo(w.grid.at(2, 3)!);
      return mover;
    };
    const actual = setup();
    const reference = setup();
    const spy = vi.spyOn(actual.random, 'int');
    for (let i = 0; i < 12; i++) {
      const options = reference.hostCell!.neighbors.filter((c) => c.isAvailable);
      reference.moveTo(reference.random.pick(options));
      spy.mockClear();
      expect(actual.randomWalkAvailable()).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(0, options.length);
      expect([actual.hostCell!.x, actual.hostCell!.y]).toEqual([
        reference.hostCell!.x,
        reference.hostCell!.y,
      ]);
    }
  });

  it('draws nothing when no neighbor is available', () => {
    const { grid, walkers } = model({ width: 2, height: 1 }, 2);
    const [a, b] = walkers.members as [Walker, Walker];
    a.moveTo(grid.at(0, 0)!);
    b.moveTo(grid.at(1, 0)!);
    const spy = vi.spyOn(a.random, 'int');
    expect(a.randomWalkAvailable()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('subclass removed() works when calling super', () => {
    class Mortal extends CellOccupant {
      buried = false;
      override removed(): void {
        super.removed();
        this.buried = true;
      }
    }
    const cells = lattice('g', { width: 2, height: 2 });
    const grid = cells.space as Array2D<HostCell>;
    const mortals = new Scape<Mortal>({ name: 'm', size: 1, prototypeAgent: () => new Mortal() });
    new RootScape({
      name: 't',
      parameters: {},
      build(root) {
        root.add(cells);
        root.add(mortals);
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
    options: LatticeOptions<Patch> & { order?: 'sequential' | 'shuffled' },
    rate: number,
    evaporation?: number,
  ) => {
    const w = model<Patch>({ create: () => new Patch(), ...options });
    const rule = diffusion<Patch>({
      get: (c) => c.amount,
      set: (c, v) => {
        c.amount = v;
      },
      rate,
      ...(evaporation === undefined ? {} : { evaporation }),
    });
    // A diffusion rule needs no random order; ask for one to show it does not matter.
    w.grid.scape.addRule({ ...rule, randomExecution: options.order === 'shuffled' });
    return w;
  };
  const total = (grid: Array2D<Patch>) => grid.members.reduce((sum, c) => sum + c.amount, 0);

  it('conserves the total on a torus, in any order', () => {
    const { root, grid } = diffuser({ width: 7, height: 5, order: 'shuffled' }, 0.4);
    grid.at(2, 3)!.amount = 100;
    grid.at(6, 0)!.amount = 25;
    for (let i = 0; i < 30; i++) {
      root.iterate();
      expect(total(grid)).toBeCloseTo(125, 8);
    }
    expect(grid.at(0, 0)!.amount).toBeGreaterThan(0);
  });

  it('conserves the total on a bounded von Neumann grid too', () => {
    const { root, grid } = diffuser(
      { width: 6, height: 4, periodic: false, neighborhood: 'vonNeumann' },
      0.7,
    );
    grid.at(0, 0)!.amount = 50;
    root.run(25);
    expect(total(grid)).toBeCloseTo(50, 8);
  });

  it('spreads one step symmetrically', () => {
    const { root, grid } = diffuser({ width: 5, height: 5 }, 0.8);
    grid.at(2, 2)!.amount = 80;
    root.iterate();
    expect(grid.at(2, 2)!.amount).toBeCloseTo(16);
    for (const n of grid.neighbors(grid.at(2, 2)!)) expect(n.amount).toBeCloseTo(8);
    expect(grid.at(0, 0)!.amount).toBe(0);
    root.run(5);
    expect(grid.at(1, 2)!.amount).toBeCloseTo(grid.at(3, 2)!.amount, 10);
    expect(grid.at(2, 1)!.amount).toBeCloseTo(grid.at(2, 3)!.amount, 10);
    expect(grid.at(1, 2)!.amount).toBeCloseTo(grid.at(2, 1)!.amount, 10);
  });

  it('with rate 0 changes nothing; evaporation removes a fraction', () => {
    const still = diffuser({ width: 3, height: 3 }, 0);
    still.grid.at(1, 1)!.amount = 9;
    still.root.run(3);
    expect(still.grid.at(1, 1)!.amount).toBe(9);
    const decay = diffuser({ width: 3, height: 3 }, 0.5, 0.1);
    decay.grid.at(1, 1)!.amount = 90;
    decay.root.iterate();
    expect(total(decay.grid)).toBeCloseTo(81);
  });

  it('does not depend on rule execution order', () => {
    const results = (['sequential', 'shuffled'] as const).map((order) => {
      const { root, grid } = diffuser({ width: 4, height: 4, order }, 0.5);
      grid.at(0, 0)!.amount = 16;
      root.run(3);
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
    const { root, grid } = diffuser({ width: 1, height: 1 }, 1);
    grid.at(0, 0)!.amount = 5;
    root.iterate();
    expect(grid.at(0, 0)!.amount).toBe(5);
  });
});

describe('determinism', () => {
  const run = (seed: number): string => {
    const { root, grid, walkers } = model({ width: 6, height: 6 }, 8, seed);
    for (const walker of walkers.members) walker.moveTo(grid.findRandomAvailable()!);
    walkers.addRule('walk', (walker) => {
      walker.steps++;
      walker.randomWalkAvailable();
    });
    root.run(40);
    return walkers.members.map((w) => `${w.hostCell!.x},${w.hostCell!.y}`).join(' ');
  };

  it('repeats a random-walk model exactly with the same seed', () => {
    expect(run(11)).toBe(run(11));
    expect(run(11)).not.toBe(run(12));
  });
});
