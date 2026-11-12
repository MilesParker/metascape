// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.life.LifeCell, ConwayLife, ConwayLifeSmallWorld and SmallConwayLife.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Cell, rgb, type Color, type Provenance } from '@metascape/engine';

/** Who devised Life, and the article that introduced it. */
export const LIFE_AUTHORS = 'John H. Conway';
export const LIFE_CITATION =
  'Gardner, M. (1970). Mathematical Games: The fantastic combinations of John Conway\'s new solitaire game "life". Scientific American, 223(4), 120-123.';
const LIFE_COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

/** Builds the provenance of one Life model. */
export function lifeProvenance(legacyClass: string, note: string): Provenance {
  return {
    authors: LIFE_AUTHORS,
    citation: LIFE_CITATION,
    portedFrom: `Ascape 5.6.1, edu.brook.life.${legacyClass}`,
    copyright: LIFE_COPYRIGHT,
    note,
  };
}

/** Legacy cell colours: dead black, alive white. */
export const DEAD: Color = rgb(0, 0, 0);
export const ALIVE: Color = rgb(255, 255, 255);

/**
 * One site of the Life lattice (legacy `LifeCell`). `on` is the legacy `alive`
 * field (renamed, because `alive` is the engine's membership flag) and `next`
 * the legacy `nextAlive`.
 */
export class LifeCell extends Cell {
  on = false;
  next = false;

  /** The cell starts alive with the given probability. */
  seed(density: number): void {
    this.on = this.random.float() < density;
  }

  /**
   * The Life rule: a live cell with fewer than two or more than three live
   * neighbors dies; a dead cell with exactly three comes alive; otherwise no change.
   */
  calculateNext(neighbors: readonly LifeCell[]): boolean {
    let live = 0;
    for (const neighbor of neighbors) if (neighbor.on) live++;
    if (this.on) {
      if (live < 2 || live > 3) return false;
    } else if (live === 3) {
      return true;
    }
    return this.on;
  }
}
