// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_III_2, GAS_III_3, GAS_III_6,
// GAS_II_4 (which extends GAS_III_2).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  barsView,
  defineModel,
  rgb,
  timeSeriesView,
  type Color,
  type Scape,
  type Simulation,
} from '@metascape/engine';
import {
  CulturalSexualAgent,
  DEATH_STARVATION_RULE,
  PLAY_NEIGHBORS_RULE,
  type SugarAgent,
} from './agents';
import {
  awt,
  createGasSexBase,
  gasBaseViews,
  showViews,
  SUGAR_KINDS,
  sugarParameters,
  sugarscapeProvenance,
  sugarSettings,
  sugarStatisticsCharts,
  type ViewPlan,
} from './base';
import { createGasII2 } from './chapter-2';
import { culturalReproduction } from './reproduction';
import type { SugarscapeWorld } from './world';

/** `GAS_III_2` colours by vision 1..6 (index 0 is an unused placeholder). */
export const COLOR_FOR_VISION: readonly Color[] = [
  awt.white,
  rgb(0, 0, 255),
  rgb(77, 0, 255),
  rgb(153, 0, 255),
  rgb(255, 0, 153),
  rgb(255, 0, 77),
  rgb(255, 0, 0),
];

/** `GAS_III_3` colours by sugar metabolism 1..4 (index 0 is an unused placeholder). */
export const COLOR_FOR_METABOLISM: readonly Color[] = [
  awt.white,
  rgb(0, 0, 255),
  rgb(153, 0, 255),
  rgb(255, 0, 153),
  rgb(255, 0, 0),
];

/**
 * Counts per trait value, an agent colour by that value, and a bar chart
 * (the legacy pie chart) and time series of the counts.
 */
function traitViews(
  sim: Simulation,
  world: SugarscapeWorld,
  plan: ViewPlan,
  trait: { key: string; label: string; colors: readonly Color[] },
  value: (agent: SugarAgent) => number,
): void {
  const series: string[] = [];
  const palette: Record<string, Color> = {};
  for (let v = 1; v < trait.colors.length; v++) {
    const id = `${trait.key}${v}`;
    sim.data.count(world.agents, id, (a) => value(a) === v);
    series.push(id);
    palette[id] = trait.colors[v]!;
  }
  // Legacy indexes the colour array directly; values outside it would throw there.
  plan.agentColor = (a) => trait.colors[value(a)] ?? awt.white;
  plan.extra.push(
    barsView({ title: `Count by ${trait.label}`, series, colors: palette }),
    timeSeriesView({ title: `Count by ${trait.label} over time`, series, colors: palette }),
  );
}

/** `GAS_III_2.createViews`: agents coloured by vision, with counts per vision. */
export function gasIII2Views(sim: Simulation, world: SugarscapeWorld): ViewPlan {
  const plan = gasBaseViews();
  traitViews(
    sim,
    world,
    plan,
    { key: 'vision', label: 'vision', colors: COLOR_FOR_VISION },
    (a) => a.vision,
  );
  return plan;
}

/** Sugarscape III-2. */
export const gasIII2 = defineModel({
  name: 'Sugarscape III-2: Sexual reproduction and vision',
  description:
    'Agents of two sexes reproduce with fertile neighbors, passing on vision and metabolism, ' +
    'and die of starvation or old age; agents are coloured by vision to show its evolution.',
  provenance: sugarscapeProvenance('GAS_III_2'),
  parameters: sugarParameters(),
  build(sim) {
    const world = createGasSexBase(sim, sugarSettings(sim.parameters));
    const plan = gasIII2Views(sim, world);
    plan.extra.push(...sugarStatisticsCharts());
    showViews(sim, world, plan);
  },
});

/** Sugarscape III-3. */
export const gasIII3 = defineModel({
  name: 'Sugarscape III-3: Sexual reproduction and metabolism',
  description:
    'The III-2 model with agents coloured and counted by sugar metabolism, to show selection ' +
    'for low metabolism.',
  provenance: sugarscapeProvenance('GAS_III_3'),
  parameters: sugarParameters(),
  build(sim) {
    const world = createGasSexBase(sim, sugarSettings(sim.parameters));
    const plan = gasBaseViews();
    traitViews(
      sim,
      world,
      plan,
      { key: 'metabolism', label: 'sugar metabolism', colors: COLOR_FOR_METABOLISM },
      (a) => a.sugarMetabolism,
    );
    plan.extra.push(...sugarStatisticsCharts());
    showViews(sim, world, plan);
  },
});

/**
 * Sugarscape II-4. The legacy `GAS_II_4` extends `GAS_III_2`, so it has
 * sexual reproduction and old age, and adds counts of agents per wealth decile.
 */
export const gasII4 = defineModel({
  name: 'Sugarscape II-4: Wealth deciles',
  description:
    'The III-2 model (sexual reproduction and old age) with the population counted by ' +
    'decile of wealth, showing a skewed distribution of wealth.',
  provenance: sugarscapeProvenance(
    'GAS_II_4',
    'GAS_II_4 extends GAS_III_2, so reproduction and old age are part of it, as in the legacy code.',
  ),
  parameters: sugarParameters(),
  build(sim) {
    const world = createGasSexBase(sim, sugarSettings(sim.parameters));
    const plan = gasIII2Views(sim, world);
    sim.data.measure(world.agents, 'wealth', (a) => a.sugar.stock);
    const agents: Scape<SugarAgent> = world.agents;
    const series: string[] = [];
    for (let decile = 1; decile <= 10; decile++) {
      const id = `decile${decile}`;
      series.push(id);
      // StatCollectorCond: strictly between (d - 1) and d tenths of the current maximum wealth.
      sim.data.value(id, () => {
        let max = -Infinity;
        for (const a of agents.members) max = Math.max(max, a.sugar.stock);
        let count = 0;
        for (const a of agents.members) {
          const w = a.sugar.stock;
          if (w > (decile - 1) * 0.1 * max && w < decile * 0.1 * max) count++;
        }
        return count;
      });
    }
    plan.extra.push(
      barsView({ title: 'Count by wealth decile', series }),
      ...sugarStatisticsCharts(),
    );
    showViews(sim, world, plan);
  },
});

/** Sugarscape III-6. */
export const gasIII6 = defineModel({
  name: 'Sugarscape III-6: Cultural transmission',
  description:
    'Agents carry an 11-bit cultural tag; each tick they flip one random bit of each ' +
    'neighbor to match their own, and children inherit the bits their parents share. Agents ' +
    'are blue or red by the majority of their bits.',
  provenance: sugarscapeProvenance(
    'GAS_III_6',
    'Starts with 400 agents (GAS_Base.scapeSetup overrides the 300 set in createScape). Agents ' +
      'do not die of old age.',
  ),
  parameters: sugarParameters({ sugarMoundness: 0.005 }),
  build(sim) {
    const world = createGasII2(sim, sugarSettings(sim.parameters), {
      cell: SUGAR_KINDS.cell,
      agent: (w) => new CulturalSexualAgent(w),
    });
    world.tagLength = 11;
    world.agents.addRule(culturalReproduction);
    world.agents.addRule(PLAY_NEIGHBORS_RULE);
    world.agents.addRule(DEATH_STARVATION_RULE);
    const culture = (a: SugarAgent): boolean => (a as CulturalSexualAgent).getMajority();
    sim.data.count(world.agents, 'blue', (a) => culture(a));
    sim.data.count(world.agents, 'red', (a) => !culture(a));
    const plan = gasBaseViews();
    plan.agentColor = (a) => (culture(a) ? awt.blue : awt.red);
    plan.extra.push(
      timeSeriesView({
        title: 'Cultural groups',
        series: ['blue', 'red'],
        colors: { blue: awt.blue, red: awt.red },
      }),
      ...sugarStatisticsCharts(),
    );
    showViews(sim, world, plan);
  },
});
