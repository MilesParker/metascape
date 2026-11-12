// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Epidemic.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { int, real } from '@metascape/engine';

/** The three states-and-durations parameters the epidemic variants share, with the Epidemic.metaabm texts. */
export function transmissionParameters(initialInfectionProbability: number) {
  return {
    initialInfectionProbability: real(initialInfectionProbability, {
      min: 0,
      max: 1,
      label: 'Initial Infection Probability',
      description:
        'The probability that any given individual will be infected at the beginning of the model run. For example, if this value is .15, and there are 100 individuals in the model, roughly 15 of those individuals will be infected at time 0.',
    }),
    minContactTransmissionProbability: real(0.08, {
      min: 0,
      max: 1,
      label: 'Min Contact Transmission Probability',
      description:
        'The minimum probability that proximity to a single neighbor for a single period will result in transmission of infection. Each individual is assigned a contact transmission probability between the minimum and maximum value at the start of a run. Must be between 0.0 and 1.0 and at most the maximum.',
    }),
    maxContactTransmissionProbability: real(0.16, {
      min: 0,
      max: 1,
      label: 'Max Contact Transmission Probability',
      description:
        'The maximum probability that proximity to a single neighbor for a single period will result in transmission of infection. Must be between 0.0 and 1.0 and at least the minimum.',
    }),
    caseMortalityRate: real(0.05, {
      min: 0,
      max: 1,
      label: 'Case Mortality Rate',
      description:
        'The probability that death will occur for a given individual as a result of infection.',
    }),
  } as const;
}

/** Exposure and infection durations with the defaults of the single-city models. */
export function durationParameters(
  exposure: readonly [number, number] = [24, 72],
  asymptomatic: readonly [number, number] = [24, 96],
  symptomatic: readonly [number, number] = [24, 168],
) {
  return {
    minPeriodExposure: int(exposure[0], {
      min: 0,
      max: 1000,
      label: 'Min Period Exposure',
      description:
        'The minimum amount of time from initial exposure to infectious asymptomatic or symptomatic state. 0 or greater.',
    }),
    maxPeriodExposure: int(exposure[1], {
      min: 0,
      max: 1000,
      label: 'Max Period Exposure',
      description:
        'Maximum time from initial exposure to infectious asymptomatic or symptomatic state. 0 or greater.',
    }),
    minPeriodAsymptomInfection: int(asymptomatic[0], {
      min: 0,
      max: 1000,
      label: 'Min Period Asymptom Infection',
      description: 'Minimum time spent infected without showing symptoms. 0 or greater.',
    }),
    maxPeriodAsymptomInfection: int(asymptomatic[1], {
      min: 0,
      max: 1000,
      label: 'Max Period Asymptom Infection',
      description: 'Maximum time spent infected without showing symptoms. May be zero.',
    }),
    minPeriodSymptomInfection: int(symptomatic[0], {
      min: 0,
      max: 1000,
      label: 'Min Period Symptom Infection',
      description: 'Minimum time spent infected with obvious symptoms. 0 or greater.',
    }),
    maxPeriodSymptomInfection: int(symptomatic[1], {
      min: 1,
      max: 1000,
      label: 'Max Period Symptom Infection',
      description: 'Maximum time spent infected with obvious symptoms. 1 or greater.',
    }),
  } as const;
}

/** Movement probability, shared by every variant. */
export function movementParameter() {
  return {
    movementProbability: real(0.5, {
      min: 0,
      max: 1,
      label: 'Movement Probability',
      description:
        'The chance that an agent will move within a given period. May be any value between 0.0 and 1.0.',
    }),
  } as const;
}
