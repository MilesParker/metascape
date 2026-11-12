// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { lhvClan, lhvDisaggregate } from './lhv-disaggregate';
import { lhv, lhvGreedy } from './lhv';

export { lhv, lhvGreedy } from './lhv';
export { lhvClan, lhvDisaggregate } from './lhv-disaggregate';
export { lhvRmsExperiment, lhvTestExperiment, summarizeDifference } from './experiments';

/** The Artificial Anasazi (Long House Valley) models from Ascape's Brookings package. */
export const family = defineFamily({
  id: 'brookings-anasazi',
  name: 'Artificial Anasazi',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    'Agent-based reconstruction of the Kayenta Anasazi of Long House Valley, Arizona, AD 800-1350: households farm maize under the reconstructed climate, and their numbers are compared with the archaeological record of growth and collapse.',
  models: [lhv, lhvGreedy, lhvDisaggregate, lhvClan],
});
