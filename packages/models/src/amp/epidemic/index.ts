// SPDX-License-Identifier: EPL-2.0
import epidemicSource from '@metascape/spec/examples/escape/Epidemic.model.json';
import contactSource from '@metascape/spec/examples/escape/EpidemicContact.model.json';
import plagueSource from '@metascape/spec/examples/escape/EpidemicPlague.model.json';
import regionalSource from '@metascape/spec/examples/escape/EpidemicRegional.model.json';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../metaabm';

const DESCRIPTION =
  'A simple model of epidemic dynamics. Individual agents have different disease states: susceptible, exposed, infectious (symptomatic or asymptomatic) and then an outcome of recovered or dead. Agents can transmit infection to their immediate neighbors.';

const provenance = (file: string) => ({
  authors: 'Miles Parker',
  portedFrom: `Eclipse AMP, ${file}.metaabm`,
  copyright:
    'Copyright 2009, Miles Parker. Released under Eclipse Public License. All uses should be attributed.',
});

const statusChart = {
  title: 'Individuals by status',
  series: [
    'individual.status.susceptible',
    'individual.status.exposed',
    'individual.status.asymptomInfectious',
    'individual.status.symptomInfectious',
    'individual.status.recovered',
    'individual.status.dead',
  ],
  yMin: 0,
};

export const epidemic = fromMetaabm(epidemicSource, {
  name: 'Epidemic (AMP)',
  description: DESCRIPTION,
  provenance: provenance('Epidemic'),
  charts: [statusChart],
});

export const epidemicContact = fromMetaabm(contactSource, {
  name: 'Epidemic (AMP): Contact',
  description: `${DESCRIPTION} This variant also records a directed network of who infected whom.`,
  provenance: provenance('EpidemicContact'),
  charts: [statusChart],
});

export const epidemicPlague = fromMetaabm(plagueSource, {
  name: 'Epidemic (AMP): Plague',
  description: `${DESCRIPTION} This variant adds stationary rats and fleas that move toward the nearest rat within range; it starts with no individuals.`,
  provenance: provenance('EpidemicPlague'),
  charts: [statusChart],
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
