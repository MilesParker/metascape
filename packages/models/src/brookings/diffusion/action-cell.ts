// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.diffusion.ABCCell (in ABCModel.java) and edu.brook.diffusion.ABCDEFCell.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Cell, rgb, type Color } from '@metascape/engine';

/** The payoff-relevant type of a cell: low (L), medium (M) or high (H). */
export type Characteristic = 'L' | 'M' | 'H';

/**
 * Settings shared by every cell of an action-choice model. In Ascape these were
 * static fields of the cell class; here they belong to one simulation.
 */
export interface ActionSettings {
  /** Number of actions: 3 for the ABC model, 6 for ABCDEF. */
  readonly actions: number;
  /** Rationality: how strongly the choice follows the weighted payoff. */
  readonly beta: number;
  /** Weight of local popularity (the share of the 8 neighbors taking an action). */
  readonly gamma: number;
  /** The inherent payoff `matrix[characteristic][action]`, with actions in the order A, B, C, ... */
  readonly matrix: Readonly<Record<Characteristic, readonly number[]>>;
}

/**
 * One site of the ABC and ABCDEF diffusion models. A cell has a fixed
 * characteristic and a current action (0 is A, 1 is B and so on).
 */
export class ActionCell extends Cell {
  characteristic: Characteristic = 'M';
  /** Index of the current action; every cell starts with action B (1). */
  action = 1;

  /**
   * As `ABCCell.initialize`: cells on the even checkerboard squares (x + y even)
   * are medium; of the others, those in the upper half of the lattice are high
   * and those in the lower half low. Every cell starts with action B.
   */
  override initialize(): void {
    if ((this.x + this.y) % 2 === 0) {
      this.characteristic = 'M';
    } else {
      this.characteristic = this.isAbove ? 'H' : 'L';
    }
    this.action = 1;
  }

  /** True in the upper half of the lattice: `y < height / 2` with integer division. */
  get isAbove(): boolean {
    return this.y < Math.floor(this.grid.height / 2);
  }

  /**
   * As `decideAction`: counts the neighbors' actions, computes for each action a
   * weight `exp(beta * (payoff + gamma * count / 8))`, which is zero when the
   * payoff truncates to zero, and draws the new action in proportion to the
   * weights. The change takes effect at once (asynchronous updating).
   */
  decideAction(settings: ActionSettings): void {
    const { actions, beta, gamma } = settings;
    const counts = new Array<number>(actions).fill(0);
    for (const neighbor of this.neighbors as readonly ActionCell[]) {
      counts[neighbor.action] = (counts[neighbor.action] ?? 0) + 1;
    }
    const payoffs = settings.matrix[this.characteristic];
    const terms: number[] = [];
    let sum = 0;
    for (let action = 0; action < actions; action++) {
      const payoff = payoffs[action] ?? 0;
      // The legacy code zeroes the weight when (int) payoff == 0, so a payoff of 0.5 counts as none.
      const term =
        Math.trunc(payoff) === 0
          ? 0
          : Math.exp(beta * (payoff + gamma * ((counts[action] ?? 0) / 8)));
      terms.push(term);
      sum += term;
    }
    const draw = this.random.float() * sum;
    let cumulative = 0;
    for (let action = 0; action < actions - 1; action++) {
      cumulative += terms[action] ?? 0;
      if (draw < cumulative) {
        this.action = action;
        return;
      }
    }
    // As in the legacy final `else`: the last action, including when all weights are zero.
    this.action = actions - 1;
  }
}

/** Legacy `Color.red`, `green`, `blue`, `magenta`, `cyan`, `orange` for actions A to F. */
export const ACTION_COLORS: readonly Color[] = [
  rgb(255, 0, 0),
  rgb(0, 255, 0),
  rgb(0, 0, 255),
  rgb(255, 0, 255),
  rgb(0, 255, 255),
  rgb(255, 200, 0),
];

/**
 * Greys standing in for the legacy "Black & White" draw feature of ABCDEFCell.
 * The legacy feature drew A white, B gray, C black, and D, E and F as white,
 * black and white fills with hatching; hatching cannot be expressed as a
 * single colour, so D, E and F get distinct greys.
 */
export const ACTION_GREYS: readonly Color[] = [
  rgb(255, 255, 255),
  rgb(128, 128, 128),
  rgb(0, 0, 0),
  rgb(192, 192, 192),
  rgb(64, 64, 64),
  rgb(224, 224, 224),
];
