// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { trafficModel } from './traffic';

export { trafficModel } from './traffic';

/** Ascape's Traffic example. */
export const family = defineFamily({
  id: 'ascape-traffic',
  name: 'Traffic',
  collection: 'Ascape example models',
  description:
    'A simple traffic model demonstrating that simple rules can elicit complex traffic behavior such as rolling backups.',
  models: [trafficModel],
});
