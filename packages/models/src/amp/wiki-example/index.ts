// SPDX-License-Identifier: EPL-2.0
import source from '@metascape/spec/examples/escape/WikiExample.model.json';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../../format-model';

export const wikiExample = fromMetaabm(source, {
  name: 'Wiki Example',
  description:
    'Individuals of random ages scattered over a bounded city grid each period move next to a randomly chosen individual of the same age within their vision, so same-aged individuals gradually cluster together.',
  provenance: {
    portedFrom: 'Eclipse AMP, WikiExample.metaabm',
    copyright: AMP_COPYRIGHT,
    note: 'The sources name no author or publication for this model.',
  },
});

/** The Wiki example of the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-wiki-example',
  name: 'Wiki Example',
  collection: 'Eclipse AMP example models',
  tags: ['tutorial'],
  description:
    'Individuals of different ages on a city grid seek out others of their own age and settle beside them.',
  models: [wikiExample],
});
