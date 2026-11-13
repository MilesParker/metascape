// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
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

/** The data-defined models, keyed by model id. */
export async function dataModels(): Promise<ReadonlyMap<string, Model>> {
  const { compileModel, exampleSpecs } = await import('@metascape/spec');
  return new Map(
    Object.entries(exampleSpecs).map(([key, spec]) => [`data-${slug(key)}`, compileModel(spec)]),
  );
}
