// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import { conwayLife, conwayLifeSmallWorld, smallConwayLife } from './life-models';

export { conwayLife, conwayLifeSmallWorld, smallConwayLife };

/** The Brookings Life models. */
export const family = defineFamily({
  id: 'brookings-life',
  name: "Conway's Life",
  collection: 'Brookings Institution models (from Ascape)',
  description:
    "John Conway's cellular automaton in three Ascape forms: the full model, a small-world neighborhood variant and a condensed version.",
  models: [smallConwayLife, conwayLife, conwayLifeSmallWorld],
});
