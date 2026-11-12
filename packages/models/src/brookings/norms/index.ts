// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { norms } from './norms';

export { norms, NormCell } from './norms';

/** Epstein's social norms model. */
export const family = defineFamily({
  id: 'brookings-norms',
  name: 'Norms',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Learning to be thoughtless: a ring of agents who adopt a norm from their neighbors and adapt how many neighbors they consult.',
  models: [norms],
});
