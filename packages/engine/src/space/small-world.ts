// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Follows the neighbor rule of Ascape 5.6.1: org.ascape.model.space.Array2DSmallWorld.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This version: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Cell } from '../cell';
import type { Array2D } from './array2d';

/** Options of {@link wireSmallWorld}. The defaults are those of Ascape's `Array2DSmallWorld`. */
export interface SmallWorldOptions {
  /** Radius of the regular neighborhood, in cells either way. Default 1. */
  readonly radius?: number;
  /** Chance that each neighbor is replaced by a uniformly random cell. Default 0. */
  readonly randomEdgeRatio?: number;
}

/**
 * Rewires a lattice into a small world, as Ascape's `Array2DSmallWorld`
 * does. Each cell starts with the cells within `radius` (not itself; whether
 * the edges join up is the lattice's choice). Then each entry of its list, in
 * turn, is replaced with chance `randomEdgeRatio` by a uniformly random cell
 * of the lattice, drawn again while that cell already appears elsewhere in the list.
 *
 * As in Ascape, rewiring is one-way (only the cell's own list changes) and the
 * random cell may be the cell itself. An entry is left alone if every cell is
 * already listed, where Ascape would loop forever. Uses the random stream of
 * the lattice's scape and visits cells in row-major order. Call it once the
 * lattice is populated, from an initial rule.
 */
export function wireSmallWorld<C extends Cell>(
  lattice: Array2D<C>,
  options: SmallWorldOptions = {},
): void {
  const radius = options.radius ?? 1;
  const ratio = options.randomEdgeRatio ?? 0;
  const members = lattice.members;
  for (const cell of members) {
    const list = lattice.findWithin(cell, radius, { metric: 'chebyshev' });
    if (ratio > 0) {
      for (let i = 0; i < list.length; i++) {
        if (lattice.random.float() >= ratio) continue;
        const others = new Set(list.filter((_, j) => j !== i));
        if (others.size >= members.length) continue;
        let pick: C;
        do {
          pick = lattice.random.pick(members);
        } while (others.has(pick));
        list[i] = pick;
      }
    }
    lattice.setNeighbors(cell, list);
  }
}
