// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHV (createScape, initialize, createViews,
// createDrawFeatures and bean properties), LHVDisaggregate, LHVClan.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/**
 * Shared construction of the Artificial Anasazi models: parameters, scapes,
 * rules, recorded series and views. The model files only choose the kind of
 * household and the parameter defaults.
 */
import {
  Agent,
  GridScape,
  Scape,
  gridView,
  int,
  mix,
  real,
  timeSeriesView,
  colors,
  type Color,
  type Occupant,
  type ParameterSchema,
  type Simulation,
} from '@metascape/engine';
import { EARLIEST_YEAR, LATEST_YEAR, VALLEY_HEIGHT, VALLEY_WIDTH } from './data/decode';
import {
  HouseholdAggregate,
  HouseholdDisaggregate,
  HouseholdGreedy,
  Person,
  type HouseholdBase,
  type HouseholdContext,
  type PersonParameters,
} from './households';
import {
  AWT,
  CLANS,
  HistoricSite,
  Location,
  LongHouseValley,
  Settlement,
  ZONE_EMPTY,
} from './valley';

/** The kind of household a model uses. */
export type HouseholdKind = 'aggregate' | 'greedy' | 'disaggregate';

/** Default parameter values that differ between the legacy classes. */
export interface ParameterDefaults {
  readonly stopYear: number;
  readonly minFertility: number;
}

/**
 * The `LHV` bean properties plus the run's start and stop years, which
 * Ascape exposed as the StartPeriod and StopPeriod model parameters.
 */
export function lhvParameters(defaults: ParameterDefaults) {
  return {
    startYear: int(800, {
      min: EARLIEST_YEAR,
      max: LATEST_YEAR - 1,
      label: 'Start year',
      description:
        'Year the run starts in; households are seeded from the historic record of that year.',
    }),
    stopYear: int(defaults.stopYear, {
      min: EARLIEST_YEAR + 1,
      max: LATEST_YEAR,
      label: 'Stop year',
      description: 'Year the run stops at (one step per year).',
    }),
    harvestAdjustment: real(1.0, {
      min: 0,
      max: 2,
      label: 'Harvest adjustment',
      description: 'Multiplies every location’s base maize yield.',
    }),
    harvestVarianceYear: real(0.1, {
      min: 0,
      max: 1,
      label: 'Harvest variance (year)',
      description: 'Declared by the legacy model but never used by it.',
    }),
    harvestVarianceLocation: real(0.1, {
      min: 0,
      max: 1,
      label: 'Harvest variance (location)',
      description:
        'Standard deviation of location quality (fixed per run) and of each year’s harvest, relative to the mean.',
    }),
    typicalHouseholdSize: int(5, {
      min: 1,
      max: 20,
      label: 'Typical household size',
      description:
        'People per aggregate household. Only used, at start-up of the legacy class, to derive the default nutrition needs (5 x 160).',
    }),
    baseNutritionNeed: int(160, {
      min: 1,
      max: 1000,
      label: 'Base nutrition need',
      description:
        'Maize (kg per year) one adult needs; used by people in the disaggregated models.',
    }),
    householdMinNutritionNeed: int(800, {
      min: 1,
      max: 5000,
      label: 'Household min nutrition need',
      description: 'Least maize (kg per year) an aggregate household needs.',
    }),
    householdMaxNutritionNeed: int(800, {
      min: 1,
      max: 5000,
      label: 'Household max nutrition need',
      description: 'Most maize (kg per year) an aggregate household needs.',
    }),
    minFertilityAge: int(16, {
      min: 0,
      max: 60,
      label: 'Min fertility age',
      description: 'Least age at which a household can fission (people: the age of adulthood).',
    }),
    maxFertilityAge: int(16, {
      min: 0,
      max: 60,
      label: 'Max fertility age',
      description: 'Greatest age at which a household starts being able to fission.',
    }),
    minFertilityEndsAge: int(30, {
      min: 0,
      max: 80,
      label: 'Min fertility ends age',
      description: 'Least age after which a household no longer fissions.',
    }),
    maxFertilityEndsAge: int(30, {
      min: 0,
      max: 80,
      label: 'Max fertility ends age',
      description: 'Greatest age after which a household no longer fissions.',
    }),
    minDeathAge: int(30, {
      min: 0,
      max: 100,
      label: 'Min death age',
      description: 'Least age at which an aggregate household dissolves.',
    }),
    maxDeathAge: int(30, {
      min: 0,
      max: 100,
      label: 'Max death age',
      description: 'Greatest age at which an aggregate household dissolves.',
    }),
    minFertility: real(defaults.minFertility, {
      min: 0,
      max: 1,
      label: 'Min fertility',
      description: 'Least yearly probability that a fertile household fissions.',
    }),
    maxFertility: real(0.125, {
      min: 0,
      max: 1,
      label: 'Max fertility',
      description: 'Greatest yearly probability that a fertile household fissions.',
    }),
    maizeGiftToChild: real(0.33, {
      min: 0,
      max: 1,
      label: 'Maize gift to child',
      description: 'Share of its stored maize a household gives a new household.',
    }),
    waterSourceDistance: real(16.0, {
      min: 1,
      max: 40,
      label: 'Water source distance',
      description:
        'Farthest a farm may lie from water, and a settlement from extra farmland (cells).',
    }),
    yearsOfStock: int(2, {
      min: 1,
      max: 10,
      label: 'Years of stock',
      description: 'Years maize can be stored.',
    }),
    householdMinInitialAge: int(0, {
      min: 0,
      max: 100,
      label: 'Household min initial age',
      description: 'Least age of an initial household.',
    }),
    householdMaxInitialAge: int(29, {
      min: 0,
      max: 100,
      label: 'Household max initial age',
      description: 'Greatest age of an initial household.',
    }),
    householdMinInitialCorn: int(2000, {
      min: 0,
      max: 10000,
      label: 'Household min initial corn',
      description: 'Least maize in each year of an initial household’s stock.',
    }),
    householdMaxInitialCorn: int(2400, {
      min: 0,
      max: 10000,
      label: 'Household max initial corn',
      description: 'Most maize in each year of an initial household’s stock.',
    }),
  } as const satisfies ParameterSchema;
}

/** `LHVDisaggregate`'s extra bean properties. */
export function personParameters() {
  return {
    personMinInitialAge: int(0, {
      min: 0,
      max: 100,
      label: 'Person min initial age',
      description: 'Least age of a person when created (then overridden for founding families).',
    }),
    personMaxInitialAge: int(32, {
      min: 0,
      max: 100,
      label: 'Person max initial age',
      description: 'Greatest age of a person when created (then overridden for founding families).',
    }),
  } as const satisfies ParameterSchema;
}

/** All parameter values the shared builder reads. */
export type AnasaziParameters = PersonParameters & { readonly stopYear: number };

const hydrologyColor = (hydrology: number): Color =>
  mix(AWT.white, AWT.blue, Math.max(0, Math.min(1, hydrology / 10)));

/** Colour of a settlement of a given number of households (legacy "Settlement Tier"). */
export function tierColor(households: number): Color {
  if (households < 5) return AWT.black;
  if (households < 20) return AWT.green;
  return AWT.red;
}

/** Options for {@link buildLongHouseValley}. */
export interface BuildOptions {
  readonly households: HouseholdKind;
  /** Add the clan series and chart (`LHVClan`). */
  readonly clanViews?: boolean;
}

/**
 * Builds the Long House Valley world on a simulation. Scapes step in the
 * legacy order: the environment (set this year's climate and yields), the
 * valley, historic sites, settlements, households, then people.
 */
export function buildLongHouseValley<S extends ParameterSchema>(
  sim: Simulation<S>,
  options: BuildOptions,
): LongHouseValley {
  const p = sim.parameters as unknown as AnasaziParameters;
  const base = sim as unknown as Simulation;
  const world = new LongHouseValley(base, p);

  const environment = sim.addScape(
    new Scape<Agent>({ name: 'environment', size: 1, create: () => new Agent() }),
  );
  environment.addRule('set environment and yields', () => {
    world.clearCounts();
    world.updateEnvironment();
  });

  const valley = sim.addScape(
    new GridScape<Location>({
      name: 'valley',
      width: VALLEY_WIDTH,
      height: VALLEY_HEIGHT,
      wrap: false,
      neighborhood: 'moore',
      multiOccupancy: true,
      create: (x, y) => new Location(world, x, y),
    }),
  );
  world.grid = valley;

  const sites = world.historicSiteCells();
  sim.addScape(
    new Scape<HistoricSite>({
      name: 'historic sites',
      size: sites.length,
      create: (i) => new HistoricSite(world, sites[i]![0], sites[i]![1]),
    }),
  );

  const settlements = sim.addScape(
    new Scape<Settlement>({ name: 'settlements', create: () => new Settlement() }),
  );
  world.settlementScape = settlements;

  const scapes: { households?: Scape<HouseholdBase>; people?: Scape<Person> } = {};
  const context: HouseholdContext = {
    world,
    parameters: p,
    households: () => scapes.households!,
    people: () => {
      if (!scapes.people) throw new Error('This model has no people');
      return scapes.people;
    },
  };
  const create = (): HouseholdBase => {
    switch (options.households) {
      case 'aggregate':
        return new HouseholdAggregate(context);
      case 'greedy':
        return new HouseholdGreedy(context);
      case 'disaggregate':
        return new HouseholdDisaggregate(context);
    }
  };
  const households = sim.addScape(
    new Scape<HouseholdBase>({
      name: 'households',
      size: world.historicHouseholds(p.startYear),
      create,
    }),
  );
  scapes.households = households;

  // The legacy households scape runs its rules agent by agent in a random order.
  // LHVDisaggregate replaces the aggregate prototype, so its scape keeps the aggregate
  // rules and gains the base household rules again: metabolism and movement run twice.
  households.addRule('metabolism', (h) => h.metabolism());
  households.addRule('death', (h) => h.death());
  households.addRule('movement', (h) => h.movement());
  households.addRule('fissioning', (h) => h.fissioning());
  if (options.households === 'disaggregate') {
    households.addRule('metabolism (again)', (h) => h.metabolism());
    households.addRule('movement (again)', (h) => h.movement());
    const people = sim.addScape(
      new Scape<Person>({ name: 'people', create: () => new Person(context) }),
    );
    scapes.people = people;
    people.addRule('metabolism', (person) => person.metabolism());
    people.addRule('death', (person) => person.death());
    people.addRule('form household', (person) => person.householdFormation());
    people.addRule('fissioning', (person) => person.fissioning());
  }

  // Initial rules, after every agent is initialized: set the start year's
  // environment, then each household (in random order) is forced to move; a
  // disaggregated household moves twice (the duplicated Force Move rule) and
  // then creates its members (Create Scape).
  sim.setup(() => {
    world.updateEnvironment();
    const order = households.random.shuffle([...households.members]);
    for (const household of order) {
      if (!household.alive) continue;
      household.move();
      if (household instanceof HouseholdDisaggregate) {
        if (household.alive) household.move();
        if (household.alive) household.createMembers();
      }
    }
  });

  sim.observe({
    stepped: () => {
      if (world.year >= p.stopYear) sim.stop(`reached the stop year ${p.stopYear}`);
    },
  });

  recordSeries(sim, world, households, settlements, scapes.people, options);
  addViews(sim, valley, options);
  return world;
}

function recordSeries<S extends ParameterSchema>(
  sim: Simulation<S>,
  world: LongHouseValley,
  households: Scape<HouseholdBase>,
  settlements: Scape<Settlement>,
  people: Scape<Person> | undefined,
  options: BuildOptions,
): void {
  const data = sim.data;
  data.value('year', () => world.year);
  data.count(households, 'households');
  data.value('historicHouseholds', () => world.historicHouseholds());
  data.value('difference', () => households.size - world.historicHouseholds());
  data.count(settlements, 'settlements');
  data.value('historicSettlements', () => world.extantHistoricSettlements());
  data.measure(households, 'farmsPerHousehold', (h) => h.farms.length, {
    statistics: ['mean', 'max'],
  });
  data.value('movements', () => world.counts.movements);
  data.value('fissions', () => world.counts.fissions);
  data.value('departures', () => world.counts.departures);
  if (options.households === 'disaggregate' && people) {
    data.count(people, 'people');
    data.measure(households, 'householdSize', (h) => (h as HouseholdDisaggregate).members.length, {
      statistics: ['mean', 'min', 'max'],
    });
    data.value('births', () => world.counts.births);
    data.value('deaths', () => world.counts.deaths);
    data.value('householdsFormed', () => world.counts.householdsFormed);
    data.value('householdsDisbanded', () => world.counts.householdsDisbanded);
    for (const clan of CLANS) {
      data.count(households, clanSeries(clan.index), (h) => h.clan === clan);
    }
  } else {
    data.value('deathsStarvation', () => world.counts.deathsStarvation);
    data.value('deathsOldAge', () => world.counts.deathsOldAge);
  }
}

/** Series id of the household count of a clan. */
export function clanSeries(index: number): string {
  return `clan${index}`;
}

function addViews<S extends ParameterSchema>(
  sim: Simulation<S>,
  valley: GridScape<Location>,
  options: BuildOptions,
): void {
  const offMap = (location: Location): boolean =>
    location.environmentZone.info.index === ZONE_EMPTY;
  const overlay = (location: Location): Color | undefined => {
    if (location.farm !== null) return AWT.yellow;
    if (location.isCurrentWaterSource) return AWT.blue;
    return undefined;
  };
  const clanOutline = options.clanViews === true;
  sim.addView(
    gridView<Location, Occupant<Location>>({
      title: 'Long House Valley: simulation',
      grid: valley,
      cellColor: (location) => {
        if (offMap(location)) return AWT.lightGray;
        const marked = overlay(location);
        if (marked !== undefined) {
          if (clanOutline && location.farm !== null && location.clan !== null) {
            return location.clan.color;
          }
          return marked;
        }
        return location.environmentZone.info.color;
      },
      occupantColor: (occupant) =>
        occupant instanceof Settlement ? tierColor(occupant.size) : undefined,
      occupantShape: 'circle',
    }),
  );
  sim.addView(
    gridView<Location, Occupant<Location>>({
      title: 'Long House Valley: history',
      grid: valley,
      cellColor: (location) => {
        if (offMap(location)) return AWT.lightGray;
        return overlay(location) ?? hydrologyColor(location.environmentZone.hydrology);
      },
      occupantColor: (occupant) =>
        occupant instanceof HistoricSite && occupant.location.isCurrentHistoricSettlement
          ? tierColor(occupant.location.historicSettlementHouseholdCount)
          : undefined,
      occupantShape: 'circle',
    }),
  );
  sim.addView(
    timeSeriesView({
      title: 'Households: simulated and historical',
      series: ['historicHouseholds', 'households'],
      colors: { historicHouseholds: colors.red, households: colors.blue },
      yMin: 0,
    }),
  );
  if (options.households === 'disaggregate') {
    sim.addView(
      timeSeriesView({
        title: 'People',
        series: ['people'],
        colors: { people: colors.green },
        yMin: 0,
      }),
    );
  }
  if (clanOutline) {
    const series = CLANS.map((clan) => clanSeries(clan.index));
    sim.addView(
      timeSeriesView({
        title: 'Households by clan',
        series,
        colors: Object.fromEntries(CLANS.map((clan) => [clanSeries(clan.index), clan.color])),
        yMin: 0,
      }),
    );
  }
}
