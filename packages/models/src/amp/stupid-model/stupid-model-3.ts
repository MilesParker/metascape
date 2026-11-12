// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model StupidModel3.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, defineModel } from '@metascape/engine';
import { buildStupidModel, stupidParameters, stupidProvenance } from './stupid-model';

/** StupidModel 3 of the AMP example set. */
export const stupidModel3 = defineModel({
  name: 'StupidModel 3',
  description:
    'As StupidModel 2, and every habitat also accumulates food by a draw in [0, 0.01) per tick. Bugs neither eat nor look for food.',
  provenance: stupidProvenance('StupidModel3'),
  parameters: stupidParameters,
  build(sim) {
    buildStupidModel(sim, {
      label: 'StupidModel 3',
      grow: 'increment',
      foodRate: 0.01,
      sizeColor: true,
      habitatColor: colors.black,
    });
  },
});
