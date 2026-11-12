// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model StupidModel1.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, defineModel } from '@metascape/engine';
import { buildStupidModel, stupidParameters, stupidProvenance } from './stupid-model';

/** StupidModel 1 of the AMP example set. */
export const stupidModel1 = defineModel({
  name: 'StupidModel 1',
  description:
    'Bugs move to a random free cell within their vision on a periodic Moore grid, nothing else.',
  provenance: stupidProvenance('StupidModel1'),
  parameters: stupidParameters,
  build(sim) {
    buildStupidModel(sim, {
      label: 'StupidModel 1',
      grow: 'none',
      foodRate: undefined,
      sizeColor: false,
      habitatColor: colors.green,
    });
  },
});
