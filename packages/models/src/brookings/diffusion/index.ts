// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { abcDiffusion } from './abc-model';
import { abDiffusion } from './ab-model';
import { abcdefDiffusion, bigAbcdefDiffusion, bigAbcdefDiffusionBW } from './abcdef-models';

export { abcDiffusion, abDiffusion, abcdefDiffusion, bigAbcdefDiffusion, bigAbcdefDiffusionBW };

/** Diffusion of behavior through a lattice (Young; Axtell). */
export const family = defineFamily({
  id: 'brookings-diffusion',
  name: 'Diffusion',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Diffusion in social networks: cells adopt a behavior by its inherent payoff and how many neighbors have adopted it, with random error. Two, three and six actions.',
  models: [abDiffusion, abcDiffusion, abcdefDiffusion, bigAbcdefDiffusion, bigAbcdefDiffusionBW],
});
