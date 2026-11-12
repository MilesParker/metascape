// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model StupidModel2.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, defineModel } from '@metascape/engine';
import { buildStupidModel, stupidParameters, stupidProvenance } from './stupid-model';

/** StupidModel 2 of the AMP example set. */
export const stupidModel2 = defineModel({
  name: 'StupidModel 2',
  description:
    'Bugs move as in StupidModel 1 and also grow by one each tick; their colour fades from white to red with size.',
  provenance: stupidProvenance('StupidModel2'),
  parameters: stupidParameters,
  build(sim) {
    buildStupidModel(sim, {
      label: 'StupidModel 2',
      grow: 'increment',
      foodRate: undefined,
      sizeColor: true,
      habitatColor: colors.black,
    });
  },
});
