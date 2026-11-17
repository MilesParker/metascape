// SPDX-License-Identifier: EPL-2.0
import source from '@metascape/spec/examples/escape/DemographicPrisoner_sDilemma.model.json';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../metaabm';

export const demographicPd = fromMetaabm(source, {
  name: "Demographic Prisoner's Dilemma (AMP)",
  description:
    "Players wander a torus of von Neumann neighbours, each playing a one-shot Prisoner's Dilemma with a random neighbour every period; wealthy players have children, poor or old ones die, and strategies are inherited with some mutation.",
  provenance: {
    authors: 'Joshua M. Epstein',
    citation:
      "Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma. Complexity, 4(2), 36-48.",
    portedFrom: 'Eclipse AMP, DemographicPrisoner_sDilemma.metaabm',
    copyright: AMP_COPYRIGHT,
    note: "The model file's acts are what runs; the paper's variants (such as a different neighbourhood or move rule) are not part of this file.",
  },
  charts: [
    {
      title: 'Players and cooperators',
      series: ['player.count', 'player.cooperate'],
      yMin: 0,
    },
    { title: 'Player wealth and age', series: ['player.wealth.mean', 'player.age.mean'] },
  ],
});

/** The Demographic Prisoner's Dilemma of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-demographic-pd',
  name: "Demographic Prisoner's Dilemma (AMP)",
  collection: 'Eclipse AMP example models',
  tags: ['game theory', 'demography'],
  description:
    "Epstein's spatial Prisoner's Dilemma with births and deaths: strategies spread by reproduction, not imitation.",
  models: [demographicPd],
});
