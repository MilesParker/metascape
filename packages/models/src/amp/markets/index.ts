// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { markets } from './markets';

export { markets };

/** The Eclipse AMP Markets model. */
export const family = defineFamily({
  id: 'amp-markets',
  name: 'Markets',
  collection: 'Eclipse AMP example models',
  description:
    'Traders, firms and parcels of shares: a small ask-and-buy market in which firm prices follow the trades.',
  models: [markets],
});
