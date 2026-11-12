// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import { defineFamily, type ModelFamily } from './catalog';
import { boids } from './boids/boids';
import { epidemic } from './epidemic/epidemic';
import { heatbugs } from './heatbugs/heatbugs';
import { life } from './life/life';
import { prisonersDilemma } from './prisoners-dilemma/prisoners-dilemma';
import { schelling } from './schelling/schelling';
import { sugarscape } from './sugarscape/sugarscape';
import { wolfSheep } from './wolf-sheep/wolf-sheep';
import { family as ampDemographicPd } from './amp/demographic-pd';
import { family as ampEpidemic } from './amp/epidemic';
import { family as ampHeatbugs } from './amp/heatbugs';
import { family as ampMarkets } from './amp/markets';
import { family as ampSir } from './amp/sir';
import { family as ampStupidModel } from './amp/stupid-model';
import { family as ampWikiExample } from './amp/wiki-example';
import { family as ascapeBionland } from './ascape/bionland';
import { family as ascapeBoids } from './ascape/boids';
import { family as ascapeTraffic } from './ascape/traffic';
import { family as brookingsAnasazi } from './brookings/anasazi';
import { family as brookingsBusyBeavers } from './brookings/bb';
import { family as brookingsCivilViolence } from './brookings/civil-violence';
import { family as brookingsCoordinationGame } from './brookings/coordination-game';
import { family as brookingsClasses } from './brookings/classes';
import { family as brookingsDiffusion } from './brookings/diffusion';
import { family as brookingsFirms } from './brookings/firms';
import { family as brookingsLife } from './brookings/life';
import { family as brookingsNorms } from './brookings/norms';
import { family as brookingsPrisonersDilemma } from './brookings/prisoners-dilemma';
import { family as brookingsRetirement } from './brookings/retirement';
import { family as brookingsSimple } from './brookings/simple';
import { family as brookingsSpatialIpd } from './brookings/spatial-ipd';
import { family as brookingsSugarscape } from './brookings/sugarscape';

export { defineFamily, type ModelFamily } from './catalog';
export { boids, epidemic, heatbugs, life, prisonersDilemma, schelling, sugarscape, wolfSheep };

/** Models written for Metascape from the published descriptions, not derived from earlier code. */
export const originals: ModelFamily = defineFamily({
  id: 'metascape-examples',
  name: 'Introductory examples',
  collection: 'Metascape examples',
  description: 'Well-known models written afresh for Metascape as short, readable examples.',
  models: [life, schelling, sugarscape, heatbugs, wolfSheep, prisonersDilemma, boids, epidemic],
});

/** Every family of models, in the order a model picker should list them. */
export const catalog: readonly ModelFamily[] = [
  originals,
  // Brookings Institution models, ported from Ascape.
  brookingsSugarscape,
  brookingsAnasazi,
  brookingsCivilViolence,
  brookingsNorms,
  brookingsRetirement,
  brookingsClasses,
  brookingsFirms,
  brookingsPrisonersDilemma,
  brookingsSpatialIpd,
  brookingsDiffusion,
  brookingsLife,
  brookingsBusyBeavers,
  brookingsCoordinationGame,
  brookingsSimple,
  // Ascape example models.
  ascapeBionland,
  ascapeBoids,
  ascapeTraffic,
  // Eclipse AMP example models.
  ampStupidModel,
  ampWikiExample,
  ampHeatbugs,
  ampDemographicPd,
  ampEpidemic,
  ampMarkets,
  ampSir,
];

/** Every model in the catalogue, family by family. */
export const models: readonly Model[] = catalog.flatMap((family) => family.models);
