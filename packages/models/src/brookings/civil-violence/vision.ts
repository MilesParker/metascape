// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.model.space.Array2D (countWithin, findNearest), as used by edu.brook.cv.Citizen and Cop.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Cell, GridScape, Random } from '@metascape/engine';

/** The largest offset along either axis that Ascape's search tables cover. */
const REACH = 16;

interface Rank {
  /** Euclidean distance of every offset in the rank. */
  readonly distance: number;
  readonly offsets: readonly (readonly [number, number])[];
}

/**
 * Ascape searches a lattice in "ranks": all offsets at the same Euclidean
 * distance, nearest rank first, covering offsets up to 16 along each axis.
 */
const RANKS: readonly Rank[] = (() => {
  const byDistance = new Map<number, [number, number][]>();
  for (let dy = -REACH; dy <= REACH; dy++) {
    for (let dx = -REACH; dx <= REACH; dx++) {
      const d2 = dx * dx + dy * dy;
      const list = byDistance.get(d2) ?? [];
      list.push([dx, dy]);
      byDistance.set(d2, list);
    }
  }
  return [...byDistance.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d2, offsets]) => ({ distance: Math.sqrt(d2), offsets }));
})();

/**
 * Visits every cell within `maxDistance` (inclusive) of `origin`, as Ascape's
 * `countWithin` does. Edges wrap; a cell reached by several offsets on a small
 * lattice is visited once per offset, as in Ascape.
 */
export function forEachWithin(
  grid: GridScape<Cell>,
  origin: Cell,
  includeSelf: boolean,
  maxDistance: number,
  visit: (cell: Cell) => void,
): void {
  for (let r = includeSelf ? 0 : 1; r < RANKS.length; r++) {
    const rank = RANKS[r]!;
    if (rank.distance > maxDistance) return;
    for (const [dx, dy] of rank.offsets) visit(grid.at(origin.x + dx, origin.y + dy)!);
  }
}

/**
 * The nearest cell satisfying `test`, as Ascape's `findNearest`: ranks are
 * searched outward while their distance is strictly below `maxDistance`, and
 * one match of the first rank that has any is chosen at random.
 */
export function findNearest(
  grid: GridScape<Cell>,
  origin: Cell,
  includeSelf: boolean,
  maxDistance: number,
  test: (cell: Cell) => boolean,
  random: Random,
): Cell | undefined {
  for (let r = includeSelf ? 0 : 1; r < RANKS.length; r++) {
    const rank = RANKS[r]!;
    if (!(rank.distance < maxDistance)) return undefined;
    const matches: Cell[] = [];
    for (const [dx, dy] of rank.offsets) {
      const cell = grid.at(origin.x + dx, origin.y + dy)!;
      if (test(cell)) matches.push(cell);
    }
    if (matches.length > 0) return random.pick(matches);
  }
  return undefined;
}
