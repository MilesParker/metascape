// SPDX-License-Identifier: EPL-2.0
import stupidModel1Source from '@metascape/spec/examples/escape/StupidModel1.model.json';
import stupidModel2Source from '@metascape/spec/examples/escape/StupidModel2.model.json';
import stupidModel3Source from '@metascape/spec/examples/escape/StupidModel3.model.json';
import stupidModel5Source from '@metascape/spec/examples/escape/StupidModel5.model.json';
import type { Provenance } from '@metascape/engine';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../metaabm';

const provenance = (file: string): Provenance => ({
  authors: 'Steven F. Railsback, Steven L. Lytinen and Volker Grimm',
  citation:
    'Railsback, S. F., Lytinen, S. L., & Grimm, V. (2005). StupidModel and extensions: A template and teaching tool for agent-based modeling platforms.',
  portedFrom: `Eclipse AMP, ${file}.metaabm`,
  copyright: AMP_COPYRIGHT,
});

const sizeChart = { title: 'Bug size', series: ['bug.size.mean', 'bug.size.max'], yMin: 0 };
const foodChart = {
  title: 'Food per habitat',
  series: ['habitat.foodAvailability.mean'],
  yMin: 0,
};

export const stupidModel1 = fromMetaabm(stupidModel1Source, {
  name: 'StupidModel 1',
  description:
    'Bugs move to a random free cell within their vision on a periodic Moore grid, nothing else.',
  provenance: provenance('StupidModel1'),
});

export const stupidModel2 = fromMetaabm(stupidModel2Source, {
  name: 'StupidModel 2',
  description:
    'Bugs move as in StupidModel 1 and also grow by one each period; their colour fades from white to red with size.',
  provenance: provenance('StupidModel2'),
  gather: ['bug.size'],
  charts: [sizeChart],
});

export const stupidModel3 = fromMetaabm(stupidModel3Source, {
  name: 'StupidModel 3',
  description:
    'As StupidModel 2, and every habitat also accumulates food by a draw in [0, 0.01) per period. Bugs neither eat nor look for food.',
  provenance: provenance('StupidModel3'),
  gather: ['bug.size', 'habitat.foodAvailability'],
  charts: [sizeChart, foodChart],
});

export const stupidModel5 = fromMetaabm(stupidModel5Source, {
  name: 'StupidModel 5',
  description:
    'Habitats accumulate food by a draw in [0, 0.5) per period and each bug, after moving, eats up to 0.2 of the food on its cell and grows by that amount.',
  provenance: {
    ...provenance('StupidModel5'),
    note: 'The food consumption is a method written in Java in the original; it is ported by hand to TypeScript (StupidModel5.ports.ts).',
  },
  gather: ['bug.size', 'habitat.foodAvailability'],
  charts: [sizeChart, foodChart],
});

/** The StupidModel steps 1, 2, 3 and 5 as defined in the Eclipse AMP examples. */
export const family = defineFamily({
  id: 'amp-stupid-model',
  name: 'StupidModel',
  collection: 'Eclipse AMP example models',
  tags: ['tutorial', 'ecology'],
  path: 'tutorial',
  description:
    'Steps 1, 2, 3 and 5 of the StupidModel teaching series: bugs wander a grid, then grow, then live on habitats that produce food.',
  models: [stupidModel1, stupidModel2, stupidModel3, stupidModel5],
});
