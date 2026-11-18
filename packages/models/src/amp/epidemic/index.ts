// SPDX-License-Identifier: EPL-2.0
import epidemicSource from '@metascape/spec/examples/escape/Epidemic.model.json';
import contactSource from '@metascape/spec/examples/escape/EpidemicContact.model.json';
import plagueSource from '@metascape/spec/examples/escape/EpidemicPlague.model.json';
import regionalSource from '@metascape/spec/examples/escape/EpidemicRegional.model.json';
import base from '@metascape/spec/examples/escape/params/EpiBase.run.json';
import high from '@metascape/spec/examples/escape/params/EpiHighTransmission.run.json';
import low from '@metascape/spec/examples/escape/params/EpiLowTransmission.run.json';
import zero from '@metascape/spec/examples/escape/params/EpiZeroTransmission.run.json';
import regional from '@metascape/spec/examples/escape/params/EpidemicRegional.run.json';
import { parseRunSpec, type Curation, type RunSpec } from '@metascape/spec';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../../format-model';

const DESCRIPTION =
  'A simple model of epidemic dynamics. Individual agents have different disease states: susceptible, exposed, infectious (symptomatic or asymptomatic) and then an outcome of recovered or dead. Agents can transmit infection to their immediate neighbors.';

const provenance = (file: string) => ({
  authors: 'Miles Parker',
  portedFrom: `Eclipse AMP, ${file}.metaabm`,
  copyright:
    'Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.',
});

/** The individuals of each status. */
const curation: Curation = {
  schemaVersion: 1,
  model: 'epidemic',
  charts: [
    {
      title: 'Individuals by status',
      series: [
        'susceptible',
        'exposed',
        'asymptomInfectious',
        'symptomInfectious',
        'recovered',
        'dead',
      ].map((status) => ({
        measure: 'count' as const,
        agent: 'individual',
        attribute: 'status',
        qualifier: status,
      })),
      yMin: 0,
    },
  ],
};

/** AMP's run specs of the Epidemic model (params/*.apar), under the names Studio shows. */
const runSpecs: RunSpec[] = [
  { ...parseRunSpec(base), label: 'Base' },
  { ...parseRunSpec(low), label: 'Low transmission' },
  { ...parseRunSpec(high), label: 'High transmission' },
  { ...parseRunSpec(zero), label: 'Zero transmission' },
];

export const epidemic = fromMetaabm(epidemicSource, {
  name: 'Epidemic (AMP)',
  description: DESCRIPTION,
  provenance: provenance('Epidemic'),
  curation,
  runSpecs,
});

export const epidemicContact = fromMetaabm(contactSource, {
  name: 'Epidemic (AMP): Contact',
  description: `${DESCRIPTION} This variant also records a directed network of who infected whom.`,
  provenance: provenance('EpidemicContact'),
  curation,
});

export const epidemicPlague = fromMetaabm(plagueSource, {
  name: 'Epidemic (AMP): Plague',
  description: `${DESCRIPTION} This variant adds stationary rats and fleas that move toward the nearest rat within range; it starts with no individuals.`,
  provenance: provenance('EpidemicPlague'),
  curation,
});

export const epidemicRegional = fromMetaabm(regionalSource, {
  name: 'Epidemic (AMP): Regional',
  description:
    'Several cities, each a bounded grid of individuals running the Epidemic disease model, stand on a wrapped regional map. Individuals occasionally migrate to a neighbouring city; one city is chosen at random as the origin of the infection.',
  provenance: {
    authors: 'Miles Parker',
    portedFrom: 'Eclipse AMP, EpidemicRegional.metaabm',
    copyright: AMP_COPYRIGHT,
    note: 'The AMP model has no description or attribution statement; the authors are taken from the other Epidemic models of the same project.',
  },
  runSpecs: [{ ...parseRunSpec(regional), label: 'Regional' }],
});

/** The Eclipse AMP Epidemic models. */
export const family = defineFamily({
  id: 'amp-epidemic',
  name: 'Epidemic (AMP)',
  collection: 'Eclipse AMP example models',
  tags: ['epidemics'],
  description:
    'Epidemic spread through individuals on a grid, with variants that record contacts, add rats and fleas, or link several cities by migration.',
  models: [epidemic, epidemicContact, epidemicPlague, epidemicRegional],
});
