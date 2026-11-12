// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { busyBeavers } from './bb-model';

export { busyBeavers };

/** The `bb` package: searching for busy-beaver Turing machines. */
export const family = defineFamily({
  id: 'brookings-bb',
  name: 'Busy Beavers (bb)',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Beavers search for small Turing machines that write the most ones, using a fixed rule, random rules or genetic algorithms.',
  models: [busyBeavers],
});
