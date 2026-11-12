// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { firmsModel } from './firms';

export { firmsModel };

/** Axtell's model of the emergence of firms. */
export const family = defineFamily({
  id: 'brookings-firms',
  name: 'Emergence of Firms',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Employees choose their effort and their firm under local increasing returns; firms form and a skewed distribution of firm sizes emerges.',
  models: [firmsModel],
});
