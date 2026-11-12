// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.retirement.Population, Person.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, int, real } from '@metascape/engine';
import { buildPopulation } from './person';

const AUTHORS = 'Robert L. Axtell and Joshua M. Epstein';
const CITATION =
  'Axtell, R. L., & Epstein, J. M. (1999). Coordination in transient social networks: An agent-based computational model of the timing of retirement. In H. J. Aaron (Ed.), Behavioral Dimensions of Retirement Economics. Brookings Institution Press.';
const COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

/** Parameters shared by all three retirement models. */
export const commonParameters = {
  retirementEligibilityAge: int(65, {
    min: 50,
    max: 100,
    label: 'Retirement eligibility age',
    description: 'Persons may retire from this age on.',
  }),
  fractionRational: real(0.1, {
    min: 0,
    max: 1,
    label: 'Fraction rational',
    description: 'Share of persons who retire as soon as they are eligible.',
  }),
  fractionRandom: real(0.05, {
    min: 0,
    max: 1,
    label: 'Fraction random',
    description: 'Share of persons who, once eligible, retire with probability one half each year.',
  }),
} as const;

/** The parameters of the models with random social networks. */
export const networkParameters = {
  minNetworkSize: int(10, {
    min: 1,
    max: 100,
    label: 'Minimum network size',
    description: 'Smallest number of people in a person’s social network.',
  }),
  maxNetworkSize: int(25, {
    min: 1,
    max: 100,
    label: 'Maximum network size',
    description: 'Largest number of people in a person’s social network.',
  }),
  ...commonParameters,
} as const;

/** Retirement timing with random, age-local social networks. */
export const population = defineModel({
  name: 'Retirement: Population',
  description:
    'Agents decide when to retire: a few are rational and retire as soon as they are eligible, a few retire at random, and most imitate, retiring once at least half of the eligible people in their social network have retired. Networks are redrawn at each rebirth from people of a similar age.',
  provenance: {
    authors: AUTHORS,
    citation: CITATION,
    portedFrom: 'Ascape 5.6.1, edu.brook.retirement.Population',
    copyright: COPYRIGHT,
    note: 'Implemented in Java by Miles Parker from a C++ model by Robert Axtell. Execution is by rule, as in the legacy model.',
  },
  parameters: networkParameters,
  build(sim) {
    buildPopulation(sim, sim.parameters, 'random-by-age');
  },
});
