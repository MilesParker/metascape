// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { sir } from './sir';

export { sir };

/** The Eclipse AMP system dynamics SIR model. */
export const family = defineFamily({
  id: 'amp-sir',
  name: 'SIR (system dynamics)',
  collection: 'Eclipse AMP example models',
  description:
    'The classic susceptible, infected and recovered compartment model as stocks and flows.',
  models: [sir],
});
