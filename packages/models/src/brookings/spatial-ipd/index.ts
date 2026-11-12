// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import {
  pd2dga,
  pd2dgaClosest,
  pd2dgaFurthest,
  pd2dgaMulti,
  pd2dgaMultiple,
  pd2dgaMultipleTo,
  pd2dgaPreference,
  pd2dgaRandom,
} from './models';

export {
  pd2dga,
  pd2dgaClosest,
  pd2dgaFurthest,
  pd2dgaMulti,
  pd2dgaMultiple,
  pd2dgaMultipleTo,
  pd2dgaPreference,
  pd2dgaRandom,
};
export { pd2dgaMultiDesign, pd2dgaMultipleDesign, pd2dgaMultipleToDesign } from './experiments';

/** Miles Parker's spatial iterated Prisoner's Dilemma with a genetic algorithm. */
export const family = defineFamily({
  id: 'brookings-spatial-ipd',
  name: "Spatial Iterated Prisoner's Dilemma (GA)",
  collection: 'Brookings Institution models (from Ascape)',
  description:
    "Players on a lattice evolve memory-based strategies for the iterated Prisoner's Dilemma with mutation and crossover, choosing partners at random, by genetic similarity or by an evolved preference.",
  models: [
    pd2dga,
    pd2dgaRandom,
    pd2dgaClosest,
    pd2dgaFurthest,
    pd2dgaPreference,
    pd2dgaMulti,
    pd2dgaMultiple,
    pd2dgaMultipleTo,
  ],
});
