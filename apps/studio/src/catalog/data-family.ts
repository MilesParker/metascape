// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import type { Curation } from '@metascape/models/curation';
import { slug } from './slug';

export const DATA_FAMILY_ID = 'metascape-data';

/** The family of models written purely as data, compiled on demand. */
export const DATA_FAMILY = {
  id: DATA_FAMILY_ID,
  name: 'Written as data',
  collection: 'Metascape examples',
  description: 'Models defined in the declarative model format, with no model code.',
  tags: ['model format'],
} as const;

/** What to look at in each example, by its key in the examples of `@metascape/spec`. */
export const DATA_CURATION: Readonly<Record<string, Curation>> = {
  life: { charts: [{ title: 'Live cells', series: ['cell.on'], yMin: 0 }] },
  schelling: {
    charts: [
      { title: 'Happy residents', series: ['resident.happy', 'resident.count'], yMin: 0 },
      { title: 'Similar neighbours', series: ['resident.similar.mean'], yMin: 0 },
      { title: 'Groups', series: ['resident.group.red', 'resident.group.blue'], yMin: 0 },
    ],
  },
  forager: {
    charts: [
      { title: 'Foragers', series: ['forager.count'], yMin: 0 },
      { title: 'Energy', series: ['forager.energy.mean', 'forager.energy.max'] },
      { title: 'Food', series: ['patch.food.mean'], yMin: 0 },
      { title: 'Age', series: ['forager.age.mean', 'forager.age.max'] },
    ],
  },
};

/** The id of an example's model in the catalogue. */
export const dataModelId = (key: string): string => `data-${slug(key)}`;

/** The data-defined models, keyed by model id. */
export async function dataModels(): Promise<ReadonlyMap<string, Model>> {
  const [{ examples }, { compileCurated }] = await Promise.all([
    import('@metascape/spec'),
    import('@metascape/models/curation'),
  ]);
  return new Map(
    Object.entries(examples).map(([key, model]) => [
      dataModelId(key),
      compileCurated(model, DATA_CURATION[key]),
    ]),
  );
}
