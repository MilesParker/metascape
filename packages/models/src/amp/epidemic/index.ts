// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { epidemicContact } from './contact';
import { epidemic } from './epidemic';
import { epidemicPlague } from './plague';
import { epidemicRegional, epidemicRegionalPeriods } from './regional';

export { epidemic, epidemicContact, epidemicPlague, epidemicRegional, epidemicRegionalPeriods };

/** The Eclipse AMP Epidemic models. */
export const family = defineFamily({
  id: 'amp-epidemic',
  name: 'Epidemic (AMP)',
  collection: 'Eclipse AMP example models',
  description:
    'Epidemic spread through individuals on a grid, with variants that record contacts, add rats and fleas, or link several cities by migration.',
  models: [epidemic, epidemicContact, epidemicPlague, epidemicRegional, epidemicRegionalPeriods],
});
