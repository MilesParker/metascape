// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { boidsAscape } from './boids';

export { boidsAscape, placeObstacle } from './boids';

/** Ascape's Boids example. */
export const family = defineFamily({
  id: 'ascape-boids',
  name: 'Boids',
  collection: 'Ascape example models',
  description:
    "Craig Reynolds' Boids (1987) as implemented in Ascape: flocking in a wrapped plane from prioritized local steering rules, with a red team that only avoids obstacles and a blue team that flocks.",
  models: [boidsAscape],
});
