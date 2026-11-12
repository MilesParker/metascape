// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { pd2d, pd2dCellular, pd2dDemo, pd2dSmallWorld } from './models';

export { pd2d, pd2dCellular, pd2dDemo, pd2dSmallWorld };

/** Epstein's Demographic Prisoner's Dilemma and its Ascape variants. */
export const family = defineFamily({
  id: 'brookings-prisoners-dilemma',
  name: "Demographic Prisoner's Dilemma",
  collection: 'Brookings Institution models (from Ascape)',
  description:
    "Joshua Epstein's demographic Prisoner's Dilemma: fixed-strategy players move, play their neighbors, reproduce when rich and die when broke, and zones of cooperation emerge.",
  models: [pd2d, pd2dSmallWorld, pd2dCellular, pd2dDemo],
});
