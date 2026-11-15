// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model EpidemicContact.metaabm.
// Original: Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, Graph, stat } from '@metascape/engine';
import { epidemicCopyright, epidemicDescription } from './constants';
import type { Individual } from './disease';
import { buildCity, cityParameters } from './single-city';

/**
 * EpidemicContact.metaabm: the Epidemic model plus a directed contact network
 * that records which individual infected which (and, at the start, links each
 * initially exposed individual to every individual exposed at that moment).
 */
export const epidemicContact = defineModel({
  name: 'Epidemic (AMP): Contact',
  description: `${epidemicDescription} This variant also records a directed network of who infected whom.`,
  provenance: {
    authors: 'Miles Parker',
    portedFrom: 'Eclipse AMP, EpidemicContact.metaabm',
    copyright: epidemicCopyright,
  },
  parameters: cityParameters({ individualCount: 1500, initialInfectionProbability: 0.005 }),
  build(root) {
    const contacts = new Graph<Individual>({ directed: true });
    buildCity(root, root.parameters, { contacts });
    root.addStatCollector(stat.value('contacts', () => contacts.edgeCount));
  },
});
