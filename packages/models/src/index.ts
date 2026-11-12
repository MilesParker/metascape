// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import { boids } from './boids/boids';
import { epidemic } from './epidemic/epidemic';
import { heatbugs } from './heatbugs/heatbugs';
import { life } from './life/life';
import { prisonersDilemma } from './prisoners-dilemma/prisoners-dilemma';
import { schelling } from './schelling/schelling';
import { sugarscape } from './sugarscape/sugarscape';
import { wolfSheep } from './wolf-sheep/wolf-sheep';

export { boids, epidemic, heatbugs, life, prisonersDilemma, schelling, sugarscape, wolfSheep };

/** Every example model, in the order a model picker should list them. */
export const models: readonly Model[] = [
  life,
  schelling,
  sugarscape,
  heatbugs,
  wolfSheep,
  prisonersDilemma,
  boids,
  epidemic,
] as readonly Model[];
