// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import {
  gasII1,
  gasII2,
  gasII3,
  gasII5,
  gasII6,
  gasII7,
  gasII8,
  spiceII1,
  spiceII2,
} from './chapter-2';
import { gasII4, gasIII2, gasIII3, gasIII6 } from './chapter-3';
import {
  gasIV1,
  gasIVa,
  gasIVb,
  gasIVc,
  gasIVd,
  gasIVe,
  gasIVf,
  gasIVg,
  gasIVh,
  gasIVi,
} from './chapter-4';

export {
  gasII1,
  gasII2,
  gasII3,
  gasII4,
  gasII5,
  gasII6,
  gasII7,
  gasII8,
  gasIII2,
  gasIII3,
  gasIII6,
  gasIV1,
  gasIVa,
  gasIVb,
  gasIVc,
  gasIVd,
  gasIVe,
  gasIVf,
  gasIVg,
  gasIVh,
  gasIVi,
  spiceII1,
  spiceII2,
};
export {
  multipleGasII2,
  multipleGasIVa,
  multipleGasIVb,
  multipleGasIVc,
  multipleGasIVd,
  multipleGasIVe,
  multipleGasIVf,
  multipleGasIVg,
  multipleGasIVh,
  multipleGasIVi,
  sugarscapeBatches,
  type SugarscapeBatch,
} from './batch';

/** The Sugarscape models of Growing Artificial Societies, ported from Ascape, in book order. */
export const family = defineFamily({
  id: 'brookings-sugarscape',
  name: 'Sugarscape',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    "Epstein and Axtell's Sugarscape as implemented in Ascape, following the chapters of " +
    'Growing Artificial Societies: foraging, growback, seasons and pollution (II), sex, ' +
    'inheritance and culture (III), and spice and trade (IV).',
  models: [
    gasII1,
    gasII2,
    gasII3,
    gasII4,
    gasII5,
    gasII6,
    gasII7,
    gasII8,
    spiceII1,
    spiceII2,
    gasIII2,
    gasIII3,
    gasIII6,
    gasIV1,
    gasIVa,
    gasIVb,
    gasIVc,
    gasIVd,
    gasIVe,
    gasIVf,
    gasIVg,
    gasIVh,
    gasIVi,
  ],
});
