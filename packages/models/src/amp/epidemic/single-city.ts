// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Epidemic.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  barsView,
  Cell,
  colors,
  GridScape,
  gridView,
  int,
  Network,
  networkView,
  Scape,
  timeSeriesView,
  type ParameterSchema,
  type Simulation,
} from '@metascape/engine';
import { durationParameters, movementParameter, transmissionParameters } from './parameters';
import {
  Creature,
  Individual,
  Status,
  statusColors,
  statusNames,
  type DiseaseParameters,
  type Epidemiology,
} from './disease';

/** The parameters of the single-city variants. */
export interface CityParameters extends DiseaseParameters {
  readonly individualCount: number;
  readonly periodsperDay: number;
  readonly cityWidth: number;
  readonly cityHeight: number;
}

/** Parameters of Epidemic.metaabm and its single-city variants. */
export function cityParameters(defaults: {
  readonly individualCount: number;
  readonly initialInfectionProbability: number;
}) {
  return {
    individualCount: int(defaults.individualCount, {
      min: 0,
      max: 20000,
      label: 'Individual Count',
      description: 'The number of individuals to create.',
    }),
    ...transmissionParameters(defaults.initialInfectionProbability),
    periodsperDay: int(24, {
      min: 1,
      max: 1000,
      label: 'Periods per Day',
      description: 'Periods in a day. Declared by the AMP model but not used by any rule.',
    }),
    ...durationParameters(),
    ...movementParameter(),
    cityWidth: int(40, {
      min: 1,
      max: 200,
      label: 'City Width',
      description: 'The horizontal extent of the city grid.',
    }),
    cityHeight: int(100, {
      min: 1,
      max: 200,
      label: 'City Height',
      description: 'The vertical extent of the city grid.',
    }),
  } as const;
}

/** A site of the city grid. */
export class Place extends Cell {}

/** Everything a variant gets back from {@link buildCity}. */
export interface CityWorld {
  readonly city: GridScape<Place>;
  readonly individuals: Scape<Individual>;
}

/** Options of {@link buildCity}. */
export interface CityOptions {
  /** Record who infected whom in this directed network (the Contact variant). */
  readonly contacts?: Network<Individual>;
  /** Called after the individuals scape is added, to add further scapes of creatures (Plague). */
  readonly addCreatures?: (city: GridScape<Place>) => void;
}

/**
 * Builds the single-city epidemic: a 40 x 100 (by default) bounded Moore grid
 * with one individual per cell at most. Scapes are added in the order of the
 * AMP model (city, individuals, then any creatures), and every scape runs its
 * rules rule by rule over its members in random order, like `RULE_ORDER`
 * scapes in Ascape.
 */
export function buildCity<S extends ParameterSchema>(
  sim: Simulation<S>,
  p: CityParameters,
  options: CityOptions = {},
): CityWorld {
  const epi: Epidemiology = { parameters: p, period: () => sim.tick };
  const city = sim.addScape(
    new GridScape<Place>({
      name: 'city',
      width: p.cityWidth,
      height: p.cityHeight,
      wrap: false,
      neighborhood: 'moore',
      create: () => new Place(),
    }),
  );
  const individuals = sim.addScape(
    new Scape<Individual>({
      name: 'individuals',
      size: p.individualCount,
      schedule: 'byRule',
      create: () => new Individual(epi),
    }),
  );
  const contacts = options.contacts;

  // Initialize Location: a random available cell. Individuals beyond the
  // number of cells stay without a location.
  individuals.addInitialRule('initialize location', (person) => {
    const cell = city.randomAvailableCell();
    if (cell) person.moveTo(cell);
  });
  individuals.addInitialRule('initialize state', (person) => {
    person.initializeState();
    if (contacts && person.status === Status.exposed) {
      // Connect to every individual that is exposed at this moment, in cell order.
      for (const cell of city.members) {
        const other = cell.occupant;
        if (other instanceof Individual && other.status === Status.exposed) {
          contacts.connect(person, other);
        }
      }
    }
  });
  individuals.addRule('movement', (person) => {
    if (person.cell) person.movement();
  });
  individuals.addRule('transmission', (person) => {
    if (!person.cell) return;
    const infected = person.transmission();
    if (infected && contacts) contacts.connect(person, infected);
  });
  individuals.addRule('progression', (person) => person.progression());

  options.addCreatures?.(city);

  for (const name of statusNames) {
    sim.data.count(individuals, name, (a) => statusNames[a.status] === name);
  }
  sim.data.count(individuals, 'population');
  sim.data.measure(individuals, 'exposureEndPeriod', (a) => a.exposureEndPeriod, {
    statistics: ['mean', 'min', 'max'],
  });
  sim.data.measure(
    individuals,
    'contactTransmissionProbability',
    (a) => a.contactTransmissionProbability,
    { statistics: ['mean', 'min', 'max'] },
  );

  const palette = { ...statusColors } as Record<string, number>;
  sim.addView(
    gridView<Place, Creature>({
      title: 'City',
      grid: city,
      occupantColor: (o) => o.color(),
      occupantShape: 'circle',
      background: colors.white,
    }),
  );
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
  if (contacts) {
    sim.addView(
      networkView<Individual>({
        title: 'Contacts',
        nodes: individuals,
        network: contacts,
        color: (o) => o.color(),
        layout: 'force',
      }),
    );
  }
  return { city, individuals };
}
