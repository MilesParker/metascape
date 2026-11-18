// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import type { HostCell } from '../cell';
import { RootScape } from '../root';
import { Scape } from '../scape';
import { Array2DMoore, LatticeRanks, type Array2D, type Metric } from './index';

function grid(
  width: number,
  height: number,
  periodic = true,
): { root: RootScape; grid: Array2D<HostCell> } {
  let found: Array2D<HostCell> | undefined;
  const root = new RootScape(
    {
      name: 'ranks-test',
      parameters: {},
      build(s: RootScape) {
        found = s.add(
          new Scape<HostCell>({
            name: 'grid',
            space: new Array2DMoore(),
            extent: [width, height],
            periodic,
          }),
        ).space as Array2D<HostCell>;
      },
    },
    { seed: 1 },
  );
  return { root, grid: found! };
}

describe('LatticeRanks', () => {
  it("holds Ascape's table: 135 ranks of 1,089 offsets, nearest first", () => {
    const { ranks, size } = LatticeRanks.ascape;
    expect(ranks.length).toBe(135);
    expect(size).toBe(33 * 33);
    expect(ranks[0]).toEqual({ distance: 0, offsets: [[0, 0]] });
    expect(ranks[1]!.offsets).toEqual([
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(ranks[2]!.distance).toBe(Math.SQRT2);
    expect(ranks.at(-1)!.distance).toBe(Math.sqrt(512));
  });

  it('orders offsets within a rank by rows or by columns', () => {
    const columns = new LatticeRanks({ order: 'columns' });
    expect(columns.ranks[1]!.offsets).toEqual([
      [-1, 0],
      [0, -1],
      [0, 1],
      [1, 0],
    ]);
  });

  it('leaves out offsets beyond a distance', () => {
    const table = new LatticeRanks({ reach: 7, maxDistance: Math.sqrt(61) });
    // Bionland's table: 29 ranks, the origin's included.
    expect(table.ranks.length).toBe(29);
    expect(table.ranks.at(-1)!.distance).toBe(Math.sqrt(61));
  });

  it('finds the nearest match by rank, strictly within the distance', () => {
    const { root, grid: g } = grid(20, 20);
    const origin = g.at(5, 5)!;
    const target = g.at(8, 5)!;
    const is = (cell: HostCell) => cell === target;
    expect(LatticeRanks.ascape.findNearest(g, origin, is, false, 3, root.random)).toBeUndefined();
    expect(LatticeRanks.ascape.findNearest(g, origin, is, false, 3.01, root.random)).toBe(target);
    expect(LatticeRanks.ascape.nearestRank(g, origin, is, false, 4)).toBe(6);
    expect(LatticeRanks.ascape.findNearest(g, origin, () => true, true, 1, root.random)).toBe(
      origin,
    );
  });

  it('visits cells within a distance, inclusive', () => {
    const { grid: g } = grid(20, 20);
    let n = 0;
    LatticeRanks.ascape.forEachWithin(g, g.at(0, 0)!, false, 1.5, () => n++);
    expect(n).toBe(8);
  });

  it('skips offsets off a bounded lattice', () => {
    const { grid: g } = grid(5, 5, false);
    let n = 0;
    LatticeRanks.ascape.forEachWithin(g, g.at(0, 0)!, true, 1, () => n++);
    expect(n).toBe(3);
  });

  describe('covering', () => {
    const cases: [number, number, boolean, Metric][] = [
      [5, 4, true, 'euclidean'],
      [6, 3, true, 'chebyshev'],
      [4, 5, false, 'manhattan'],
    ];
    it.each(cases)(
      'reaches every cell of %i x %i (periodic %s, %s) once, by distance',
      (w, h, periodic, metric) => {
        const { grid: g } = grid(w, h, periodic);
        const table = LatticeRanks.covering(w, h, periodic, metric);
        for (const origin of [g.at(0, 0)!, g.at(w - 1, h - 1)!, g.at(2, 1)!]) {
          const seen: HostCell[] = [];
          let last = -1;
          for (let r = 0; r < table.ranks.length; r++) {
            const cells = table.matchesInRank(g, origin, () => true, r);
            for (const cell of cells) {
              expect(g.distance(origin, cell, metric)).toBe(table.ranks[r]!.distance);
            }
            if (cells.length > 0) {
              expect(table.ranks[r]!.distance).toBeGreaterThan(last);
              last = table.ranks[r]!.distance;
            }
            seen.push(...cells);
          }
          expect(seen.length).toBe(w * h);
          expect(new Set(seen).size).toBe(w * h);
        }
      },
    );
  });
});
