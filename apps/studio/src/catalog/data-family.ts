// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import type { Curation, Measurement } from '@metascape/spec';
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

const count = (agent: string, attribute?: string, qualifier?: string): Measurement => ({
  measure: 'count',
  agent,
  ...(attribute !== undefined && { attribute }),
  ...(qualifier !== undefined && { qualifier }),
});
const of = (measure: Measurement['measure'], agent: string, attribute: string): Measurement => ({
  measure,
  agent,
  attribute,
});

/** What to look at in each example, by its key in the examples of `@metascape/spec`. */
export const DATA_CURATION: Readonly<Record<string, Curation>> = {
  life: {
    schemaVersion: 1,
    model: 'life',
    charts: [{ title: 'Live cells', series: [count('cell', 'on')], yMin: 0 }],
  },
  schelling: {
    schemaVersion: 1,
    model: 'schelling',
    charts: [
      {
        title: 'Happy residents',
        series: [count('resident', 'happy'), count('resident')],
        yMin: 0,
      },
      { title: 'Similar neighbours', series: [of('average', 'resident', 'similar')], yMin: 0 },
      {
        title: 'Groups',
        series: [count('resident', 'group', 'red'), count('resident', 'group', 'blue')],
        yMin: 0,
      },
    ],
  },
  forager: {
    schemaVersion: 1,
    model: 'foragers',
    charts: [
      { title: 'Foragers', series: [count('forager')], yMin: 0 },
      {
        title: 'Energy',
        series: [of('average', 'forager', 'energy'), of('maximum', 'forager', 'energy')],
      },
      { title: 'Food', series: [of('average', 'patch', 'food')], yMin: 0 },
      { title: 'Age', series: [of('average', 'forager', 'age'), of('maximum', 'forager', 'age')] },
    ],
  },
};

/** The id of an example's model in the catalogue. */
export const dataModelId = (key: string): string => `data-${slug(key)}`;

/** An example compiled with what to look at, and the run spec it runs by. */
export function compileExample(spec: typeof import('@metascape/spec'), key: string): Model {
  const curation = DATA_CURATION[key];
  const runSpec = spec.exampleRuns[key];
  return spec.compileModel(spec.examples[key]!, {
    ...(curation && { curation }),
    ...(runSpec && { runSpec }),
  });
}

/** The data-defined models, keyed by model id. */
export async function dataModels(): Promise<ReadonlyMap<string, Model>> {
  const spec = await import('@metascape/spec');
  return new Map(
    Object.keys(spec.examples).map((key) => [dataModelId(key), compileExample(spec, key)]),
  );
}
