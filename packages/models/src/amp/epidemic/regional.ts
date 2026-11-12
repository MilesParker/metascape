// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example models EpidemicRegional.metaabm and EpidemicPeriods.java.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  barsView,
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  Scape,
  timeSeriesView,
  type Color,
  type ParameterSchema,
  type Simulation,
} from '@metascape/engine';
import { durationParameters, movementParameter, transmissionParameters } from './parameters';
import {
  Individual,
  Status,
  statusColors,
  statusNames,
  type DiseaseParameters,
  type Epidemiology,
} from './disease';

/** The community-level infection state of a {@link City}. */
export const CommunityStatus = { originCity: 0, infectionsObserved: 1, noInfections: 2 } as const;
export type CommunityStatus = (typeof CommunityStatus)[keyof typeof CommunityStatus];

/** The parameters of the regional variant. */
export interface RegionalParameters extends DiseaseParameters {
  readonly cityCount: number;
  readonly migrationProbability: number;
  readonly regionalMapWidth: number;
  readonly regionalMapHeight: number;
  readonly individualCount: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
}

/** A site of a city map or of the regional map. */
export class MapCell extends Cell {}

/**
 * A city: it stands on a cell of the regional map and owns a map of its own
 * and the individuals living on it.
 */
export class City extends Occupant {
  communityStatus: CommunityStatus = CommunityStatus.noInfections;
  map!: GridScape<MapCell>;
  people!: Scape<Resident>;
  /** Position in creation order, for naming. */
  index = 0;
  color(): Color {
    return this.communityStatus === CommunityStatus.originCity
      ? colors.gray
      : this.communityStatus === CommunityStatus.infectionsObserved
        ? colors.yellow
        : colors.blue;
  }
}

/** An individual that belongs to a city and can migrate to a neighbouring one. */
export class Resident extends Individual {
  city!: City;

  protected override symptomsObserved(): void {
    this.city.communityStatus = CommunityStatus.infectionsObserved;
  }
}

/** Shared state of one regional run. */
interface Region {
  initialCityAssigned: boolean;
  readonly cities: City[];
}

/** Parameters of EpidemicRegional.metaabm. The city-level ones belong to the `City` agent there. */
function regionalParameters(defaults: {
  readonly cityCount: number;
  readonly migrationProbability: number;
  readonly regionalMapWidth: number;
  readonly regionalMapHeight: number;
}) {
  return {
    cityCount: int(defaults.cityCount, {
      min: 1,
      max: 400,
      label: 'City Count',
      description: 'The number of cities to create.',
    }),
    ...transmissionParameters(0.05),
    ...durationParameters([12, 48]),
    ...movementParameter(),
    migrationProbability: real(defaults.migrationProbability, {
      min: 0,
      max: 1,
      label: 'Migration Probability',
      description:
        'The chance per period that an individual moves to a random free place in a neighbouring city.',
    }),
    regionalMapWidth: int(defaults.regionalMapWidth, {
      min: 1,
      max: 100,
      label: 'Regional Map Width',
      description: 'The horizontal extent of the wrapped regional map on which the cities stand.',
    }),
    regionalMapHeight: int(defaults.regionalMapHeight, {
      min: 1,
      max: 100,
      label: 'Regional Map Height',
      description: 'The vertical extent of the wrapped regional map on which the cities stand.',
    }),
    individualCount: int(300, {
      min: 0,
      max: 5000,
      label: 'City Individual Count',
      description: 'Individuals in each city (the City attribute individualCount).',
    }),
    mapWidth: int(20, {
      min: 1,
      max: 200,
      label: 'City Map Width',
      description: 'The horizontal extent of each city map.',
    }),
    mapHeight: int(50, {
      min: 1,
      max: 200,
      label: 'City Map Height',
      description: 'The vertical extent of each city map.',
    }),
  } as const;
}

/** Builds a region of cities. Shared by the regional models. */
function buildRegion<S extends ParameterSchema>(
  sim: Simulation<S>,
  p: RegionalParameters,
  stopPeriod?: number,
): void {
  const epi: Epidemiology = { parameters: p, period: () => sim.tick };
  const region: Region = { initialCityAssigned: false, cities: [] };
  const parts: { map: GridScape<MapCell>; people: Scape<Resident> }[] = [];

  const regionalMap = sim.addScape(
    new GridScape<MapCell>({
      name: 'regional map',
      width: p.regionalMapWidth,
      height: p.regionalMapHeight,
      wrap: true,
      neighborhood: 'moore',
      create: () => new MapCell(),
    }),
  );
  const cities = sim.addScape(
    new Scape<City>({
      name: 'cities',
      size: p.cityCount,
      create: (i) => {
        const city = new City();
        city.index = i;
        return city;
      },
    }),
  );
  // Setup Location: each city takes a random free cell of the regional map.
  cities.addInitialRule('setup location', (city) => {
    const cell = regionalMap.randomAvailableCell();
    if (cell) city.moveTo(cell);
  });

  // The city scapes are created up front (scapes can only be added while the
  // model is built); their individuals are created and initialized in setup.
  for (let i = 0; i < p.cityCount; i++) {
    const map = sim.addScape(
      new GridScape<MapCell>({
        name: `city ${i} map`,
        width: p.mapWidth,
        height: p.mapHeight,
        wrap: false,
        neighborhood: 'moore',
        create: () => new MapCell(),
      }),
    );
    const people = sim.addScape(
      new Scape<Resident>({
        name: `city ${i} individuals`,
        schedule: 'byRule',
        create: () => new Resident(epi),
      }),
    );
    people.addRule('movement', (person) => {
      if (person.cell) person.movement();
    });
    people.addRule('transmission', (person) => {
      if (person.cell) person.transmission();
    });
    people.addRule('progression', (person) => person.progression());
    people.addRule('migrate', (person) => migrate(person, p, epi));
    parts.push({ map, people });
  }

  sim.setup(() => {
    const members = cities.members;
    for (let i = 0; i < members.length; i++) {
      const city = members[i]!;
      city.map = parts[i]!.map;
      city.people = parts[i]!.people;
      region.cities.push(city);
    }
    // City by city: Initialize Location for every individual, then Initialize State.
    for (const city of region.cities) {
      const created: Resident[] = [];
      for (let k = 0; k < p.individualCount; k++) {
        const person = city.people.spawn();
        person.city = city;
        created.push(person);
      }
      const order = (): Resident[] => city.people.random.shuffle([...created]);
      for (const person of order()) {
        const cell = city.map.randomAvailableCell();
        if (cell) person.moveTo(cell);
      }
      for (const person of order()) initializeState(person, p, region);
    }
  });

  const census = makeCensus(region);
  for (const name of statusNames) {
    sim.data.value(name, (s) => census(s.tick)[Status[name]]!);
  }
  sim.data.value('population', (s) => census(s.tick).reduce((a, b) => a + b, 0));
  sim.data.value(
    'citiesWithInfectionsObserved',
    () =>
      region.cities.filter((c) => c.communityStatus === CommunityStatus.infectionsObserved).length,
  );
  for (let i = 0; i < p.cityCount; i++) {
    sim.data.value(`city ${i} symptomInfectious`, () => {
      const city = region.cities[i];
      return city ? city.people.count((a) => a.status === Status.symptomInfectious) : 0;
    });
  }

  if (stopPeriod !== undefined) {
    sim.observe({
      stepped(s) {
        if (s.tick >= stopPeriod) s.stop('stop period reached');
      },
    });
  }

  const palette = { ...statusColors } as Record<string, number>;
  sim.addView(
    gridView<MapCell, City>({
      title: 'Region',
      grid: regionalMap,
      occupantColor: (c) => c.color(),
      occupantShape: 'square',
      background: colors.white,
    }),
  );
  for (let i = 0; i < Math.min(p.cityCount, 4); i++) {
    const map = sim.scape(`city ${i} map`) as GridScape<MapCell>;
    sim.addView(
      gridView<MapCell, Individual>({
        title: `City ${i}`,
        grid: map,
        occupantColor: (o) => o.color(),
        occupantShape: 'circle',
        background: colors.white,
      }),
    );
  }
  sim.addView(
    timeSeriesView({
      title: 'Individuals by status',
      series: [...statusNames],
      colors: palette,
      yMin: 0,
    }),
  );
  sim.addView(
    barsView({ title: 'Individuals by status now', series: [...statusNames], colors: palette }),
  );
}

/** Totals by status over all cities, recomputed once per tick. */
function makeCensus(region: Region): (tick: number) => number[] {
  let cachedTick = -1;
  let cached: number[] = [];
  return (tick) => {
    if (tick !== cachedTick || cached.length === 0) {
      cached = [0, 0, 0, 0, 0, 0];
      for (const city of region.cities) {
        for (const person of city.people.members) cached[person.status]!++;
      }
      cachedTick = tick;
    }
    return cached;
  };
}

/** Initialize State of a regional individual. */
function initializeState(person: Resident, p: RegionalParameters, region: Region): void {
  const rate =
    person.random.float() *
      (p.maxContactTransmissionProbability - p.minContactTransmissionProbability) +
    p.minContactTransmissionProbability;
  person.contactTransmissionProbability = rate;
  if (person.city.communityStatus === CommunityStatus.originCity) {
    if (person.random.float() < p.initialInfectionProbability) person.setStatus(Status.exposed);
  }
  if (!region.initialCityAssigned) {
    region.initialCityAssigned = true;
    person.city.communityStatus = CommunityStatus.originCity;
    if (person.random.float() < p.initialInfectionProbability) person.setStatus(Status.exposed);
  }
}

/**
 * Migrate rule: with the migration probability, pick a random neighbouring
 * city and move to a random free place on its map.
 */
function migrate(person: Resident, p: RegionalParameters, epi: Epidemiology): void {
  if (!(person.random.float() < p.migrationProbability)) return;
  const neighbors = person.city.neighboringOccupants().filter((o): o is City => o instanceof City);
  if (neighbors.length === 0) return;
  const target = person.random.pick(neighbors);
  const cell = target.map.randomAvailableCell();
  if (!cell) return;
  const from = person.city;
  if (from === target) {
    person.moveTo(cell);
    return;
  }
  // An agent cannot be re-added to another scape without lingering in the
  // old one's member list, so the migrant is replaced by a copy.
  const migrant = new Resident(epi);
  migrant.copyStateFrom(person);
  from.people.remove(person);
  target.people.add(migrant);
  migrant.city = target;
  migrant.moveTo(cell);
}

const regionalDescription =
  'Several cities, each a bounded grid of individuals running the Epidemic disease model, stand on a wrapped regional map. Individuals occasionally migrate to a neighbouring city; one city is chosen at random as the origin of the infection.';

/** EpidemicRegional.metaabm. */
export const epidemicRegional = defineModel({
  name: 'Epidemic (AMP): Regional',
  description: regionalDescription,
  provenance: {
    authors: 'Miles Parker',
    portedFrom: 'Eclipse AMP, EpidemicRegional.metaabm',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: 'The AMP model has no description or attribution statement; the authors are taken from the other Epidemic models of the same project.',
  },
  parameters: regionalParameters({
    cityCount: 4,
    migrationProbability: 0.1,
    regionalMapWidth: 2,
    regionalMapHeight: 2,
  }),
  build(sim) {
    buildRegion(sim, sim.parameters);
  },
});

/**
 * EpidemicPeriods.java, a hand-written subclass of the generated `Region`
 * class: a 40 x 4 map of 100 cities, a migration probability of 0.0005 and a
 * stop period of 3000.
 */
export const epidemicRegionalPeriods = defineModel({
  name: 'Epidemic (AMP): Regional Periods',
  description: `${regionalDescription} This run uses a long, thin region of 100 cities and rare migration, and stops after 3000 periods.`,
  provenance: {
    authors: 'Miles Parker',
    portedFrom:
      'Eclipse AMP, EpidemicPeriods.java (subclass of the generated Region of EpidemicRegional.metaabm)',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: 'The original also writes data files; that output is not ported.',
  },
  parameters: regionalParameters({
    cityCount: 100,
    migrationProbability: 0.0005,
    regionalMapWidth: 40,
    regionalMapHeight: 4,
  }),
  build(sim) {
    buildRegion(sim, sim.parameters, 3000);
  },
});
