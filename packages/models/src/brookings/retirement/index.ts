// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { population } from './population';
import { populationCoupled } from './population-coupled';
import { populationSmallWorld } from './population-small-world';

export { population, populationCoupled, populationSmallWorld };

/** The Axtell and Epstein retirement model. */
export const family = defineFamily({
  id: 'brookings-retirement',
  name: 'Retirement',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Coordination in transient social networks: rational, random and imitating agents decide when to retire.',
  models: [populationSmallWorld, population, populationCoupled],
});
