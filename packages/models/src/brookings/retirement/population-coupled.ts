// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.retirement.PopulationCoupled, PersonCoupled.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel } from '@metascape/engine';
import { networkParameters } from './population';
import { buildPopulation } from './person';

/**
 * The coupled-subpopulations variant. In the legacy code `Population.createScape`
 * replaces the `PersonCoupled` prototype by a plain `Person`, so this class
 * behaves exactly as `Population` (see the README).
 */
export const populationCoupled = defineModel({
  name: 'Retirement: Coupled Populations',
  description:
    'The coupled-subpopulations variant of the retirement model, in which two halves of the cohort would be linked by a fraction of cross-network ties. As in the Ascape sources, the coupling is never in effect and the model behaves as the plain population.',
  provenance: {
    authors: 'Robert L. Axtell and Joshua M. Epstein',
    citation:
      'Axtell, R. L., & Epstein, J. M. (1999). Coordination in transient social networks: An agent-based computational model of the timing of retirement. In H. J. Aaron (Ed.), Behavioral Dimensions of Retirement Economics. Brookings Institution Press.',
    portedFrom: 'Ascape 5.6.1, edu.brook.retirement.PopulationCoupled',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'The legacy coupling code is dead (its person class is replaced when the scape is created, and it would fail if it ran), so the behaviour ported is that of Population. The legacy fractionCoupled property therefore has no effect and is not a parameter.',
  },
  parameters: networkParameters,
  build(sim) {
    buildPopulation(sim, sim.parameters, 'random-by-age');
  },
});
