// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { step1, step2, step3, step4, step5 } from './steps';

export { step1, step2, step3, step4, step5 };

/** The five steps of the Ascape manual's coordination game tutorial. */
export const family = defineFamily({
  id: 'brookings-coordination-game',
  name: 'Coordination Game (Ascape manual tutorial)',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'The tutorial of the Ascape manual: a coordination game on a lattice, built up in five steps from imitation of neighbors to births, deaths and social networks.',
  models: [step1, step2, step3, step4, step5],
});
