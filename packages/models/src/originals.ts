// SPDX-License-Identifier: EPL-2.0
import { defineFamily, type ModelFamily } from './catalog';
import { boids } from './boids/boids';
import { epidemic } from './epidemic/epidemic';
import { heatbugs } from './heatbugs/heatbugs';
import { life } from './life/life';
import { prisonersDilemma } from './prisoners-dilemma/prisoners-dilemma';
import { schelling } from './schelling/schelling';
import { sugarscape } from './sugarscape/sugarscape';
import { wolfSheep } from './wolf-sheep/wolf-sheep';

export { boids, epidemic, heatbugs, life, prisonersDilemma, schelling, sugarscape, wolfSheep };

/** Models written for Metascape from the published descriptions, not derived from earlier code. */
export const originals: ModelFamily = defineFamily({
  id: 'metascape-examples',
  name: 'Introductory examples',
  collection: 'Metascape examples',
  description: 'Well-known models written afresh for Metascape as short, readable examples.',
  models: [life, schelling, sugarscape, heatbugs, wolfSheep, prisonersDilemma, boids, epidemic],
});

/** The family under the name the other family modules use. */
export const family = originals;
