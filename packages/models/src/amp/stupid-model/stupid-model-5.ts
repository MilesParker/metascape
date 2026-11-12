// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model StupidModel5.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, defineModel } from '@metascape/engine';
import { buildStupidModel, stupidParameters, stupidProvenance } from './stupid-model';

/** StupidModel 5 of the AMP example set. */
export const stupidModel5 = defineModel({
  name: 'StupidModel 5',
  description:
    'Habitats accumulate food by a draw in [0, 0.5) per tick and each bug, after moving, eats up to 0.2 of the food on its cell and grows by that amount.',
  provenance: stupidProvenance('StupidModel5'),
  parameters: stupidParameters,
  build(sim) {
    buildStupidModel(sim, {
      label: 'StupidModel 5',
      grow: 'eat',
      foodRate: 0.5,
      sizeColor: true,
      habitatColor: colors.black,
    });
  },
});
