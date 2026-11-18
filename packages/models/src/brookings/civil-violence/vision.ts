// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.model.space.Array2D (countWithin, findNearest), as used by edu.brook.cv.Citizen and Cop.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { LatticeRanks, type HostCell, type Array2D, type Random } from '@metascape/engine';

/**
 * Ascape searches a lattice in "ranks": all offsets at the same Euclidean
 * distance, nearest rank first, covering offsets up to 16 along each axis.
 */
const RANKS = LatticeRanks.ascape;

/**
 * Visits every cell within `maxDistance` (inclusive) of `origin`, as Ascape's
 * `countWithin` does. Edges wrap; a cell reached by several offsets on a small
 * lattice is visited once per offset, as in Ascape.
 */
export function forEachWithin(
  grid: Array2D<HostCell>,
  origin: HostCell,
  includeSelf: boolean,
  maxDistance: number,
  visit: (cell: HostCell) => void,
): void {
  RANKS.forEachWithin(grid, origin, includeSelf, maxDistance, visit);
}

/**
 * The nearest cell satisfying `test`, as Ascape's `findNearest`: ranks are
 * searched outward while their distance is strictly below `maxDistance`, and
 * one match of the first rank that has any is chosen at random.
 */
export function findNearest(
  grid: Array2D<HostCell>,
  origin: HostCell,
  includeSelf: boolean,
  maxDistance: number,
  test: (cell: HostCell) => boolean,
  random: Random,
): HostCell | undefined {
  return RANKS.findNearest(grid, origin, test, includeSelf, maxDistance, random);
}
