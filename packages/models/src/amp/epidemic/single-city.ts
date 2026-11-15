// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Epidemic.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  type Array2D,
  Array2DMoore,
  barsView,
  colors,
  gridView,
  HostCell,
  int,
  Graph,
  networkView,
  type ParameterSchema,
  type RootScape,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';
import { durationParameters, movementParameter, transmissionParameters } from './parameters';
import {
  Creature,
  Individual,
  Status,
  STATUS_LABELS,
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
export class Place extends HostCell {}

/** Everything a variant gets back from {@link buildCity}. */
export interface CityWorld {
  readonly city: Array2D<Place>;
  readonly individuals: Scape<Individual>;
}

/** Options of {@link buildCity}. */
export interface CityOptions {
  /** Record who infected whom in this directed network (the Contact variant). */
  readonly contacts?: Graph<Individual>;
  /** Called after the individuals scape is added, to add further scapes of creatures (Plague). */
  readonly addCreatures?: (city: Array2D<Place>) => void;
}

/**
 * Builds the single-city epidemic: a 40 x 100 (by default) bounded Moore grid
 * with one individual per cell at most. Scapes are added in the order of the
 * AMP model (city, individuals, then any creatures), and every scape runs its
 * rules rule by rule over its members in random order, like `RULE_ORDER`
 * scapes in Ascape.
 */
export function buildCity<S extends ParameterSchema>(
  root: RootScape<S>,
  p: CityParameters,
  options: CityOptions = {},
): CityWorld {
  const epi: Epidemiology = { parameters: p, period: () => root.iteration };
  const city = root.add(
    new Scape<Place>({
      name: 'city',
      space: new Array2DMoore<Place>(),
      extent: [p.cityWidth, p.cityHeight],
      periodic: false,
      prototypeAgent: () => new Place(),
    }),
  );
  const individuals = root.add(
    new Scape<Individual>({
      name: 'individuals',
      size: p.individualCount,
      executionOrder: 'byRule',
      prototypeAgent: () => new Individual(epi),
    }),
  );
  const contacts = options.contacts;
  // The contact network, as a graph whose members are the individuals it links. It draws
  // nothing at random, so it shares the root's stream rather than forking one.
  if (contacts) {
    root.add(new Scape<Individual>({ name: 'Contacts', space: contacts, randomStream: 'parent' }));
  }

  // Initialize Location: a random available cell. Individuals beyond the
  // number of cells stay without a location.
  individuals.addInitialRule('initialize location', (person) => {
    const cell = city.findRandom((cell) => cell.isAvailable);
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
    if (person.hostCell) person.movement();
  });
  individuals.addRule('transmission', (person) => {
    if (!person.hostCell) return;
    const infected = person.transmission();
    if (infected && contacts) contacts.connect(person, infected);
  });
  individuals.addRule('progression', (person) => person.progression());

  options.addCreatures?.(city.space as Array2D<Place>);

  for (const name of statusNames) {
    individuals.addStatCollector(stat.count(name, (a) => statusNames[a.status] === name));
  }
  individuals.addStatCollector(stat.count('population'));
  individuals.addStatCollector(
    stat.measure('exposureEndPeriod', (a) => a.exposureEndPeriod, {
      statistics: ['mean', 'min', 'max'],
    }),
  );
  individuals.addStatCollector(
    stat.measure('contactTransmissionProbability', (a) => a.contactTransmissionProbability, {
      statistics: ['mean', 'min', 'max'],
    }),
  );

  const palette = { ...statusColors } as Record<string, number>;
  root.addView(
    gridView<Place, Creature>({
      title: 'City',
      scape: city,
      legend: statusNames.map((name) => ({
        color: statusColors[name],
        label: STATUS_LABELS[name],
        mark: 'agent' as const,
      })),
      occupantColor: (o) => o.color(),
      occupantShape: 'circle',
      background: colors.white,
    }),
  );
  root.addView(
    timeSeriesView({
      title: 'Individuals by status',
      series: [...statusNames],
      colors: palette,
      labels: STATUS_LABELS,
      yMin: 0,
    }),
  );
  root.addView(
    barsView({
      title: 'Individuals by status now',
      series: [...statusNames],
      colors: palette,
      labels: STATUS_LABELS,
    }),
  );
  if (contacts) {
    root.addView(
      networkView<Individual>({
        title: 'Contacts',
        nodes: individuals,
        graph: contacts,
        color: (o) => o.color(),
        legend: statusNames.map((name) => ({
          color: statusColors[name],
          label: STATUS_LABELS[name],
        })),
        layout: 'force',
      }),
    );
  }
  return { city: city.space as Array2D<Place>, individuals };
}
