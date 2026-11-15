// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_II_1, GAS_II_2, GAS_II_3,
// GAS_II_5, GAS_II_6, GAS_II_7, GAS_II_8, Spice_II_1, Spice_II_2.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  colors,
  defineModel,
  gridView,
  int,
  Graph,
  networkView,
  real,
  type RootScape,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';
import {
  DEATH_STARVATION_RULE,
  HARVEST_RULE,
  METABOLISM_RULE,
  MOVEMENT_RULE,
  PollutingSugarAgent,
  type SugarAgent,
} from './agents';
import { findRandomUnoccupiedWithin } from './ascape-space';
import {
  clearRules,
  clearSelection,
  createGasBase,
  createGasSpiceBase,
  deselectRule,
  gasBaseViews,
  gasSpiceBaseViews,
  POLLUTION_LEGEND,
  pollutionCellColor,
  showViews,
  spiceParameters,
  spiceSettings,
  spiceStatisticsCharts,
  stopAtPeriod,
  SUGAR_KINDS,
  sugarCellColor,
  sugarParameters,
  sugarscapeProvenance,
  sugarSettings,
  sugarStatisticsCharts,
  type Kinds,
} from './base';
import {
  type SugarCell,
  PollutableSugarCell,
  pollutionDiffusionRule,
  sugarSeasonalGrowBackRule,
  SUGAR_GROW_BACK_1_RULE,
  SUGAR_GROW_BACK_INF_RULE,
  SUGAR_SPICE_GROW_BACK_INF_RULE,
} from './cells';
import { trackSocialNetwork } from './social-network';
import type { SpiceSettings, SugarSettings, SugarscapeWorld } from './world';

/**
 * `GAS_II_1.createScape`: sugar grows back to capacity at once; agents move,
 * harvest, metabolize and die of starvation.
 */
export function createGasII1(
  root: RootScape,
  settings: SugarSettings,
  kinds: Kinds = SUGAR_KINDS,
): SugarscapeWorld {
  const world = createGasBase(root, settings, kinds);
  world.grid.addRule(SUGAR_GROW_BACK_INF_RULE);
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(METABOLISM_RULE);
  world.agents.addRule(DEATH_STARVATION_RULE);
  return world;
}

/** `GAS_II_2.createScape`: as II-1 with the immediate growback deselected and unit growback added. */
export function createGasII2(
  root: RootScape,
  settings: SugarSettings,
  kinds: Kinds = SUGAR_KINDS,
): SugarscapeWorld {
  const world = createGasII1(root, settings, kinds);
  deselectRule(world.grid, SUGAR_GROW_BACK_INF_RULE);
  world.grid.addRule(SUGAR_GROW_BACK_1_RULE);
  return world;
}

/** The `GAS_Base` views and charts. */
function showBaseViews(root: RootScape, world: SugarscapeWorld): void {
  const plan = gasBaseViews();
  plan.extra.push(...sugarStatisticsCharts());
  showViews(root, world, plan);
}

/** Sugarscape II-1. */
export const gasII1 = defineModel({
  name: 'Sugarscape II-1: Immediate growback',
  description:
    'Agents with random vision and metabolism move to the best sugar they can see on a ' +
    'two-peaked landscape, eat it and die when they run out; sugar grows back to capacity at once.',
  provenance: sugarscapeProvenance('GAS_II_1'),
  parameters: sugarParameters(),
  build(root) {
    const world = createGasII1(root, sugarSettings(root.parameters));
    showBaseViews(root, world);
  },
});

/** Sugarscape II-2. */
export const gasII2 = defineModel({
  name: 'Sugarscape II-2: Unit growback',
  description:
    'As II-1, but sugar grows back one unit per period, so agents gather on the peaks and the ' +
    'population falls to the carrying capacity of the landscape.',
  provenance: sugarscapeProvenance('GAS_II_2'),
  parameters: sugarParameters(),
  build(root) {
    const world = createGasII2(root, sugarSettings(root.parameters));
    showBaseViews(root, world);
  },
});

/** Sugarscape II-3. */
export const gasII3 = defineModel({
  name: 'Sugarscape II-3: Carrying capacity',
  description:
    'The II-2 model with a chart of the population, which settles at the carrying capacity ' +
    'of the sugar landscape.',
  provenance: sugarscapeProvenance(
    'GAS_II_3',
    'Same rules as GAS_II_2; the legacy class only adds the population chart.',
  ),
  parameters: sugarParameters(),
  build(root) {
    const world = createGasII2(root, sugarSettings(root.parameters));
    showBaseViews(root, world);
  },
});

/** Sugarscape II-5. */
export const gasII5 = defineModel({
  name: 'Sugarscape II-5: Neighbor networks',
  description:
    'The II-2 model in which each agent records the agents on its neighboring cells after it ' +
    'acts, giving a social network of neighbors that changes as agents move.',
  provenance: sugarscapeProvenance('GAS_II_5'),
  parameters: sugarParameters(),
  build(root) {
    const world = createGasII2(root, sugarSettings(root.parameters));
    // The neighbor network, as a graph whose members are the agents it links; it draws
    // nothing at random, so it shares the root's stream.
    const network = new Graph<SugarAgent>({ directed: true });
    root.add(new Scape<SugarAgent>({ name: 'Neighbors', space: network, randomStream: 'parent' }));
    world.agents.addRule(trackSocialNetwork(network));
    world.agents.executionOrder = 'byAgent';
    root.addStatCollector(stat.value('networkLinks', () => network.edgeCount));
    const plan = gasBaseViews();
    plan.extra.push(
      networkView<SugarAgent>({
        title: 'Neighbor network',
        nodes: world.agents,
        graph: network,
        color: () => colors.red,
        legend: [{ color: colors.red, label: 'Agent; links join neighbors' }],
        layout: 'force',
      }),
      ...sugarStatisticsCharts(),
      timeSeriesView({ title: 'Network links', series: ['networkLinks'] }),
    );
    showViews(root, world, plan);
  },
});

/** Sugarscape II-6. */
export const gasII6 = defineModel({
  name: 'Sugarscape II-6: Migration from a corner',
  description:
    'Agents with long vision start packed into a 20 by 20 corner of a landscape with ' +
    'flatter peaks and migrate across it in waves; the run stops after 50 periods.',
  provenance: sugarscapeProvenance(
    'GAS_II_6',
    'Starts with 400 agents (GAS_Base.scapeSetup overrides the 350 set in createScape).',
  ),
  parameters: sugarParameters({ sugarMoundness: 0.0037, minVision: 6, maxVision: 10 }),
  build(root) {
    const world = createGasII2(root, sugarSettings(root.parameters));
    const grid = world.lattice;
    world.agents.addInitialRule({
      name: 'Move Random Within 0, 30 -> 20, 20',
      execute(agent) {
        const cell = findRandomUnoccupiedWithin(grid, agent.random, 0, 30, 20, 20);
        if (!cell) throw new Error('HostCell cannot be set null.');
        agent.moveTo(cell);
      },
    });
    stopAtPeriod(root, 50);
    showBaseViews(root, world);
  },
});

/** Sugarscape II-7. */
export const gasII7 = defineModel({
  name: 'Sugarscape II-7: Seasons',
  description:
    'Sugar grows back one unit per period in the summer half of the landscape and slowly in ' +
    'the winter half, the seasons alternating; agents with long vision migrate between them.',
  provenance: sugarscapeProvenance('GAS_II_7'),
  parameters: {
    ...sugarParameters(),
    winterSugarGrowbackRate: real(0.125, {
      live: true,
      group: 'Seasons',
      min: 0,
      max: 4,
      label: 'Winter sugar growback rate',
      description: 'The rate at which sugar grows back in the winter.',
    }),
    seasonLength: int(50, {
      live: true,
      group: 'Seasons',
      min: 1,
      max: 1000,
      label: 'Season length',
      description: 'Periods per season.',
    }),
  },
  build(root) {
    const p = root.parameters;
    const world = createGasII2(root, sugarSettings(p));
    clearSelection(world.grid);
    // Read each period, so both can be changed while it runs.
    world.grid.addRule(
      sugarSeasonalGrowBackRule(
        () => root.parameters.winterSugarGrowbackRate,
        () => root.parameters.seasonLength,
      ),
    );
    showBaseViews(root, world);
  },
});

/** Sugarscape II-8. */
export const gasII8 = defineModel({
  name: 'Sugarscape II-8: Pollution',
  description:
    'Harvesting and metabolism pollute the landscape, pollution diffuses, and agents value a ' +
    'cell by its sugar divided by one plus its pollution.',
  provenance: sugarscapeProvenance(
    'GAS_II_8',
    'Starts with 400 agents (GAS_Base.scapeSetup overrides the 300 set in createScape).',
  ),
  parameters: sugarParameters(),
  build(root) {
    const world = createGasII2(root, sugarSettings(root.parameters), {
      cell: (w) => new PollutableSugarCell(w),
      agent: (w) => new PollutingSugarAgent(w),
    });
    const cells = world.grid as unknown as Scape<PollutableSugarCell>;
    cells.addRule(pollutionDiffusionRule());
    cells.addStatCollector(
      stat.measure('pollution', (c) => c.pollution, {
        statistics: ['sum', 'mean', 'max'],
      }),
    );
    const plan = gasBaseViews();
    plan.cellColor = sugarCellColor;
    plan.extra.push(
      gridView<SugarCell, SugarAgent>({
        title: 'Pollution',
        scape: world.grid,
        cellColor: pollutionCellColor,
        occupantColor: plan.agentColor,
        occupantShape: 'circle',
        legend: [...plan.agentLegend, ...POLLUTION_LEGEND],
      }),
      ...sugarStatisticsCharts(),
      timeSeriesView({ title: 'Mean pollution', series: ['pollution.mean'] }),
    );
    showViews(root, world, plan);
  },
});

/** `Spice_II_1.createScape`: both goods grow back at once; death only from lack of sugar. */
export function createSpiceII1(
  root: RootScape,
  settings: [SugarSettings, SpiceSettings],
): SugarscapeWorld {
  const world = createGasSpiceBase(root, settings);
  world.grid.addRule(SUGAR_SPICE_GROW_BACK_INF_RULE);
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(METABOLISM_RULE);
  world.agents.addRule(DEATH_STARVATION_RULE);
  return world;
}

function showSpiceViews(root: RootScape, world: SugarscapeWorld): void {
  const plan = gasSpiceBaseViews();
  plan.extra.push(...spiceStatisticsCharts());
  showViews(root, world, plan);
}

/** Sugarscape Spice II-1. */
export const spiceII1 = defineModel({
  name: 'Sugarscape Spice II-1: Sugar and spice, immediate growback',
  description:
    'A landscape with two sugar peaks and two spice peaks that grow back at once; agents ' +
    'need both goods and move to the cell that would most improve their welfare.',
  provenance: sugarscapeProvenance(
    'Spice_II_1',
    'Agents die only when out of sugar (the legacy class uses DEATH_STARVATION_RULE).',
  ),
  parameters: spiceParameters(),
  build(root) {
    const world = createSpiceII1(root, spiceSettings(root.parameters));
    showSpiceViews(root, world);
  },
});

/** Sugarscape Spice II-2. */
export const spiceII2 = defineModel({
  name: 'Sugarscape Spice II-2: Sugar and spice, unit growback',
  description:
    'As Spice II-1, with the cell rules replaced by sugar growback of one unit per period; ' +
    'as in the legacy code, spice is not grown back at all.',
  provenance: sugarscapeProvenance(
    'Spice_II_2',
    'Kept legacy behaviour: only SUGAR_GROW_BACK_1_RULE is installed, so spice never regrows.',
  ),
  parameters: spiceParameters(),
  build(root) {
    const world = createSpiceII1(root, spiceSettings(root.parameters));
    clearRules(world.grid);
    world.grid.addRule(SUGAR_GROW_BACK_1_RULE);
    showSpiceViews(root, world);
  },
});
