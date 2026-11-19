// SPDX-License-Identifier: EPL-2.0
import type { Curation } from '@metascape/spec';
import { defineFamily } from '../../catalog';
import { fromMetaabm as fromFormat } from '../../format-model';
import source from './Simple.model.json';
import { simple } from './simple';

export { simple, SimpleAgent } from './simple';

/** The coded model's chart: the maximum happiness, which is the subject's. */
const curation: Curation = {
  schemaVersion: 1,
  model: 'simple',
  charts: [
    {
      title: 'Happiness',
      series: [
        {
          measure: 'maximum',
          agent: 'subject',
          attribute: 'happiness',
          label: 'Maximum happiness',
        },
      ],
      yMin: 0,
    },
  ],
};

/**
 * Simple written in the model format, beside the coded port. The subject and the environment are
 * two agent types, and there is no lattice, which stays empty in the coded model.
 */
export const simpleFormat = fromFormat(source, {
  name: 'Simple (format)',
  provenance: {
    ...simple.provenance!,
    note: 'Written in the model format from the coded port. The subject and the environment are two agent types, and the empty lattice is left out.',
  },
  curation,
});

/** The Simple tutorial model of Ascape. */
export const family = defineFamily({
  id: 'brookings-simple',
  name: 'Simple',
  collection: 'Brookings Institution models (from Ascape)',
  tags: ['tutorial'],
  description:
    'The smallest Ascape example: one agent whose happiness doubles every period and an environment that sometimes breaks it.',
  models: [simple, simpleFormat],
});
