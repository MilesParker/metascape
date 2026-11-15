// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { HostCell } from '../cell';
import { RootScape } from '../root';
import { Scape } from '../scape';
import { Array2D, Array2DMoore } from './array2d';
import { Singleton } from './list';
import { wireSmallWorld, type SmallWorldOptions } from './small-world';

function lattice(wrap: boolean, options: SmallWorldOptions, seed = 2): Array2D<HostCell> {
  const root = new RootScape(
    {
      name: 'small world',
      parameters: {},
      build(s) {
        const cells = s.add(
          new Scape<HostCell>({
            name: 'g',
            space: new Array2DMoore<HostCell>(),
            extent: [8, 8],
            periodic: wrap,
          }),
        );
        s.add(new Scape({ name: 'wiring', space: new Singleton() })).addInitialRule('wire', () =>
          wireSmallWorld(cells.space as Array2D<HostCell>, options),
        );
      },
    },
    { seed },
  );
  return root.findScape('g').space as unknown as Array2D<HostCell>;
}

describe('wireSmallWorld', () => {
  it('gives the Moore neighborhood of the radius when nothing is rewired', () => {
    const bounded = lattice(false, {});
    expect(bounded.at(0, 0)!.neighbors).toHaveLength(3);
    expect(bounded.at(4, 4)!.neighbors).toHaveLength(8);
    expect(lattice(true, {}).at(0, 0)!.neighbors).toHaveLength(8);
    expect(lattice(true, { radius: 2 }).at(0, 0)!.neighbors).toHaveLength(24);
  });

  it('rewires links one way, never listing a cell twice', () => {
    const grid = lattice(false, { randomEdgeRatio: 0.5 });
    let rewired = 0;
    for (const cell of grid.members) {
      expect(new Set(cell.neighbors).size).toBe(cell.neighbors.length);
      const regular = grid.findWithin(cell, 1);
      expect(cell.neighbors).toHaveLength(regular.length);
      if (cell.neighbors.some((n) => !regular.includes(n))) rewired++;
    }
    expect(rewired).toBeGreaterThan(10);
  });

  it('is reproducible from the seed', () => {
    const ids = (grid: Array2D<HostCell>) =>
      grid.members.map((cell) => cell.neighbors.map((n) => n.id).join(',')).join(';');
    const a = ids(lattice(true, { randomEdgeRatio: 0.3 }, 7));
    expect(ids(lattice(true, { randomEdgeRatio: 0.3 }, 7))).toBe(a);
    expect(ids(lattice(true, { randomEdgeRatio: 0.3 }, 8))).not.toBe(a);
  });

  it('lets setNeighbors replace a single list', () => {
    const grid = lattice(true, {});
    const [a, b] = grid.members;
    grid.setNeighbors(a!, [b!]);
    expect(a!.neighbors).toEqual([b]);
    expect(grid.neighbors(a!)).toEqual([b]);
  });
});
