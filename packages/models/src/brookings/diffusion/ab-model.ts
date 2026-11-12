// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.diffusion.ABModel and ABCell (both in ABModel.java).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Cell,
  defineModel,
  GridScape,
  gridView,
  int,
  real,
  rgb,
  timeSeriesView,
} from '@metascape/engine';
import { diffusionProvenance } from './action-model';

/** A site of the AB model: playing A (yellow) or B (black). */
export class ABCell extends Cell {
  /** True for action A; every cell starts with action B. */
  isA = false;

  /** The payoff of playing `mine` against a neighbor playing `theirs`: AA pays 3, BB pays 2, AB pays 0. */
  static payoff(mineIsA: boolean, theirIsA: boolean): number {
    // Legacy: A = 1, B = 2; a sum of 2 is AA, a sum of 4 is BB, a sum of 3 is a mismatch.
    if (mineIsA && theirIsA) return 3;
    if (!mineIsA && !theirIsA) return 2;
    return 0;
  }

  /**
   * As `decideState`: totals the payoff A and B would have earned against the
   * four neighbors' current states, then chooses A with the logit probability
   * `exp(beta * a) / (exp(beta * a) + exp(beta * b))`. The change is immediate.
   */
  decideState(beta: number): void {
    let aPayoff = 0;
    let bPayoff = 0;
    for (const neighbor of this.neighbors as readonly ABCell[]) {
      aPayoff += ABCell.payoff(true, neighbor.isA);
      bPayoff += ABCell.payoff(false, neighbor.isA);
    }
    const aTerm = Math.exp(beta * aPayoff);
    const bTerm = Math.exp(beta * bPayoff);
    this.isA = this.random.float() < aTerm / (aTerm + bTerm);
  }
}

/**
 * The AB diffusion model: a two-action coordination game on a periodic lattice
 * with four neighbors, played with noisy best response.
 */
export const abDiffusion = defineModel({
  name: 'Diffusion: AB Diffusion Model',
  description:
    'Norms of behavior spread through a network when agents adopt a behavior according to its ' +
    'payoff and how many neighbors have adopted it, subject to random error. Here every cell ' +
    'plays one of two actions against its four neighbors.',
  provenance: diffusionProvenance(
    'ABModel',
    'Each step 25 cells are chosen by repeated random draw (with replacement) and update at once, as in the legacy REPEATED_DRAW style. The A and B counts are added for the chart; the legacy model had none.',
  ),
  parameters: {
    span: int(50, {
      min: 3,
      max: 200,
      label: 'Span',
      description: 'Width and height of the lattice.',
    }),
    beta: real(0.1, {
      min: 0,
      max: 5,
      label: 'Beta',
      description: 'Rationality: how strongly the choice follows the payoff. Zero is a coin toss.',
    }),
  },

  build(sim) {
    const { span, beta } = sim.parameters;
    const cells = sim.addScape(
      new GridScape<ABCell>({
        name: 'cells',
        width: span,
        height: span,
        wrap: true,
        neighborhood: 'vonNeumann',
        activations: 25,
        sampling: 'draw',
        create: () => new ABCell(),
      }),
    );
    cells.addRule('Decide State', (cell) => cell.decideState(beta));

    sim.data.count(cells, 'A', (cell) => cell.isA);
    sim.data.count(cells, 'B', (cell) => !cell.isA);

    sim.addView(
      gridView<ABCell>({
        title: 'Cells',
        grid: cells,
        cellColor: (cell) => (cell.isA ? rgb(255, 255, 0) : rgb(0, 0, 0)),
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Cells playing each action',
        series: ['A', 'B'],
        colors: { A: rgb(255, 255, 0), B: rgb(128, 128, 128) },
      }),
    );
  },
});
