// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Epidemic.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel } from '@metascape/engine';
import { epidemicCopyright, epidemicDescription } from './constants';
import { buildCity, cityParameters } from './single-city';

/** Epidemic.metaabm: individuals moving and infecting each other on a bounded city grid. */
export const epidemic = defineModel({
  name: 'Epidemic (AMP)',
  description: epidemicDescription,
  provenance: {
    authors: 'Miles Parker',
    portedFrom: 'Eclipse AMP, Epidemic.metaabm',
    copyright: epidemicCopyright,
  },
  parameters: cityParameters({ individualCount: 1500, initialInfectionProbability: 0.05 }),
  build(sim) {
    buildCity(sim, sim.parameters);
  },
});
