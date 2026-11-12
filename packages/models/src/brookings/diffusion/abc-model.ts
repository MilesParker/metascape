// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.diffusion.ABCModel and ABCCell (both in ABCModel.java).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, int, real } from '@metascape/engine';
import {
  actionSettings,
  buildActionModel,
  diffusionProvenance,
  matrixABCParameters,
} from './action-model';
import { ACTION_COLORS } from './action-cell';

/**
 * The ABC diffusion model: three actions, with inherent payoffs that depend on
 * a cell's characteristic (high, medium or low) plus a bonus for how many of
 * the eight neighbors take the action.
 */
export const abcDiffusion = defineModel({
  name: 'Diffusion: ABC Diffusion Model',
  description:
    'Norms of behavior spread through a network when agents adopt a behavior according to its ' +
    'inherent payoff and how many neighbors have adopted it, subject to random error. Cells ' +
    'choose among three actions and differ in how much each action pays them.',
  provenance: diffusionProvenance(
    'ABCModel',
    'Each step 25 cells are chosen by repeated random draw (with replacement) and update at once, as in the legacy REPEATED_DRAW style. Statistics count each action in the upper and lower half of the lattice, as the legacy collectors did.',
  ),
  parameters: {
    span: int(10, {
      min: 3,
      max: 200,
      label: 'Span',
      description: 'Width and height of the lattice.',
    }),
    beta: real(0.1, {
      min: 0,
      max: 5,
      label: 'Beta',
      description: 'Rationality: how strongly the choice follows the payoff.',
    }),
    gamma: real(1, {
      min: 0,
      max: 100,
      label: 'Gamma',
      description: 'Weight of the share of neighbors who have taken the action.',
    }),
    ...matrixABCParameters,
  },

  build(sim) {
    const { span, beta, gamma } = sim.parameters;
    buildActionModel(sim, {
      span,
      settings: actionSettings(3, beta, gamma, sim.parameters),
      palette: ACTION_COLORS,
      labels: ['A', 'B', 'C'],
      chartColors: ACTION_COLORS,
    });
  },
});
