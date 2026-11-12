// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { demographicPd } from './demographic-pd';

export { demographicPd };

/** The Demographic Prisoner's Dilemma of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-demographic-pd',
  name: "Demographic Prisoner's Dilemma (AMP)",
  collection: 'Eclipse AMP example models',
  description:
    "Epstein's spatial Prisoner's Dilemma with births and deaths: strategies spread by reproduction, not imitation.",
  models: [demographicPd],
});
