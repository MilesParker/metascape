// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_IV_1, GAS_IV_a, GAS_IV_b,
// GAS_IV_c, GAS_IV_d, GAS_IV_e, GAS_IV_f, GAS_IV_g, GAS_IV_h, GAS_IV_i.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, timeSeriesView, type Rule, type Simulation } from '@metascape/engine';
import {
  DEATH_STARVATION_OLD_AGE_SPICE_RULE,
  DEATH_STARVATION_SPICE_RULE,
  HARVEST_RULE,
  METABOLISM_RULE,
  MOVEMENT_RULE,
  NegotiatingAgent,
  SexualSpiceAgent,
  type SpiceAgent,
} from './agents';
import {
  createGasSpiceBase,
  gasSpiceBaseViews,
  showViews,
  SPICE_KINDS,
  spiceParameters,
  spiceSettings,
  spiceStatisticsCharts,
  sugarscapeProvenance,
} from './base';
import { SUGAR_SPICE_GROW_BACK_1_RULE } from './cells';
import { promiscuousSpiceReproduction } from './reproduction';
import { newTally, tradeT, tradeT2, tradeT3, tradeT4, type TradeTally } from './trade';
import type { SpiceSettings, SugarSettings, SugarscapeWorld } from './world';

type Settings = [SugarSettings, SpiceSettings];

/** `GAS_IV_1.createScape`: unit growback of both goods; move, harvest, metabolize, starve. */
export function createGasIV1(sim: Simulation, settings: Settings): SugarscapeWorld {
  const world = createGasSpiceBase(sim, settings);
  world.grid.addRule(SUGAR_SPICE_GROW_BACK_1_RULE);
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(METABOLISM_RULE);
  world.agents.addRule(DEATH_STARVATION_SPICE_RULE);
  return world;
}

/**
 * `GAS_IV_d.createScape`, which does not call its superclass: negotiating
 * agents; death is checked before metabolism; and no growback rule is
 * installed, so the landscape is never replenished (kept legacy behaviour).
 */
export function createGasIVd(sim: Simulation, settings: Settings): SugarscapeWorld {
  const world = createGasSpiceBase(sim, settings, {
    cell: SPICE_KINDS.cell,
    agent: (w) => new NegotiatingAgent(w),
  });
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(DEATH_STARVATION_SPICE_RULE);
  world.agents.addRule(METABOLISM_RULE);
  return world;
}

/**
 * `GAS_IV_e.createScape`: sexual, negotiating spice agents that die of
 * starvation or old age (checked before metabolism) and reproduce.
 */
export function createGasIVe(sim: Simulation, settings: Settings): SugarscapeWorld {
  const world = createGasSpiceBase(sim, settings, {
    cell: SPICE_KINDS.cell,
    agent: (w) => new SexualSpiceAgent(w),
  });
  world.grid.addRule(SUGAR_SPICE_GROW_BACK_1_RULE);
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(DEATH_STARVATION_OLD_AGE_SPICE_RULE);
  world.agents.addRule(METABOLISM_RULE);
  world.agents.addRule(promiscuousSpiceReproduction);
  return world;
}

/** Adds a trade rule and its tally series (trades and mean log price per tick). */
function addTrade(
  sim: Simulation,
  world: SugarscapeWorld,
  makeRule: (tally: TradeTally) => Rule<SpiceAgent>,
): void {
  const tally = newTally();
  world.agents.addRule(makeRule(tally) as Rule<SpiceAgent>);
  let trades = 0;
  let meanLogPrice = Number.NaN;
  // Read and reset once per sample: trades executed in the tick just completed.
  sim.data.value('trades', () => {
    trades = tally.trades;
    meanLogPrice = trades > 0 ? tally.logPriceSum / trades : Number.NaN;
    tally.trades = 0;
    tally.logPriceSum = 0;
    return trades;
  });
  sim.data.value('meanLogPrice', () => meanLogPrice);
}

function showSpiceViews(sim: Simulation, world: SugarscapeWorld, trading: boolean): void {
  const plan = gasSpiceBaseViews();
  plan.extra.push(...spiceStatisticsCharts());
  if (trading) {
    plan.extra.push(
      timeSeriesView({ title: 'Trades per tick', series: ['trades'] }),
      timeSeriesView({ title: 'Mean log price of trades', series: ['meanLogPrice'] }),
    );
  }
  showViews(sim, world, plan);
}

interface Variant {
  readonly legacyClass: string;
  readonly name: string;
  readonly description: string;
  readonly note?: string;
  readonly create: (sim: Simulation, settings: Settings) => SugarscapeWorld;
  readonly trade?: (tally: TradeTally) => Rule<SpiceAgent>;
}

function spiceModel(variant: Variant) {
  return defineModel({
    name: variant.name,
    description: variant.description,
    provenance: sugarscapeProvenance(variant.legacyClass, variant.note),
    parameters: spiceParameters(),
    build(sim) {
      const world = variant.create(sim, spiceSettings(sim.parameters));
      if (variant.trade) addTrade(sim, world, variant.trade);
      showSpiceViews(sim, world, variant.trade !== undefined);
    },
  });
}

const negotiate = tradeT4 as (tally: TradeTally) => Rule<SpiceAgent>;

/** Sugarscape IV-1. */
export const gasIV1 = spiceModel({
  legacyClass: 'GAS_IV_1',
  name: 'Sugarscape IV-1: Sugar and spice, no trade',
  description:
    'Agents need sugar and spice, which grow back one unit per tick on separate peaks, and ' +
    'die when they run out of either. There is no trade.',
  create: createGasIV1,
});

/** Sugarscape IV-a. */
export const gasIVa = spiceModel({
  legacyClass: 'GAS_IV_a',
  name: 'Sugarscape IV-a: Trade as in the book',
  description:
    'IV-1 plus trade as specified in Growing Artificial Societies: neighbors trade one unit ' +
    'at a time at the geometric mean of their MRSs until neither gains.',
  create: createGasIV1,
  trade: tradeT,
});

/** Sugarscape IV-b. */
export const gasIVb = spiceModel({
  legacyClass: 'GAS_IV_b',
  name: 'Sugarscape IV-b: One big trade',
  description:
    'Trades like the book, except agents make one big trade with each neighbor instead of ' +
    'many little ones.',
  create: createGasIV1,
  trade: tradeT2,
});

/** Sugarscape IV-c. */
export const gasIVc = spiceModel({
  legacyClass: 'GAS_IV_c',
  name: 'Sugarscape IV-c: Best offer matched',
  description:
    'Agents solicit offers from all neighbors, take the best, and offer the remaining ' +
    'neighbors the chance to trade on those same terms.',
  note: 'With exactly one neighbor the legacy TradeT3 throws a ClassCastException; this port trades with that neighbor.',
  create: createGasIV1,
  trade: tradeT3,
});

/** Sugarscape IV-d. */
export const gasIVd = spiceModel({
  legacyClass: 'GAS_IV_d',
  name: 'Sugarscape IV-d: Negotiation',
  description:
    'Agents negotiate with offers and counter-offers based on their own MRSs, a negotiating ' +
    'factor and a personal limit on the number of offers.',
  note: 'As in the legacy class, no growback rule is installed, so the landscape is eaten out.',
  create: createGasIVd,
  trade: negotiate,
});

/** Sugarscape IV-e. */
export const gasIVe = spiceModel({
  legacyClass: 'GAS_IV_e',
  name: 'Sugarscape IV-e: Old age and reproduction, no trade',
  description:
    'Sugar and spice agents that age, die and reproduce sexually, passing on vision and ' +
    'metabolisms. There is no trade.',
  create: createGasIVe,
});

/** Sugarscape IV-f. */
export const gasIVf = spiceModel({
  legacyClass: 'GAS_IV_f',
  name: 'Sugarscape IV-f: Reproduction with trade as in the book',
  description: 'IV-e plus trade as specified in Growing Artificial Societies.',
  create: createGasIVe,
  trade: tradeT,
});

/** Sugarscape IV-g. */
export const gasIVg = spiceModel({
  legacyClass: 'GAS_IV_g',
  name: 'Sugarscape IV-g: Reproduction with one big trade',
  description: 'IV-e plus one big trade with each neighbor, like IV-b.',
  create: createGasIVe,
  trade: tradeT2,
});

/** Sugarscape IV-h. */
export const gasIVh = spiceModel({
  legacyClass: 'GAS_IV_h',
  name: 'Sugarscape IV-h: Reproduction with best offer matched',
  description: 'IV-e plus best-offer trading, like IV-c, with old age and reproduction.',
  note: 'With exactly one neighbor the legacy TradeT3 throws a ClassCastException; this port trades with that neighbor.',
  create: createGasIVe,
  trade: tradeT3,
});

/** Sugarscape IV-i. */
export const gasIVi = spiceModel({
  legacyClass: 'GAS_IV_i',
  name: 'Sugarscape IV-i: Reproduction with negotiation',
  description: 'IV-e plus negotiation, like IV-d, with old age and reproduction.',
  create: createGasIVe,
  trade: negotiate,
});
