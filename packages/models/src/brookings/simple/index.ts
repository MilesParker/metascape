// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { simple } from './simple';

export { simple, SimpleAgent } from './simple';

/** The Simple tutorial model of Ascape. */
export const family = defineFamily({
  id: 'brookings-simple',
  name: 'Simple',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'The smallest Ascape example: one agent whose happiness doubles every tick and an environment that sometimes breaks it.',
  models: [simple],
});
