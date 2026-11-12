// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Epidemic.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { colors, Occupant, type Color } from '@metascape/engine';

/**
 * Disease states of an {@link Individual}, numbered as the options of the
 * `status` attribute in the AMP model (susceptible first).
 */
export const Status = {
  susceptible: 0,
  exposed: 1,
  asymptomInfectious: 2,
  symptomInfectious: 3,
  recovered: 4,
  dead: 5,
} as const;
export type Status = (typeof Status)[keyof typeof Status];

/** Display names of the states, indexed by {@link Status}. */
export const statusNames = [
  'susceptible',
  'exposed',
  'asymptomInfectious',
  'symptomInfectious',
  'recovered',
  'dead',
] as const;

/**
 * Colours of the AMP `Individual` style: blue susceptible, yellow exposed,
 * orange asymptomatic infectious, red symptomatic infectious, green
 * recovered, black dead.
 */
export const statusColors: Readonly<Record<(typeof statusNames)[number], Color>> = {
  susceptible: colors.blue,
  exposed: colors.yellow,
  asymptomInfectious: colors.orange,
  symptomInfectious: colors.red,
  recovered: colors.green,
  dead: colors.black,
};

/** The disease parameters every epidemic variant shares. */
export interface DiseaseParameters {
  readonly initialInfectionProbability: number;
  readonly minContactTransmissionProbability: number;
  readonly maxContactTransmissionProbability: number;
  readonly caseMortalityRate: number;
  readonly minPeriodExposure: number;
  readonly maxPeriodExposure: number;
  readonly minPeriodAsymptomInfection: number;
  readonly maxPeriodAsymptomInfection: number;
  readonly minPeriodSymptomInfection: number;
  readonly maxPeriodSymptomInfection: number;
  readonly movementProbability: number;
}

/** What an individual needs from its model: the parameters and the current period. */
export interface Epidemiology {
  readonly parameters: DiseaseParameters;
  /** The current period (`timeNow` in the AMP model). */
  period(): number;
}

/** A creature that stands on a grid and can be drawn. */
export class Creature extends Occupant {
  /** Colour in the overhead view. */
  color(): Color {
    return colors.gray;
  }
}

/** A uniformly chosen integer in `[low, high]`, as Ascape's `randomInRange(int, int)`. */
export function randomIntInRange(
  random: { int(min: number, max: number): number },
  low: number,
  high: number,
): number {
  return random.int(low, high + 1);
}

/**
 * One person with the AMP `Individual` attributes and rules: movement,
 * transmission, progression and the `exposure` watch on `status`.
 */
export class Individual extends Creature {
  #status: Status = Status.susceptible;
  exposureEndPeriod = 0;
  asymptomaticEndPeriod = 0;
  outcomePeriod = 0;
  contactTransmissionProbability = 0;

  constructor(protected readonly epi: Epidemiology) {
    super();
  }

  get status(): Status {
    return this.#status;
  }

  /**
   * Sets the status. As in the AMP `Watch` act on `status`, every change runs
   * the exposure rule: if the new status is exposed, the end of exposure, of
   * the asymptomatic period and of the infection are drawn.
   */
  setStatus(status: Status): void {
    this.#status = status;
    if (status !== Status.exposed) return;
    const p = this.epi.parameters;
    const now = this.epi.period();
    const endExposure =
      now + randomIntInRange(this.random, p.minPeriodExposure, p.maxPeriodExposure);
    this.exposureEndPeriod = endExposure;
    const endAsymptomatic =
      endExposure +
      randomIntInRange(this.random, p.minPeriodAsymptomInfection, p.maxPeriodAsymptomInfection);
    this.asymptomaticEndPeriod = endAsymptomatic;
    this.outcomePeriod =
      endAsymptomatic +
      randomIntInRange(this.random, p.minPeriodSymptomInfection, p.maxPeriodSymptomInfection);
  }

  /** Copies the disease state of another individual (used when an individual changes scape). */
  copyStateFrom(other: Individual): void {
    this.#status = other.#status;
    this.exposureEndPeriod = other.exposureEndPeriod;
    this.asymptomaticEndPeriod = other.asymptomaticEndPeriod;
    this.outcomePeriod = other.outcomePeriod;
    this.contactTransmissionProbability = other.contactTransmissionProbability;
  }

  override color(): Color {
    return statusColors[statusNames[this.#status]];
  }

  /** Whether this individual is currently infectious (asymptomatic or symptomatic). */
  get infectious(): boolean {
    return this.#status === Status.symptomInfectious || this.#status === Status.asymptomInfectious;
  }

  /** Initialize State: maybe start infected, and draw the personal transmission probability. */
  initializeState(): void {
    const p = this.epi.parameters;
    const infectionDraw = this.random.float();
    const rate =
      this.random.float() *
        (p.maxContactTransmissionProbability - p.minContactTransmissionProbability) +
      p.minContactTransmissionProbability;
    if (infectionDraw < p.initialInfectionProbability) this.setStatus(Status.exposed);
    this.contactTransmissionProbability = rate;
  }

  /** Movement rule: unless dead or symptomatic, move to a random free neighbouring cell. */
  movement(): void {
    const p = this.epi.parameters;
    const draw = this.random.float();
    if (
      this.#status !== Status.dead &&
      draw < p.movementProbability &&
      this.#status !== Status.symptomInfectious
    ) {
      this.moveToRandomAvailableNeighbor();
    }
  }

  /**
   * Transmission rule: an infectious individual picks one random neighbouring
   * individual; if that one is susceptible, it is infected with the
   * neighbour's own contact transmission probability. Returns the newly
   * exposed individual, if any.
   */
  transmission(): Individual | undefined {
    if (!this.infectious) return undefined;
    const neighbors = this.neighboringOccupants().filter(
      (other): other is Individual => other instanceof Individual,
    );
    if (neighbors.length === 0) return undefined;
    const target = this.random.pick(neighbors);
    if (target.#status !== Status.susceptible) return undefined;
    if (this.random.float() < target.contactTransmissionProbability) {
      target.setStatus(Status.exposed);
      return target;
    }
    return undefined;
  }

  /** Called when the asymptomatic period ends and symptoms appear. */
  protected symptomsObserved(): void {}

  /**
   * Progression rule, with its four conditions in the order of the AMP model.
   * Periods are compared for equality, as in the original.
   */
  progression(): void {
    const now = this.epi.period();
    const p = this.epi.parameters;
    if (this.exposureEndPeriod !== this.asymptomaticEndPeriod && now === this.exposureEndPeriod) {
      this.setStatus(Status.asymptomInfectious);
    }
    if (now === this.outcomePeriod) {
      const draw = this.random.float();
      if (draw < p.caseMortalityRate) this.setStatus(Status.dead);
      if (!(draw < p.caseMortalityRate)) this.setStatus(Status.recovered);
    }
    if (now === this.exposureEndPeriod && this.exposureEndPeriod === this.asymptomaticEndPeriod) {
      this.setStatus(Status.symptomInfectious);
    }
    if (
      now === this.asymptomaticEndPeriod &&
      this.exposureEndPeriod !== this.asymptomaticEndPeriod
    ) {
      this.setStatus(Status.symptomInfectious);
      this.symptomsObserved();
    }
  }
}
