// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.retirement.Person, PersonSmallWorld, Population, PopulationSmallWorld.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  barsView,
  Cell,
  colors,
  GridScape,
  gridView,
  histogramView,
  timeSeriesView,
  type Simulation,
} from '@metascape/engine';

/** Strategies of the legacy `Person`. */
export const RATIONAL = 1;
export const IMITATOR = 2;
export const RANDOM = 3;
/** Statuses of the legacy `Person`. */
export const WORKING = -1;
export const RETIRED = -2;
export const DEAD = -3;

export const COHORT_SIZE = 100;
export const YOUNGEST_AGE = 50;
export const OLDEST_AGE = 100;
/** Number of rows: one per age. */
export const AGE_SPAN = OLDEST_AGE - YOUNGEST_AGE + 1;
/** Legacy `maxAgeDifference`, which has a getter but no setter. */
export const MAX_NETWORK_AGE_DIFFERENCE = 5;

/** How a person finds the people it imitates. */
export type NetworkKind = 'random-by-age' | 'moore-radius-2';

/** Settings and the rotating row shared by everybody in one run. */
export interface PopulationState {
  readonly retirementEligibilityAge: number;
  readonly fractionRational: number;
  readonly fractionRandom: number;
  readonly minNetworkSize: number;
  readonly maxNetworkSize: number;
  readonly network: NetworkKind;
  /** The row currently holding the youngest age; it moves up one row per tick. */
  youngestRow: number;
}

/** The age that the row holds, given the row that is currently youngest. */
export function ageForRow(state: PopulationState, row: number): number {
  return row >= state.youngestRow
    ? YOUNGEST_AGE + (row - state.youngestRow)
    : row + (OLDEST_AGE - state.youngestRow) + 1;
}

/**
 * A person of the retirement model, living in a fixed cell of a wrapped grid
 * of age rows. Persons are "reborn" (re-initialized) when they pass the oldest age.
 */
export class Person extends Cell {
  strategy = IMITATOR;
  status = WORKING;
  eligible = false;
  age = 0;
  deathAge = 0;
  network: readonly Person[] = [];
  readonly #state: PopulationState;

  constructor(state: PopulationState) {
    super();
    this.#state = state;
  }

  override initialize(): void {
    const s = this.#state;
    const chance = this.random.float();
    if (chance < s.fractionRational) this.strategy = RATIONAL;
    else if (chance >= 1.0 - s.fractionRandom) this.strategy = RANDOM;
    else this.strategy = IMITATOR;
    this.status = WORKING;
    this.eligible = false;
    this.deathAge = this.random.int(60, 101);
    this.age = ageForRow(s, this.y);
    if (s.network === 'random-by-age') this.#calculateNetwork();
    else if (this.network.length === 0) {
      // Neighbors of the small-world version never change: computed once.
      this.network = (this.grid as GridScape<Person>).within(this, 2, { metric: 'chebyshev' });
    }
    if (this.age >= this.deathAge) this.status = DEAD;
    if (this.age >= s.retirementEligibilityAge) this.eligible = true;
  }

  /** Picks 10 to 25 people (with replacement) from rows within a random age difference. */
  #calculateNetwork(): void {
    const s = this.#state;
    const grid = this.grid as GridScape<Person>;
    const size = this.random.int(s.minNetworkSize, s.maxNetworkSize + 1);
    const r = this.random.int(0, MAX_NETWORK_AGE_DIFFERENCE + 1);
    const network: Person[] = [];
    for (let i = 0; i < size; i++) {
      let other: Person | undefined;
      do {
        const x = this.random.int(0, grid.width);
        const y = this.y - r + this.random.int(0, r * 2 + 1);
        other = grid.at(x, y);
      } while (other === this || other === undefined);
      network.push(other);
    }
    this.network = network;
  }

  /** The legacy `metabolism`. */
  metabolism(): void {
    if (this.age === OLDEST_AGE) {
      this.age = YOUNGEST_AGE;
      this.initialize();
    } else {
      this.age++;
      if (this.age === this.deathAge) this.status = DEAD;
    }
    if (this.age >= this.#state.retirementEligibilityAge) this.eligible = true;
  }

  /** The legacy `iterate`: decide whether to retire. */
  iterate(): void {
    if (!(this.eligible && this.status === WORKING)) return;
    switch (this.strategy) {
      case RATIONAL:
        this.status = RETIRED;
        break;
      case IMITATOR: {
        let poll = 0;
        let sample = 0;
        for (const person of this.network) {
          if (person.status === RETIRED) poll++;
          if (person.eligible && person.status !== DEAD) sample++;
        }
        if (poll !== 0 && poll >= sample / 2) this.status = RETIRED;
        break;
      }
      case RANDOM:
        if (this.random.float() > 0.5) this.status = RETIRED;
        break;
    }
  }
}

/** Colour of a person, following the legacy `Person.getColor`. */
export function personColor(person: Person): number {
  if (person.strategy === RATIONAL) return 0xff00ff;
  if (person.strategy === RANDOM) return colors.yellow;
  switch (person.status) {
    case WORKING:
      return colors.blue;
    case RETIRED:
      return colors.red;
    case DEAD:
      return colors.white;
    default:
      return colors.gray;
  }
}

/** The settings every retirement model shares. */
export interface RetirementParameters {
  readonly retirementEligibilityAge: number;
  readonly fractionRational: number;
  readonly fractionRandom: number;
  readonly minNetworkSize?: number;
  readonly maxNetworkSize?: number;
}

/**
 * Builds the population: a 100 x 51 wrapped grid (cohort by age), the two
 * rules of the legacy scape (metabolism, then iterate), the rotation of the
 * youngest row, data and views.
 */
export function buildPopulation(
  sim: Simulation,
  p: RetirementParameters,
  network: NetworkKind,
): GridScape<Person> {
  if (p.fractionRational + p.fractionRandom > 1.0) {
    throw new Error('Fraction random and fraction rational are greater than 1.0.');
  }
  const minNetworkSize = p.minNetworkSize ?? 10;
  const maxNetworkSize = p.maxNetworkSize ?? 25;
  if (maxNetworkSize < minNetworkSize) {
    throw new Error('Maximum network size must not be less than minimum network size.');
  }
  const state: PopulationState = {
    retirementEligibilityAge: p.retirementEligibilityAge,
    fractionRational: p.fractionRational,
    fractionRandom: p.fractionRandom,
    minNetworkSize,
    maxNetworkSize,
    network,
    youngestRow: 0,
  };
  const grid = sim.addScape(
    new GridScape<Person>({
      name: 'Population',
      width: COHORT_SIZE,
      height: AGE_SPAN,
      wrap: true,
      neighborhood: 'moore',
      // Execution is by rule: metabolism for everyone, then iterate for everyone (see README).
      schedule: 'byRule',
      create: () => new Person(state),
    }),
  );
  grid.addRule('Metabolism', (person) => person.metabolism());
  grid.addRule('Iterate', (person) => person.iterate());

  // Legacy `scapeIterated`: the youngest row moves up by one after every tick.
  sim.observe({
    stepped() {
      state.youngestRow = state.youngestRow > 0 ? state.youngestRow - 1 : grid.height - 1;
    },
  });

  sim.data.count(grid, 'working', (a) => a.status === WORKING);
  sim.data.count(grid, 'retired', (a) => a.status === RETIRED);
  sim.data.count(grid, 'dead', (a) => a.status === DEAD);
  sim.data.count(grid, 'rationalRetired', (a) => a.status === RETIRED && a.strategy === RATIONAL);
  sim.data.count(grid, 'imitatorRetired', (a) => a.status === RETIRED && a.strategy === IMITATOR);
  sim.data.count(grid, 'randomRetired', (a) => a.status === RETIRED && a.strategy === RANDOM);
  sim.data.value('retiredShareOfEligible', () => {
    let eligible = 0;
    let retired = 0;
    for (const a of grid.members) {
      if (a.eligible && a.status !== DEAD) eligible++;
      if (a.status === RETIRED) retired++;
    }
    return eligible === 0 ? 0 : retired / eligible;
  });
  sim.data.distribution(grid, 'retiredByAge', (a) => a.age, {
    bins: AGE_SPAN,
    min: YOUNGEST_AGE,
    max: OLDEST_AGE + 1,
    when: (a) => a.status === RETIRED,
  });

  sim.addView(
    gridView<Person>({
      title: 'Population (rows are ages; the youngest row moves up each tick)',
      grid,
      cellColor: personColor,
    }),
  );
  const series = {
    working: colors.blue,
    retired: colors.red,
    dead: colors.gray,
  };
  sim.addView(
    timeSeriesView({
      title: 'Working, retired and dead',
      series: ['working', 'retired', 'dead'],
      colors: series,
      yMin: 0,
    }),
  );
  sim.addView(
    timeSeriesView({
      title: 'Retired share of eligible',
      series: ['retiredShareOfEligible'],
      yMin: 0,
      yMax: 1,
    }),
  );
  sim.addView(
    barsView({
      title: 'Retired, by strategy',
      series: ['rationalRetired', 'imitatorRetired', 'randomRetired'],
      colors: {
        rationalRetired: 0xff00ff,
        imitatorRetired: colors.red,
        randomRetired: colors.yellow,
      },
    }),
  );
  sim.addView(histogramView({ title: 'Ages of the retired', distribution: 'retiredByAge' }));
  return grid;
}
