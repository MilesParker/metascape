// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: the neighbour searches the Bionland steps rely on, which
// live in the Ascape core spaces org.ascape.model.space.Array2D, Array2DBase, Array2DVonNeumann,
// Array1D, ListBase and CollectionSpace (findNearest, findCellToward, findCellAway,
// findMaximumWithin), as used by org.ascape.examples.bionland.Model_D to Model_M, Model_P, Model.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Cell, type GridScape, type Random } from '@metascape/engine';

/** Which Ascape lattice a Bionland step lives on. */
export type LatticeKind = 'moore' | 'vonNeumann' | 'ring';

/**
 * Ascape's table of neighbour "ranks" (cells grouped by Euclidean distance)
 * only covers 29 ranks, out to distance sqrt(61). Searches never reach past it.
 */
const MAX_RANK_DISTANCE_SQUARED = 61;

interface Rank {
  readonly distance: number;
  readonly offsets: readonly (readonly [number, number])[];
}

const RANKS: readonly Rank[] = (() => {
  const groups = new Map<number, [number, number][]>();
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 > MAX_RANK_DISTANCE_SQUARED) continue;
      const group = groups.get(d2) ?? [];
      group.push([dx, dy]);
      groups.set(d2, group);
    }
  }
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((d2) => ({ distance: Math.sqrt(d2), offsets: groups.get(d2) ?? [] }));
})();

/** The shortest distance between two positions on a periodic axis of `bound` sites. */
export function axisSpan(a: number, b: number, bound: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, bound - d);
}

/** One axis of Ascape's periodic `findCellToward`. */
function stepToward(o: number, t: number, e: number): number {
  let next = o;
  if (o > t) {
    next = o - t < t + (e - o) ? o - 1 : o + 1;
  } else if (o < t) {
    next = t - o < o + (e - t) ? o + 1 : o - 1;
  }
  if (next >= e) next = 0;
  else if (next < 0) next = e - 1;
  return next;
}

/** One axis of Ascape's periodic `findCellAway`, kept exactly as written (including its odd thresholds). */
function stepAway(o: number, t: number, e: number): number {
  const r = Math.floor(e / 2);
  const d = t - o;
  if (d > 0) {
    if (d < r - 1) return o > 0 ? o - 1 : e - 1;
    return o < e - 1 ? o + 1 : 0;
  }
  if (d < 0) {
    if (d > -r - 1) return o < e - 1 ? o + 1 : 0;
    return o > 0 ? o - 1 : e - 1;
  }
  return o;
}

/**
 * The cell one step from `from` toward `to` (Ascape `findCellToward`). The
 * result may be `from` itself. Moore and von Neumann lattices behave alike
 * here, since both are periodic.
 */
export function cellToward<C extends Cell>(grid: GridScape<C>, from: C, to: C): C {
  if (from === to) return from;
  const x = stepToward(from.x, to.x, grid.width);
  const y = grid.height === 1 ? 0 : stepToward(from.y, to.y, grid.height);
  return grid.at(x, y) as C;
}

/**
 * The cell one step from `from` away from `to` (Ascape `findCellAway`). On a
 * ring there is no fallback; on a lattice, if the cell is taken, the two
 * axis-aligned alternatives are tried in random order. Where `from === to`
 * a random neighbor is returned, whether free or not.
 */
export function cellAway<C extends Cell>(
  grid: GridScape<C>,
  from: C,
  to: C,
  ring: boolean,
  random: Random,
): C {
  if (from === to) return random.pick(grid.neighbors(from));
  if (ring) return grid.at(stepAway(from.x, to.x, grid.width), 0) as C;
  const ox = stepAway(from.x, to.x, grid.width);
  const oy = stepAway(from.y, to.y, grid.height);
  const target = grid.at(ox, oy) as C;
  if (target.isAvailable) return target;
  const first = random.chance();
  const a = grid.at(from.x, oy) as C;
  const b = grid.at(ox, from.y) as C;
  for (const candidate of first ? [a, b] : [b, a]) if (candidate.isAvailable) return candidate;
  return from;
}

/**
 * The nearest cell (other than `origin`) that meets a condition, as Ascape's
 * `findNearest` finds it. On a lattice, rings of equal Euclidean distance
 * strictly below `vision` are searched outward; on a ring, positions up to
 * `vision` steps away. A random one of the nearest matches is returned.
 */
export function nearestMatch<C extends Cell>(
  grid: GridScape<C>,
  origin: C,
  condition: (cell: C) => boolean,
  vision: number,
  ring: boolean,
  random: Random,
): C | undefined {
  if (ring) {
    const n = grid.width;
    for (let rank = 1; rank <= vision; rank++) {
      const upIndex = origin.x + rank >= n ? origin.x + rank - n : origin.x + rank;
      const downIndex = origin.x - rank < 0 ? origin.x - rank + n : origin.x - rank;
      const up = grid.at(upIndex, 0) as C;
      const down = grid.at(downIndex, 0) as C;
      if (!condition(up) && !condition(down)) continue;
      const order = random.chance() ? [up, down] : [down, up];
      return order.find(condition);
    }
    return undefined;
  }
  for (const rank of RANKS) {
    if (!(rank.distance < vision)) break;
    const matches: C[] = [];
    for (const [dx, dy] of rank.offsets) {
      const cell = grid.at(origin.x + dx, origin.y + dy) as C;
      if (condition(cell)) matches.push(cell);
    }
    if (matches.length > 0) return random.pick(matches);
  }
  return undefined;
}

/** Ascape's tolerance for treating two data values as equal. */
function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs((a - b) / (a + b)) < 1e-9 || Math.abs(a - b) < 1e-9;
}

/**
 * The cell within `vision` (the origin included) with the greatest value
 * (Ascape `findMaximumWithin`), a random one among ties. "Within" is the
 * lattice's own distance: Chebyshev on a Moore lattice, along rows and
 * columns only on a von Neumann lattice (Ascape's "line of sight"), and
 * ring distance on a ring.
 */
export function maximumWithin<C extends Cell>(
  grid: GridScape<C>,
  origin: C,
  value: (cell: C) => number,
  vision: number,
  kind: LatticeKind,
  random: Random,
): C | undefined {
  let best = -Number.MAX_VALUE;
  let ties: C[] = [];
  let found: C | undefined;
  for (const cell of grid.members) {
    const xs = axisSpan(origin.x, cell.x, grid.width);
    const ys = kind === 'ring' ? 0 : axisSpan(origin.y, cell.y, grid.height);
    let distance: number;
    if (kind === 'moore' || kind === 'ring') distance = Math.max(xs, ys);
    else if (xs === 0) distance = ys;
    else if (ys === 0) distance = xs;
    else distance = Number.MAX_SAFE_INTEGER;
    if (distance > vision) continue;
    const v = value(cell);
    if (v > best) {
      best = v;
      found = cell;
      ties = [];
    } else if (nearlyEqual(v, best)) {
      if (ties.length === 0 && found) ties.push(found);
      ties.push(cell);
    }
  }
  return ties.length > 0 ? random.pick(ties) : found;
}
