// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { wikiExample } from './wiki-example';

export { wikiExample };

/** The Wiki example of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-wiki-example',
  name: 'Wiki Example',
  collection: 'Eclipse AMP example models',
  description:
    'Individuals of different ages on a city grid seek out others of their own age and settle beside them.',
  models: [wikiExample],
});
