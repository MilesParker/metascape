// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_Base, GAS_SexBase, GAS_SpiceBase.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  colors,
  gradient,
  GridScape,
  gridView,
  int,
  real,
  rgb,
  Scape,
  timeSeriesView,
  type Color,
  type Provenance,
  type Rule,
  type Simulation,
  type ViewSpec,
} from '@metascape/engine';
import {
  DEATH_STARVATION_OLD_AGE_RULE,
  HARVEST_RULE,
  METABOLISM_RULE,
  MOVEMENT_RULE,
  SexualAgent,
  SpiceAgent,
  SugarAgent,
} from './agents';
import { MAX_SPICE, MAX_SUGAR, SpiceCell, SugarCell, SUGAR_GROW_BACK_1_RULE } from './cells';
import { promiscuousReproduction } from './reproduction';
import { SugarscapeWorld, type SpiceSettings, type SugarSettings } from './world';

/** The legacy lattice is always 50 x 50 (`GAS_Base.createScape`). */
export const LATTICE_SIZE = 50;

/** The citation every model of the family carries. */
export const CITATION =
  'Epstein, J. M., & Axtell, R. (1996). Growing Artificial Societies: Social Science from the Bottom Up. ' +
  'Brookings Institution Press and MIT Press.';

/** Provenance of a model ported from the named class in `edu.brook.sugarscape`. */
export function sugarscapeProvenance(legacyClass: string, note?: string): Provenance {
  return {
    authors: 'Joshua M. Epstein and Robert Axtell',
    citation: CITATION,
    portedFrom: `Ascape 5.6.1, edu.brook.sugarscape.${legacyClass}`,
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    ...(note === undefined ? {} : { note }),
  };
}

/** How cells and agents are made: the legacy "prototype agents". */
export interface Kinds {
  readonly cell: (world: SugarscapeWorld) => SugarCell;
  readonly agent: (world: SugarscapeWorld) => SugarAgent;
}

/** `GAS_Base` prototypes: `SugarCell` and `SugarAgent`. */
export const SUGAR_KINDS: Kinds = {
  cell: (world) => new SugarCell(world),
  agent: (world) => new SugarAgent(world),
};

/** `GAS_SpiceBase` prototypes: `SpiceCell` and `SpiceAgent`. */
export const SPICE_KINDS: Kinds = {
  cell: (world) => new SpiceCell(world),
  agent: (world) => new SpiceAgent(world),
};

/** Defaults a variant may change in the `GAS_Base` parameters. */
export interface SugarDefaults {
  readonly sugarMoundness?: number;
  readonly minVision?: number;
  readonly maxVision?: number;
}

const initialPopulation = int(400, {
  min: 0,
  max: 2500,
  label: 'Initial population',
  description:
    'Agents created at setup. Not a legacy parameter: GAS_Base.scapeSetup always sets 400, ' +
    'overriding the sizes the variants set in createScape.',
});

/** The `GAS_Base` bean properties as parameters, plus the initial population. */
export function sugarParameters(defaults: SugarDefaults = {}) {
  return {
    sugarMoundness: real(defaults.sugarMoundness ?? 0.004, {
      min: 0,
      max: 0.1,
      label: 'Sugar moundness',
      description: 'Topology parameter of the two sugar peaks: larger values give narrower peaks.',
    }),
    minVision: int(defaults.minVision ?? 1, {
      min: 0,
      max: 24,
      label: 'Min vision',
      description: 'The minimum vision an agent may be given on initialization.',
    }),
    maxVision: int(defaults.maxVision ?? 6, {
      min: 0,
      max: 24,
      label: 'Max vision',
      description: 'The maximum vision an agent may be given on initialization.',
    }),
    minSugarMetabolism: int(1, {
      min: 0,
      max: 10,
      label: 'Min sugar metabolism',
      description: 'The minimum sugar metabolism an agent may be given on initialization.',
    }),
    maxSugarMetabolism: int(4, {
      min: 0,
      max: 10,
      label: 'Max sugar metabolism',
      description: 'The maximum sugar metabolism an agent may be given on initialization.',
    }),
    minInitialSugar: int(0, {
      min: 0,
      max: 200,
      label: 'Min initial sugar',
      description: 'The minimum sugar an agent may be given on initialization.',
    }),
    maxInitialSugar: int(30, {
      min: 0,
      max: 200,
      label: 'Max initial sugar',
      description: 'The maximum sugar an agent may be given on initialization.',
    }),
    minDeathAge: int(60, {
      min: 0,
      max: 500,
      label: 'Min death age',
      description: 'The minimum death age an agent may be given on initialization.',
    }),
    maxDeathAge: int(100, {
      min: 0,
      max: 500,
      label: 'Max death age',
      description: 'The maximum death age an agent may be given on initialization.',
    }),
    initialPopulation,
  };
}

/** Values of {@link sugarParameters}. */
export type SugarParameterValues = { readonly [K in keyof SugarSettings]: number };

/** The settings a `GAS_Base` model reads from its parameters. */
export function sugarSettings(p: SugarParameterValues): SugarSettings {
  return {
    sugarMoundness: p.sugarMoundness,
    minVision: p.minVision,
    maxVision: p.maxVision,
    minSugarMetabolism: p.minSugarMetabolism,
    maxSugarMetabolism: p.maxSugarMetabolism,
    minInitialSugar: p.minInitialSugar,
    maxInitialSugar: p.maxInitialSugar,
    minDeathAge: p.minDeathAge,
    maxDeathAge: p.maxDeathAge,
    initialPopulation: p.initialPopulation,
  };
}

/**
 * The parameters of the spice models. `GAS_SpiceBase.initialize` overwrites
 * sugar moundness (0.008), sugar metabolism (1..3) and vision (10..10) at every
 * run, so those are fixed here. Its `setMaxInitialSugar` (a misnamed setter)
 * sets the maximum initial SPICE, while the maximum initial sugar stays 30;
 * the parameter keeps that legacy behaviour.
 */
export function spiceParameters() {
  const sugar = sugarParameters();
  return {
    minInitialSugar: sugar.minInitialSugar,
    maxInitialSugar: int(30, {
      min: 0,
      max: 200,
      label: 'Max initial sugar (sets max initial spice)',
      description:
        'Legacy quirk kept: GAS_SpiceBase.setMaxInitialSugar sets the maximum initial spice. ' +
        'The maximum initial sugar stays 30.',
    }),
    minDeathAge: sugar.minDeathAge,
    maxDeathAge: sugar.maxDeathAge,
    spiceMoundness: real(0.008, {
      min: 0,
      max: 0.1,
      label: 'Spice moundness',
      description: 'Topology parameter of the two spice peaks.',
    }),
    minSpiceMetabolism: int(1, {
      min: 0,
      max: 10,
      label: 'Min spice metabolism',
      description: 'The minimum spice metabolism an agent may be given on initialization.',
    }),
    maxSpiceMetabolism: int(3, {
      min: 0,
      max: 10,
      label: 'Max spice metabolism',
      description: 'The maximum spice metabolism an agent may be given on initialization.',
    }),
    minInitialSpice: int(0, {
      min: 0,
      max: 200,
      label: 'Min initial spice',
      description: 'The minimum spice an agent may be given on initialization.',
    }),
    initialPopulation,
  };
}

/** Values of {@link spiceParameters}. */
export interface SpiceParameterValues {
  readonly minInitialSugar: number;
  readonly maxInitialSugar: number;
  readonly minDeathAge: number;
  readonly maxDeathAge: number;
  readonly spiceMoundness: number;
  readonly minSpiceMetabolism: number;
  readonly maxSpiceMetabolism: number;
  readonly minInitialSpice: number;
  readonly initialPopulation: number;
}

/** Settings of a spice model, with the values `GAS_SpiceBase.initialize` forces. */
export function spiceSettings(p: SpiceParameterValues): [SugarSettings, SpiceSettings] {
  return [
    {
      sugarMoundness: 0.008,
      minVision: 10,
      maxVision: 10,
      minSugarMetabolism: 1,
      maxSugarMetabolism: 3,
      minInitialSugar: p.minInitialSugar,
      maxInitialSugar: 30,
      minDeathAge: p.minDeathAge,
      maxDeathAge: p.maxDeathAge,
      initialPopulation: p.initialPopulation,
    },
    {
      spiceMoundness: p.spiceMoundness,
      minSpiceMetabolism: p.minSpiceMetabolism,
      maxSpiceMetabolism: p.maxSpiceMetabolism,
      minInitialSpice: p.minInitialSpice,
      maxInitialSpice: p.maxInitialSugar,
    },
  ];
}

/** Creates the sugar lattice (rule order) and the agent scape (agent order, shuffled). */
function createScapes(
  sim: Simulation,
  world: SugarscapeWorld,
  kinds: Kinds,
  names: [string, string],
): SugarscapeWorld {
  world.grid = sim.addScape(
    new GridScape<SugarCell>({
      name: names[0],
      width: LATTICE_SIZE,
      height: LATTICE_SIZE,
      wrap: true,
      neighborhood: 'vonNeumann',
      schedule: 'byRule',
      order: 'sequential',
      create: () => kinds.cell(world),
    }),
  );
  world.agents = sim.addScape(
    new Scape<SugarAgent>({
      name: names[1],
      size: world.settings.initialPopulation,
      create: () => kinds.agent(world),
    }),
  );
  return world;
}

/**
 * `GAS_Base.createScape`: a 50 x 50 periodic von Neumann lattice of sugar
 * cells and a scape of agents, with no rules yet, and the agent statistics
 * (sugar, age, vision, sugar metabolism).
 */
export function createGasBase(
  sim: Simulation,
  settings: SugarSettings,
  kinds: Kinds = SUGAR_KINDS,
): SugarscapeWorld {
  const world = createScapes(sim, new SugarscapeWorld(sim, settings), kinds, [
    'Sugar Cells',
    'Sugar Agents',
  ]);
  const { data } = sim;
  data.count(world.agents, 'population');
  data.measure(world.agents, 'sugar', (a) => a.sugar.stock);
  data.measure(world.agents, 'age', (a) => a.age);
  data.measure(world.agents, 'vision', (a) => a.vision);
  data.measure(world.agents, 'sugarMetabolism', (a) => a.sugarMetabolism);
  return world;
}

/**
 * `GAS_SexBase.createScape`: `SexualAgent`s with movement, harvest,
 * metabolism, promiscuous reproduction and death by starvation or old age;
 * sugar grows back one unit per tick.
 */
export function createGasSexBase(sim: Simulation, settings: SugarSettings): SugarscapeWorld {
  const world = createGasBase(sim, settings, {
    cell: SUGAR_KINDS.cell,
    agent: (w) => new SexualAgent(w),
  });
  clearRules(world.agents);
  world.agents.addRule(MOVEMENT_RULE);
  world.agents.addRule(HARVEST_RULE);
  world.agents.addRule(METABOLISM_RULE);
  world.agents.addRule(promiscuousReproduction);
  world.agents.addRule(DEATH_STARVATION_OLD_AGE_RULE);
  clearRules(world.grid);
  world.grid.addRule(SUGAR_GROW_BACK_1_RULE);
  return world;
}

/**
 * `GAS_SpiceBase.createScape` (which does not call `GAS_Base.createScape`): a
 * lattice of spice cells and a scape of spice agents, with no rules yet, and
 * the statistics `SpiceAgent` and `SpiceCell` register.
 */
export function createGasSpiceBase(
  sim: Simulation,
  settings: [SugarSettings, SpiceSettings],
  kinds: Kinds = SPICE_KINDS,
): SugarscapeWorld {
  const world = createScapes(sim, new SugarscapeWorld(sim, settings[0], settings[1]), kinds, [
    'SpiceScape',
    'Spice Agents',
  ]);
  const { data } = sim;
  const all = ['count', 'sum', 'mean', 'min', 'max', 'variance'] as const;
  const agents = world.agents as Scape<SpiceAgent>;
  const cells = world.grid as GridScape<SpiceCell>;
  data.count(agents, 'population');
  data.measure(agents, 'sugar', (a) => a.sugar.stock, { statistics: all });
  data.measure(agents, 'spice', (a) => a.spice.stock, { statistics: all });
  data.measure(agents, 'mrs', (a) => a.calculateMRS(), { statistics: all });
  data.measure(cells, 'cellSugar', (c) => c.sugar.quantity, { statistics: all });
  data.measure(cells, 'cellSpice', (c) => c.spice.quantity, { statistics: all });
  return world;
}

/** `getRules().clear()`. */
export function clearRules(scape: { readonly rules: unknown[] }): void {
  scape.rules.length = 0;
}

/** `getRules().setSelected(rule, false)`: the rule stays installed but does not run. */
export function deselectRule<A extends SugarCell>(scape: Scape<A>, rule: Rule<A>): void {
  for (const entry of scape.rules) if (entry.rule === rule) entry.enabled = false;
}

/** `getRules().clearSelection()`: every installed rule stops running. */
export function clearSelection(scape: { readonly rules: { enabled: boolean }[] }): void {
  for (const entry of scape.rules) entry.enabled = false;
}

/** Java AWT colours used by the legacy views. */
export const awt = {
  black: rgb(0, 0, 0),
  white: rgb(255, 255, 255),
  red: rgb(255, 0, 0),
  blue: rgb(0, 0, 255),
  yellow: rgb(255, 255, 0),
  pink: rgb(255, 175, 175),
  green: rgb(0, 255, 0),
} as const;

const sugarGradient = gradient(awt.black, awt.yellow);
const spiceGradient = gradient(awt.black, awt.pink);
const pollutionGradient = gradient(awt.black, awt.green);

/** `GAS_Base` cell colour: black to yellow with sugar / MAX_SUGAR. */
export function sugarCellColor(cell: SugarCell): Color {
  return sugarGradient(cell.sugar.quantity / MAX_SUGAR);
}

/** `GAS_SpiceBase` cell colour: pink by spice where spice exceeds sugar, else yellow by sugar. */
export function spiceCellColor(cell: SugarCell): Color {
  const c = cell as SpiceCell;
  return c.spice.quantity > c.sugar.quantity
    ? spiceGradient(c.spice.quantity / MAX_SPICE)
    : sugarGradient(c.sugar.quantity / MAX_SUGAR);
}

/** `GAS_II_8` pollution colour: black to green with pollution / the highest pollution so far. */
export function pollutionCellColor(cell: SugarCell): Color {
  const c = cell as SugarCell & { pollution: number };
  return pollutionGradient(c.pollution / cell.world.maxPollution);
}

/**
 * The views a model ends up with, built up the way the legacy `createViews`
 * chain sets features on `sugarView` before it is shown.
 */
export interface ViewPlan {
  title: string;
  cellColor: (cell: SugarCell) => Color;
  agentColor: (agent: SugarAgent) => Color;
  /** Further views, shown after the lattice. */
  readonly extra: ViewSpec[];
}

/** `GAS_Base.createViews`: the overhead view, sugar in yellow and agents in red. */
export function gasBaseViews(): ViewPlan {
  return {
    title: 'Sugarscape',
    cellColor: sugarCellColor,
    agentColor: () => awt.red,
    extra: [],
  };
}

/** `GAS_SpiceBase.createViews`: as `GAS_Base`, with cells coloured by sugar or spice. */
export function gasSpiceBaseViews(): ViewPlan {
  return { ...gasBaseViews(), title: 'Sugar and spice', cellColor: spiceCellColor };
}

/** Adds the planned lattice view, then the planned charts. */
export function showViews(sim: Simulation, world: SugarscapeWorld, plan: ViewPlan): void {
  sim.addView(
    gridView<SugarCell, SugarAgent>({
      title: plan.title,
      grid: world.grid,
      cellColor: plan.cellColor,
      occupantColor: plan.agentColor,
      occupantShape: 'circle',
    }),
  );
  for (const view of plan.extra) sim.addView(view);
}

/** The charts of the `GAS_Base` statistics (the legacy model had them only as data). */
export function sugarStatisticsCharts(): ViewSpec[] {
  return [
    timeSeriesView({
      title: 'Population',
      series: ['population'],
      colors: { population: colors.red },
    }),
    timeSeriesView({
      title: 'Mean sugar, vision and metabolism',
      series: ['sugar.mean', 'vision.mean', 'sugarMetabolism.mean'],
    }),
  ];
}

/** The charts of the spice statistics. */
export function spiceStatisticsCharts(): ViewSpec[] {
  return [
    timeSeriesView({
      title: 'Population',
      series: ['population'],
      colors: { population: colors.red },
    }),
    timeSeriesView({
      title: 'Mean sugar and spice held',
      series: ['sugar.mean', 'spice.mean'],
      colors: { 'sugar.mean': colors.yellow, 'spice.mean': colors.pink },
    }),
    timeSeriesView({ title: 'Mean MRS', series: ['mrs.mean'] }),
  ];
}

/** Stops the run after `period` ticks (Ascape `setStopPeriod`). */
export function stopAtPeriod(sim: Simulation, period: number): void {
  sim.observe({
    stepped(s) {
      if (s.tick >= period) s.stop(`stop period ${period} reached`);
    },
  });
}
