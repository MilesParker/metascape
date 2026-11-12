// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.retirement.PopulationSmallWorld, PersonSmallWorld.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel } from '@metascape/engine';
import { commonParameters } from './population';
import { buildPopulation } from './person';

/** Retirement timing where each person imitates the 24 cells within two steps on the age lattice. */
export const populationSmallWorld = defineModel({
  name: 'Retirement: Small World Population',
  description:
    'The retirement model with fixed lattice neighborhoods instead of random networks: each person imitates the people within two cells on the age-by-cohort lattice, whose ends join up.',
  provenance: {
    authors: 'Robert L. Axtell and Joshua M. Epstein',
    citation:
      'Axtell, R. L., & Epstein, J. M. (1999). Coordination in transient social networks: An agent-based computational model of the timing of retirement. In H. J. Aaron (Ed.), Behavioral Dimensions of Retirement Economics. Brookings Institution Press.',
    portedFrom: 'Ascape 5.6.1, edu.brook.retirement.PopulationSmallWorld',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'The Ascape small-world space has a random edge ratio of 0 here, so the neighborhood is the plain Moore neighborhood of radius 2.',
  },
  parameters: commonParameters,
  build(sim) {
    buildPopulation(sim, sim.parameters, 'moore-radius-2');
  },
});
