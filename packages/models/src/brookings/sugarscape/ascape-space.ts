// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.util.Utility (uniqueSeries),
// org.ascape.model.space.Array2DBase (findWithinVonNeumannLineOfSight, findRandomUnoccupied),
// org.ascape.model.space.CollectionSpace (findMaximum), org.ascape.model.space.Discrete
// (findRandomAvailable), org.ascape.model.HostCell (isNeighborAvailable,
// findRandomAvailableNeighbor), org.ascape.util.data.DataPointConcrete (equals),
// org.ascape.model.rule.Diffusion.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/*
 * Small pieces of Ascape framework behaviour that the Sugarscape models depend
 * on and that the Metascape engine does not provide in exactly this form. They
 * reproduce Ascape's semantics (orderings, tie breaking, fallbacks), not its
 * random number sequence.
 */
import type { Cell, GridScape, Random, Rule } from '@metascape/engine';

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const result: number[][] = [];
  const build = (prefix: number[], rest: number[]): void => {
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      build([...prefix, rest[i]!], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  build(
    [],
    Array.from({ length: n }, (_, i) => i + 1),
  );
  return result;
}

/**
 * Ascape's `Utility.uniqueSeries`: for n = 0..4, every ordering of 1..n in
 * lexicographic order. Rules pick one at random to visit up to four
 * von Neumann neighbors in random order.
 */
export const UNIQUE_SERIES: readonly (readonly (readonly number[])[])[] = [0, 1, 2, 3, 4].map((n) =>
  permutations(n),
);

/**
 * `Utility.uniqueSeries[n][randomToLimit(uniqueSeries[n].length)]`: one draw.
 * Throws for more than four neighbors, as the legacy array lookup would.
 */
export function randomSeries(random: Random, n: number): readonly number[] {
  const series = UNIQUE_SERIES[n];
  if (!series) throw new RangeError(`No unique series for ${n} neighbors (von Neumann only)`);
  return series[random.int(0, series.length)]!;
}

/** `DataPointConcrete.equals(double, double)`: equal, or equal within 1e-10 (relative or absolute). */
export function ascapeEquals(v1: number, v2: number): boolean {
  if (v1 === v2) return true;
  const epsilon = 1.0e-10;
  return Math.abs((v1 - v2) / (v1 + v2)) < epsilon || Math.abs(v1 - v2) < epsilon;
}

/**
 * `CollectionSpace.findMaximum`: the item with the greatest value; if several
 * share it (by {@link ascapeEquals}), one of them uniformly at random. A random
 * draw is made only when there is a tie.
 */
export function findMaximum<T>(
  items: readonly T[],
  value: (item: T) => number,
  random: Random,
): T | undefined {
  let maxValue = -Number.MAX_VALUE;
  let maxObject: T | undefined;
  let ties: T[] | undefined;
  for (const item of items) {
    const v = value(item);
    if (v > maxValue) {
      maxValue = v;
      maxObject = item;
      ties = undefined;
    } else if (ascapeEquals(v, maxValue)) {
      ties ??= [maxObject as T];
      ties.push(item);
    }
  }
  return ties ? ties[random.int(0, ties.length)] : maxObject;
}

/**
 * `Array2DBase.findWithinVonNeumannLineOfSight` with `includeSelf` on a
 * periodic lattice: the origin first, then for each distance i = 1..d the
 * cells at (x+i, y), (x-i, y), (x, y+i), (x, y-i), in that order. Legacy code
 * indexes into this list, so the order matters. Only valid while 2d + 1 fits
 * in both dimensions (Ascape uses another code path otherwise).
 */
export function lineOfSight<C extends Cell>(grid: GridScape<C>, origin: C, distance: number): C[] {
  const d = Math.floor(distance);
  if (2 * d + 1 > grid.width || 2 * d + 1 > grid.height) {
    throw new RangeError(`Line of sight ${d} does not fit a ${grid.width}x${grid.height} lattice`);
  }
  const cells: C[] = [origin];
  for (let i = 1; i <= d; i++) {
    cells.push(
      grid.at(origin.x + i, origin.y)!,
      grid.at(origin.x - i, origin.y)!,
      grid.at(origin.x, origin.y + i)!,
      grid.at(origin.x, origin.y - i)!,
    );
  }
  return cells;
}

/** `Array2DBase.findRandom()`: a uniformly random cell, drawing x then y. */
function randomCell<C extends Cell>(grid: GridScape<C>, random: Random): C {
  const x = random.int(0, grid.width);
  const y = random.int(0, grid.height);
  return grid.at(x, y)!;
}

/** `Discrete.findAvailable()` then a random pick: any free cell of the whole lattice. */
function randomAvailableAnywhere<C extends Cell>(
  grid: GridScape<C>,
  random: Random,
): C | undefined {
  const available = grid.members.filter((cell) => cell.isAvailable);
  return available.length > 0 ? available[random.int(0, available.length)] : undefined;
}

/**
 * `Discrete.findRandomUnoccupiedCell()`: up to ten random cells are tried;
 * after that a free cell is chosen among all free cells. `undefined` if the
 * lattice is full.
 */
export function findRandomUnoccupiedCell<C extends Cell>(
  grid: GridScape<C>,
  random: Random,
): C | undefined {
  for (let i = 0; i < 10; i++) {
    const cell = randomCell(grid, random);
    if (cell.isAvailable) return cell;
  }
  return randomAvailableAnywhere(grid, random);
}

/**
 * `Array2DBase.findRandomUnoccupied(x, y, width, height)`: up to ten random
 * cells inside the rectangle are tried; after that, as in Ascape, the fallback
 * is a random free cell of the WHOLE lattice, not of the rectangle.
 */
export function findRandomUnoccupiedWithin<C extends Cell>(
  grid: GridScape<C>,
  random: Random,
  x: number,
  y: number,
  width: number,
  height: number,
): C | undefined {
  for (let i = 0; i < 10; i++) {
    // Array2DBase.findRandom(x, y, w, h): randomInRange(x, x + w - 1), then y; wrapped.
    const cx = x + random.int(0, width);
    const cy = y + random.int(0, height);
    const cell = grid.at(cx, cy)!;
    if (cell.isAvailable) return cell;
  }
  return randomAvailableAnywhere(grid, random);
}

/** `HostCell.isNeighborAvailable()`. */
export function isNeighborAvailable(cell: Cell): boolean {
  return cell.neighbors.some((neighbor) => neighbor.isAvailable);
}

/** `HostCell.findRandomAvailableNeighbor()`: one draw among the free neighbors, or `undefined`. */
export function findRandomAvailableNeighbor<C extends Cell>(
  cell: C,
  random: Random,
): C | undefined {
  const available = cell.neighbors.filter((neighbor) => neighbor.isAvailable);
  return available.length > 0 ? available[random.int(0, available.length)] : undefined;
}

/** A cell that can take part in {@link ascapeDiffusion}. */
export interface Diffusable {
  diffusionTemp: number;
}

/**
 * `org.ascape.model.rule.Diffusion`: a two-phase rule in which every cell
 * computes the mean of its neighbors' values (its own value is not included)
 * and then takes that mean as its new value.
 */
export function ascapeDiffusion<C extends Cell & Diffusable>(
  name: string,
  get: (cell: C) => number,
  set: (cell: C, value: number) => void,
): Rule<C> {
  return {
    name,
    execute(cell) {
      const neighbors = cell.neighbors as readonly C[];
      let sum = 0;
      for (const neighbor of neighbors) sum += get(neighbor);
      cell.diffusionTemp = sum / neighbors.length;
    },
    update(cell) {
      set(cell, cell.diffusionTemp);
    },
  };
}
