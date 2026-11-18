// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.model.space.Array2DBase (relativeCoordinatesTemplate)
// and org.ascape.model.space.Array2D (findNearestMatchRank, findRandomMatchInRank, findNearest, countWithin).
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Cell } from '../cell';
import type { Random } from '../random';
import type { Array2D, Metric } from './array2d';

/** The offsets at one distance from the origin. */
export interface LatticeRank {
  /** The distance of every offset in the rank, by the table's metric. */
  readonly distance: number;
  /** The offsets, each `[dx, dy]`. */
  readonly offsets: readonly (readonly [number, number])[];
}

export interface LatticeRanksOptions {
  /** The largest offset along either axis. Default 16, as Ascape's table. */
  readonly reach?: number;
  /** The least and greatest offset along x, in place of `reach`. */
  readonly xRange?: readonly [number, number];
  /** The least and greatest offset along y, in place of `reach`. */
  readonly yRange?: readonly [number, number];
  /** How distance is measured. Default `euclidean`, as Ascape's table. */
  readonly metric?: Metric;
  /** Offsets farther than this are left out of the table. Default: none. */
  readonly maxDistance?: number;
  /**
   * The order of the offsets within a rank: `rows` (dy outer, dx inner, from
   * the least offset) or `columns` (dx outer, dy inner). Default `rows`. A random choice
   * within a rank picks by position, so the order is part of a model's run.
   */
  readonly order?: 'rows' | 'columns';
}

function measure(metric: Metric, dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (metric === 'chebyshev') return Math.max(ax, ay);
  if (metric === 'manhattan') return ax + ay;
  return Math.sqrt(ax * ax + ay * ay);
}

/**
 * Ascape's search of a lattice by "ranks": every offset up to `reach` along
 * each axis, grouped by distance from the origin, nearest rank first. Rank 0
 * is the origin itself. Searches visit the ranks outward and, for a nearest
 * cell, choose at random within the first rank that has a match.
 *
 * Edges wrap on a periodic lattice; off a bounded one, offsets are skipped.
 * On a lattice narrower than twice the reach, a cell can be reached by more
 * than one offset and is then visited once for each, as in Ascape.
 */
export class LatticeRanks {
  /** Ascape's own table: Euclidean, reach 16 (135 ranks, 1,089 offsets). */
  static readonly ascape = new LatticeRanks();

  /**
   * A table that reaches every cell of a `width` x `height` lattice exactly
   * once from any origin: on a torus, offsets from -floor(n/2) to
   * n - 1 - floor(n/2) along each axis; on a bounded lattice, from -(n - 1)
   * to n - 1 (offsets off the edge are skipped). Rank order is then the order
   * of the lattice's own distance, the shortest way round on a torus.
   */
  static covering(width: number, height: number, periodic: boolean, metric: Metric): LatticeRanks {
    const range = (n: number): [number, number] =>
      periodic ? [-Math.floor(n / 2), n - 1 - Math.floor(n / 2)] : [-(n - 1), n - 1];
    return new LatticeRanks({ xRange: range(width), yRange: range(height), metric });
  }

  readonly ranks: readonly LatticeRank[];
  readonly metric: Metric;
  /** How many offsets the table holds. */
  readonly size: number;

  constructor(options: LatticeRanksOptions = {}) {
    const reach = options.reach ?? 16;
    const [x0, x1] = options.xRange ?? [-reach, reach];
    const [y0, y1] = options.yRange ?? [-reach, reach];
    const metric = options.metric ?? 'euclidean';
    const maxDistance = options.maxDistance ?? Infinity;
    const columns = options.order === 'columns';
    // Group by an exact key: the squared distance for Euclidean, else the distance.
    const groups = new Map<number, [number, number][]>();
    let size = 0;
    for (let a = columns ? x0 : y0; a <= (columns ? x1 : y1); a++) {
      for (let b = columns ? y0 : x0; b <= (columns ? y1 : x1); b++) {
        const dx = columns ? a : b;
        const dy = columns ? b : a;
        if (measure(metric, dx, dy) > maxDistance) continue;
        const key = metric === 'euclidean' ? dx * dx + dy * dy : measure(metric, dx, dy);
        let group = groups.get(key);
        if (!group) groups.set(key, (group = []));
        group.push([dx, dy]);
        size++;
      }
    }
    this.ranks = [...groups.keys()]
      .sort((a, b) => a - b)
      .map((key) => {
        const offsets = groups.get(key)!;
        const [dx, dy] = offsets[0]!;
        return { distance: measure(metric, dx, dy), offsets };
      });
    this.metric = metric;
    this.size = size;
  }

  /**
   * Visits every cell within `maxDistance` (inclusive) of `origin`, rank by
   * rank, as Ascape's `countWithin`.
   */
  forEachWithin<C extends Cell>(
    grid: Array2D<C>,
    origin: Cell,
    includeSelf: boolean,
    maxDistance: number,
    visit: (cell: C) => void,
  ): void {
    const ranks = this.ranks;
    for (let r = includeSelf ? 0 : 1; r < ranks.length; r++) {
      const rank = ranks[r]!;
      if (rank.distance > maxDistance) return;
      for (const [dx, dy] of rank.offsets) {
        const cell = grid.at(origin.x + dx, origin.y + dy);
        if (cell) visit(cell);
      }
    }
  }

  /**
   * The index of the nearest rank holding a cell that passes `test`, searching
   * ranks strictly nearer than `maxDistance`; -1 if none (Ascape's
   * `findNearestMatchRank`).
   */
  nearestRank<C extends Cell>(
    grid: Array2D<C>,
    origin: Cell,
    test: (cell: C) => boolean,
    includeSelf: boolean,
    maxDistance: number,
  ): number {
    const ranks = this.ranks;
    for (let r = includeSelf ? 0 : 1; r < ranks.length && ranks[r]!.distance < maxDistance; r++) {
      for (const [dx, dy] of ranks[r]!.offsets) {
        const cell = grid.at(origin.x + dx, origin.y + dy);
        if (cell && test(cell)) return r;
      }
    }
    return -1;
  }

  /** The cells of one rank that pass `test`, in the rank's order. */
  matchesInRank<C extends Cell>(
    grid: Array2D<C>,
    origin: Cell,
    test: (cell: C) => boolean,
    rank: number,
  ): C[] {
    const matches: C[] = [];
    for (const [dx, dy] of this.ranks[rank]!.offsets) {
      const cell = grid.at(origin.x + dx, origin.y + dy);
      if (cell && test(cell)) matches.push(cell);
    }
    return matches;
  }

  /**
   * The nearest cell that passes `test`, as Ascape's `findNearest` within its
   * table: ranks strictly nearer than `maxDistance` are searched outward, and
   * one match of the first rank that has any is chosen at random (one draw,
   * even if it has only one). `undefined` if none.
   */
  findNearest<C extends Cell>(
    grid: Array2D<C>,
    origin: Cell,
    test: (cell: C) => boolean,
    includeSelf: boolean,
    maxDistance: number,
    random: Random,
  ): C | undefined {
    const ranks = this.ranks;
    for (let r = includeSelf ? 0 : 1; r < ranks.length; r++) {
      if (!(ranks[r]!.distance < maxDistance)) return undefined;
      const matches = this.matchesInRank(grid, origin, test, r);
      if (matches.length > 0) return random.pick(matches);
    }
    return undefined;
  }
}
