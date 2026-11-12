// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { stupidModel1 } from './stupid-model-1';
import { stupidModel2 } from './stupid-model-2';
import { stupidModel3 } from './stupid-model-3';
import { stupidModel5 } from './stupid-model-5';

export { stupidModel1, stupidModel2, stupidModel3, stupidModel5 };

/** The StupidModel steps 1, 2, 3 and 5 as defined in the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-stupid-model',
  name: 'StupidModel',
  collection: 'Eclipse AMP example models',
  description:
    'Steps 1, 2, 3 and 5 of the StupidModel teaching series: bugs wander a grid, then grow, then live on habitats that produce food.',
  models: [stupidModel1, stupidModel2, stupidModel3, stupidModel5],
});
