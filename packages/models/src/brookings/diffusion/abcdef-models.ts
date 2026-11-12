// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.diffusion.ABCDEFModel, ABCDEFCell, BigABCDEFModel and BigABCDEFModelBW.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, int, real, rgb, type Color, type Model } from '@metascape/engine';
import {
  actionSettings,
  buildActionModel,
  diffusionProvenance,
  matrixABCParameters,
  matrixDEFParameters,
} from './action-model';
import { ACTION_COLORS, ACTION_GREYS } from './action-cell';

/** The legacy statistics name the six actions by payoff scale, in the order A to F. */
const LABELS = ['.6', '.5', '.4', '.9', '.8', '.7'];

/** Chart colours of the legacy ABCDEF charts: blue, green, red, orange, cyan, magenta per series. */
const CHART_COLORS: readonly Color[] = [
  rgb(255, 0, 0),
  rgb(0, 255, 0),
  rgb(0, 0, 255),
  rgb(255, 0, 255),
  rgb(0, 255, 255),
  rgb(255, 200, 0),
];

const DESCRIPTION =
  'Norms of behavior spread through a network when agents adopt a behavior according to its ' +
  'inherent payoff and how many neighbors have adopted it, subject to random error. Cells ' +
  'choose among six actions and differ in how much each action pays them.';

const NOTE =
  'Each step 25 cells are chosen by repeated random draw (with replacement) and update at once, as in the legacy REPEATED_DRAW style. Statistics count each action in the upper and lower half of the lattice; the legacy collectors name the actions A to F as ".6", ".5", ".4", ".9", ".8" and ".7".';

function parametersFor(span: number) {
  return {
    span: int(span, {
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
    gamma: real(40, {
      min: 0,
      max: 100,
      label: 'Gamma',
      description: 'Weight of the share of neighbors who have taken the action.',
    }),
    ...matrixABCParameters,
    ...matrixDEFParameters,
  } as const;
}

function define(
  name: string,
  legacyClass: string,
  span: number,
  palette: readonly Color[],
  extraNote: string,
) {
  return defineModel({
    name,
    description: DESCRIPTION,
    provenance: diffusionProvenance(legacyClass, `${NOTE}${extraNote}`),
    parameters: parametersFor(span),
    build(sim) {
      const { span: size, beta, gamma } = sim.parameters;
      buildActionModel(sim, {
        span: size,
        settings: actionSettings(6, beta, gamma, sim.parameters),
        palette,
        labels: LABELS,
        chartColors: CHART_COLORS,
      });
    },
  });
}

/** The ABCDEF diffusion model: six actions on a 10 by 10 lattice. */
export const abcdefDiffusion: Model = define(
  'Diffusion: ABCDEF Diffusion Model',
  'ABCDEFModel',
  10,
  ACTION_COLORS,
  '',
);

/** `BigABCDEFModel`: the ABCDEF model on a 20 by 20 lattice. */
export const bigAbcdefDiffusion: Model = define(
  'Diffusion: Big ABCDEF Diffusion Model',
  'BigABCDEFModel',
  20,
  ACTION_COLORS,
  '',
);

/**
 * `BigABCDEFModelBW`: the 20 by 20 model drawn in black and white. In the
 * legacy class the black and white draw feature is selected only by commented
 * out code, so the legacy class behaves exactly like `BigABCDEFModel`.
 */
export const bigAbcdefDiffusionBW: Model = define(
  'Diffusion: Big ABCDEF Diffusion Model (black and white)',
  'BigABCDEFModelBW',
  20,
  ACTION_GREYS,
  ' The legacy class only calls super.createViews() (its line selecting the "Black & White" draw feature is commented out), so as legacy code it is colour-identical to BigABCDEFModel; this port applies the black and white scheme that the cell class defines and that the class name promises. The hatched fills for D, E and F are approximated by greys.',
);
