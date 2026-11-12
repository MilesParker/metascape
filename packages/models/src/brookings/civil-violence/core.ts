// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.cv.CVModel, CVModelInterGroup, CVModelInterGroupRetr (and the paper variants built on them).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  mix,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
  type Color,
  type Model,
  type Provenance,
  type Simulation,
} from '@metascape/engine';
import {
  ACTIVE,
  BLUE,
  Citizen,
  CitizenBlueGreen,
  Cop,
  CvWorld,
  GREEN,
  IN_JAIL,
  NEVER_RELEASED,
  QUIESCENT,
  type CvSettings,
} from './agents';

/** Overrides of the parameter defaults a variant changes. */
export type CvDefaults = Partial<Record<keyof CvSettings, number>>;

/** The parameters of Model I (rebellion). Defaults are those of `CVModel`. */
export function rebellionParameters(d: CvDefaults = {}) {
  return {
    width: int(d.width ?? 40, {
      min: 5,
      max: 200,
      label: 'Lattice width',
      description: 'Number of columns (legacy: fixed at 40).',
    }),
    height: int(d.height ?? 40, {
      min: 5,
      max: 200,
      label: 'Lattice height',
      description: 'Number of rows (legacy: fixed at 40).',
    }),
    initialPopulationDensity: real(d.initialPopulationDensity ?? 0.7, {
      min: 0,
      max: 1,
      label: 'Initial population density',
      description:
        'Citizens as a fraction of lattice sites. With the initial cop density it must not exceed 1.',
    }),
    initialCopDensity: real(d.initialCopDensity ?? 0.04, {
      min: 0,
      max: 1,
      label: 'Initial cop density',
      description: 'Cops as a fraction of lattice sites; also the target the cop count is kept at.',
    }),
    copVision: real(d.copVision ?? 1.7, {
      min: 0,
      max: 16,
      label: 'Cop vision',
      description: 'How far a cop sees an active citizen, in lattice units.',
    }),
    citizenVision: real(d.citizenVision ?? 1.7, {
      min: 0,
      max: 16,
      label: 'Citizen vision',
      description: 'How far a citizen sees cops and active citizens, in lattice units.',
    }),
    legitimacy: real(d.legitimacy ?? 0.8, {
      min: 0,
      max: 1,
      label: 'Legitimacy',
      description:
        'Perceived legitimacy of the central authority; grievance is hardship times one minus legitimacy.',
    }),
    activeThreshold: real(d.activeThreshold ?? 0.1, {
      min: 0,
      max: 1,
      label: 'Active threshold',
      description: 'A citizen turns active when grievance minus perceived risk exceeds this.',
    }),
    jailTerm: int(d.jailTerm ?? 15, {
      min: 0,
      max: NEVER_RELEASED,
      label: 'Jail term',
      description:
        'Maximum jail term in ticks; each term is drawn uniformly from 0 to this. 2147483647 means never released.',
    }),
  };
}

/** The parameters of Model II (inter-group violence). Defaults are those of `CVModelInterGroup`. */
export function intergroupParameters(d: CvDefaults = {}) {
  return {
    ...rebellionParameters({ initialCopDensity: 0, ...d }),
    fissionProbability: real(d.fissionProbability ?? 0.05, {
      min: 0,
      max: 1,
      label: 'Fission probability',
      description: 'Chance per tick that a citizen with a free neighboring site clones itself.',
    }),
    deathAge: int(d.deathAge ?? 200, {
      min: 0,
      max: 100000,
      label: 'Death age',
      description: 'Citizens older than this die; initial ages are uniform up to it.',
    }),
    initialBlueLegitimacy: real(d.initialBlueLegitimacy ?? 0.2, {
      min: 0,
      max: 1,
      label: 'Initial blue legitimacy',
      description: 'Starting value of the recorded blue legitimacy.',
    }),
    initialGreenLegitimacy: real(d.initialGreenLegitimacy ?? 0.2, {
      min: 0,
      max: 1,
      label: 'Initial green legitimacy',
      description: 'Starting value of the recorded green legitimacy.',
    }),
    evaporation: real(d.evaporation ?? 0.9, {
      min: 0,
      max: 1,
      label: 'Evaporation of history',
      description: 'Fraction of past distrust carried over each tick.',
    }),
  };
}

/** How one legacy class differs from the shared model. */
export interface CvVariant {
  readonly kind: 'rebellion' | 'intergroup';
  /** False in Model I, Run 1: citizens do not walk (cops still do). */
  readonly citizensMove?: boolean;
  /** Citizens decide with the retaliation estimate (`CVModelInterGroupRetr`). */
  readonly retaliation?: boolean;
  /** Target cop density at the start, when it differs from the initial cop density (Run 5). */
  readonly startTargetCopDensity?: number;
  /** Which scaled series the population chart carries besides the counts. */
  readonly chartExtra?: 'legitimacy' | 'copDensity';
  /** Called after each tick's data sample and cop adjustment (legacy `scapeIterated`). */
  readonly afterIteration?: (world: CvWorld, iteration: number) => void;
}

const BACKGROUND = rgb(237, 230, 214);

function occupantColor(o: Occupant<Cell>, intergroup: boolean): Color | undefined {
  if (o instanceof Cop) return colors.black;
  if (o instanceof Citizen) {
    if (o.state !== QUIESCENT) return colors.red;
    if (intergroup && o instanceof CitizenBlueGreen)
      return o.group === BLUE ? colors.blue : colors.green;
    return colors.blue;
  }
  return undefined;
}

/** Builds the world, rules, data and views shared by every Civil Violence model. */
export function buildCivilViolence(sim: Simulation, s: CvSettings, variant: CvVariant): void {
  if (s.initialPopulationDensity + s.initialCopDensity > 1) {
    throw new RangeError('Initial population density plus initial cop density must not exceed 1');
  }
  const intergroup = variant.kind === 'intergroup';
  const lattice = sim.addScape(
    new GridScape<Cell>({
      name: 'lattice',
      width: s.width,
      height: s.height,
      wrap: true,
      neighborhood: 'moore',
    }),
  );
  const world = new CvWorld(lattice, s);
  if (variant.startTargetCopDensity !== undefined)
    world.targetCopDensity = variant.startTargetCopDensity;
  const sites = s.width * s.height;

  const people = sim.addScape(
    new Scape<Citizen>({
      name: 'people',
      size: Math.trunc(sites * s.initialPopulationDensity),
      create: () => (intergroup ? new CitizenBlueGreen(world) : new Citizen(world)),
    }),
  );
  if (variant.citizensMove !== false) people.addRule('Random Walk', (c) => c.randomWalk());
  people.addRule('Check Jail', (c) => c.checkJail());
  if (variant.retaliation) {
    people.addRule('Decide State with Retaliation', (c) =>
      (c as CitizenBlueGreen).decideStateWithRetaliation(),
    );
  } else {
    people.addRule('Decide State', (c) => c.decideState());
  }
  if (intergroup) {
    people.addRule('Fissioning', (c) => c.fissioning());
    people.addRule('Metabolism', (c) => c.metabolism());
    people.addRule('Death', (c) => c.death());
    people.addRule('Attack Other Retribution', (c) => (c as CitizenBlueGreen).attackOther());
  }

  const cops = sim.addScape(
    new Scape<Cop>({
      name: 'cops',
      size: Math.trunc(sites * s.initialCopDensity),
      create: () => new Cop(world),
    }),
  );
  cops.addRule('Patrol', (c) => c.patrol());
  cops.addRule('Random Walk', (c) => c.randomWalk());

  // Legacy initial rule "move to random location", people first, then cops. Done here
  // rather than as an initial rule so that cloned citizens are not re-placed.
  sim.setup(() => {
    for (const c of people.members) c.moveToRandomLocation();
    for (const c of cops.members) c.moveToRandomLocation();
  });

  const matchTargetCopDensity = (): void => {
    const target = (): number => Math.trunc(world.targetCopDensity * sites);
    while (cops.size !== target()) {
      if (cops.size < target()) {
        cops.spawn().moveToRandomLocation();
      }
      if (cops.size > target()) cops.randomMember()!.die();
    }
  };

  const data = sim.data;
  const nonJailed = (c: Citizen): boolean => c.state !== IN_JAIL;
  data.count(people, 'Active', (c) => c.state === ACTIVE);
  data.count(people, 'Quiescent', (c) => c.state === QUIESCENT);
  data.count(people, 'Jailed', (c) => c.state === IN_JAIL);
  data.count(people, 'Non-Jailed', nonJailed);
  data.count(cops, 'Cops');
  data.measure(people, 'Risk Aversion', (c) => c.riskAversion, { statistics: ['mean'] });
  data.measure(people, 'Grievance', (c) => c.grievance, { statistics: ['mean'] });
  data.measure(people, 'Non-Jailed Risk Aversion', (c) => c.riskAversion, {
    statistics: ['mean'],
    when: nonJailed,
  });
  data.measure(people, 'Non-Jailed Grievance', (c) => c.grievance, {
    statistics: ['mean'],
    when: nonJailed,
  });
  const ratio = (part: string, whole: string): number => {
    const w = data.latest(whole);
    return w !== 0 ? data.latest(part) / w : 0;
  };
  data.value('Active Ratio', () => ratio('Active', 'Non-Jailed'));
  data.value('Quiescent Ratio', () => ratio('Quiescent', 'Non-Jailed'));
  data.value(
    'Tension',
    () =>
      (data.latest('Non-Jailed Grievance.mean') * data.latest('Quiescent Ratio')) /
      data.latest('Non-Jailed Risk Aversion.mean'),
  );
  data.value('Legitimacy', () => world.legitimacy * 1000);
  data.value('Cop Density', () => world.targetCopDensity * 10000);

  if (intergroup) declareGroupData(sim, world, people);

  sim.observe({
    stepped: (running) => {
      matchTargetCopDensity();
      variant.afterIteration?.(world, running.tick);
      world.killsByBlue = 0;
      world.killsByGreen = 0;
    },
  });

  const background = BACKGROUND;
  sim.addView(
    gridView<Cell, Occupant<Cell>>({
      title: 'Agent View',
      grid: lattice,
      background,
      occupantColor: (o) => occupantColor(o, intergroup),
      occupantShape: 'circle',
    }),
  );
  sim.addView(
    gridView<Cell, Occupant<Cell>>({
      title: 'Grievance View',
      grid: lattice,
      background,
      cellColor: (cell) => {
        const o = cell.occupant;
        if (o instanceof Cop) return colors.black;
        if (o instanceof Citizen) return mix(background, colors.red, o.grievance);
        return background;
      },
    }),
  );

  const population = intergroup
    ? ['Active', 'Blue', 'Green', 'Jailed']
    : variant.chartExtra === 'legitimacy'
      ? ['Active', 'Jailed', 'Legitimacy']
      : variant.chartExtra === 'copDensity'
        ? ['Active', 'Jailed', 'Cop Density']
        : ['Active', 'Quiescent', 'Jailed'];
  sim.addView(
    timeSeriesView({
      title: 'Population Chart',
      series: population,
      colors: {
        Active: colors.red,
        Quiescent: colors.blue,
        Jailed: colors.black,
        Blue: colors.blue,
        Green: colors.green,
        Legitimacy: colors.gray,
        'Cop Density': colors.gray,
      },
    }),
  );
  sim.addView(
    timeSeriesView({
      title: 'Measures Chart',
      series: intergroup
        ? ['Blue Legitimacy', 'Green Legitimacy']
        : [
            'Non-Jailed Grievance.mean',
            'Grievance.mean',
            'Non-Jailed Risk Aversion.mean',
            'Risk Aversion.mean',
            'Quiescent Ratio',
            'Tension',
          ],
      colors: {
        'Non-Jailed Grievance.mean': colors.red,
        'Grievance.mean': colors.orange,
        'Non-Jailed Risk Aversion.mean': colors.green,
        'Risk Aversion.mean': colors.teal,
        'Quiescent Ratio': colors.blue,
        Tension: colors.purple,
        'Blue Legitimacy': colors.blue,
        'Green Legitimacy': colors.green,
      },
    }),
  );
}

/** Model II's per-group counts, ratios, tension, kills and recorded legitimacies. */
function declareGroupData(sim: Simulation, world: CvWorld, people: Scape<Citizen>): void {
  const data = sim.data;
  const groupOf = (c: Citizen): number => (c as CitizenBlueGreen).group;
  const names: [string, number][] = [
    ['Blue', BLUE],
    ['Green', GREEN],
  ];
  for (const [name, group] of names) {
    const mine = (c: Citizen): boolean => groupOf(c) === group;
    const mineNonJailed = (c: Citizen): boolean => mine(c) && c.state !== IN_JAIL;
    data.count(people, name, mine);
    data.count(people, `${name} Quiescent`, (c) => mine(c) && c.state === QUIESCENT);
    data.count(people, `${name} Active`, (c) => mine(c) && c.state === ACTIVE);
    data.count(people, `${name} Non-Jailed`, mineNonJailed);
    data.measure(people, `${name} Non-Jailed Risk Aversion`, (c) => c.riskAversion, {
      statistics: ['mean'],
      when: mineNonJailed,
    });
    data.measure(people, `${name} Non-Jailed Grievance`, (c) => c.grievance, {
      statistics: ['mean'],
      when: mineNonJailed,
    });
    const part = (p: string): number => {
      const w = data.latest(`${name} Non-Jailed`);
      return w !== 0 ? data.latest(`${name} ${p}`) / w : 0;
    };
    data.value(`${name} Active Ratio`, () => part('Active'));
    data.value(`${name} Quiescent Ratio`, () => part('Quiescent'));
    data.value(
      `${name} Tension`,
      () =>
        data.latest(`${name} Non-Jailed Grievance.mean`) /
        (1 -
          data.latest(`${name} Quiescent Ratio`) *
            data.latest(`${name} Non-Jailed Risk Aversion.mean`)),
    );
  }
  data.value('Greens Killed By Blue', () => world.killsByBlue);
  data.value('Blues Killed By Green', () => world.killsByGreen);
  const evaporation = world.settings.evaporation;
  data.value('[Calculate Legitimacy]', () => {
    // Legacy quirk kept: the guards test the other group's count than the divisor.
    if (sim.tick > 1) {
      const blue = data.latest('Blue');
      const green = data.latest('Green');
      if (green !== 0)
        world.greenDistrust = world.killsByGreen / blue + evaporation * world.greenDistrust;
      else world.greenDistrust = evaporation * world.greenDistrust;
      world.greenDistrust = Math.min(1, world.greenDistrust);
      world.greenLegitimacy = 1 - world.greenDistrust;
      if (blue !== 0)
        world.blueDistrust = world.killsByBlue / green + evaporation * world.blueDistrust;
      else world.blueDistrust = evaporation * world.blueDistrust;
      world.blueDistrust = Math.min(1, world.blueDistrust);
      world.blueLegitimacy = 1 - world.blueDistrust;
    }
    return 0;
  });
  data.value('Blue Legitimacy', () => world.blueLegitimacy);
  data.value('Green Legitimacy', () => world.greenLegitimacy);
}

/** What a model file supplies for one legacy class. */
export interface CvModelSpec {
  readonly name: string;
  readonly description: string;
  readonly legacyClass: string;
  readonly note?: string;
  readonly variant: CvVariant;
}

const CITATION =
  'Epstein, J. M. (2002). Modeling civil violence: An agent-based computational approach. PNAS, 99(suppl. 3), 7243-7250.';
const COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

function provenance(spec: CvModelSpec): Provenance {
  return {
    authors: 'Joshua M. Epstein',
    citation: CITATION,
    portedFrom: `Ascape 5.6.1, ${spec.legacyClass}`,
    copyright: COPYRIGHT,
    ...(spec.note ? { note: spec.note } : {}),
  };
}

/** Defines a Model I (rebellion) model from a legacy class. */
export function defineRebellionModel(spec: CvModelSpec, defaults: CvDefaults = {}) {
  return defineModel({
    name: spec.name,
    description: spec.description,
    provenance: provenance(spec),
    parameters: rebellionParameters(defaults),
    build(sim) {
      const p = sim.parameters;
      buildCivilViolence(
        sim as unknown as Simulation,
        {
          ...p,
          fissionProbability: 0,
          deathAge: 0,
          initialBlueLegitimacy: 0,
          initialGreenLegitimacy: 0,
          evaporation: 1,
        },
        spec.variant,
      );
    },
  });
}

/** Defines a Model II (inter-group) model from a legacy class. */
export function defineIntergroupModel(spec: CvModelSpec, defaults: CvDefaults = {}) {
  return defineModel({
    name: spec.name,
    description: spec.description,
    provenance: provenance(spec),
    parameters: intergroupParameters(defaults),
    build(sim) {
      buildCivilViolence(sim as unknown as Simulation, { ...sim.parameters }, spec.variant);
    },
  });
}

export type { Model };
