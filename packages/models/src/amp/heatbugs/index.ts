// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { heatbugs } from './heatbugs';

export { heatbugs };

/** The Heatbugs example of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-heatbugs',
  name: 'Heatbugs (AMP)',
  collection: 'Eclipse AMP example models',
  description:
    'Bugs that warm their surroundings and seek a preferred temperature on a heat-diffusing grid.',
  models: [heatbugs],
});
