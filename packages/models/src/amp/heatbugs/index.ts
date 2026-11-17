// SPDX-License-Identifier: EPL-2.0
import source from '@metascape/spec/examples/escape/Heatbugs.model.json';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../metaabm';

export const heatbugs = fromMetaabm(source, {
  name: 'Heatbugs (AMP)',
  description:
    'Heat bugs radiate heat into the cell they stand on and move to a neighbouring cell that brings them toward their own ideal temperature, while heat diffuses and evaporates over a bounded grid.',
  provenance: {
    portedFrom: 'Eclipse AMP, Heatbugs.metaabm',
    copyright: AMP_COPYRIGHT,
    note: 'The sources name no author or publication for this model.',
  },
  gather: ['heatCell.heat'],
  charts: [
    {
      title: 'Heat bug unhappiness',
      series: ['heatBug.unhappiness.mean', 'heatBug.unhappiness.min', 'heatBug.unhappiness.max'],
    },
    { title: 'Heat', series: ['heatCell.heat.mean', 'heatCell.heat.max'] },
  ],
});

/** The Heatbugs example of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-heatbugs',
  name: 'Heatbugs (AMP)',
  collection: 'Eclipse AMP example models',
  tags: ['ecology'],
  description:
    'Bugs that warm their surroundings and seek a preferred temperature on a heat-diffusing grid.',
  models: [heatbugs],
});
