// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import { familyLoaders } from '@metascape/models/loaders';
import { DATA_FAMILY_ID, dataModels } from './data-family';
import { slug } from './slug';

/** Loads the models of one family, keyed by model id. */
export async function loadFamily(familyId: string): Promise<ReadonlyMap<string, Model>> {
  if (familyId === DATA_FAMILY_ID) return dataModels();
  const load = familyLoaders[familyId];
  if (!load) throw new Error(`Unknown family "${familyId}"`);
  const family = await load();
  return new Map(family.models.map((model) => [slug(model.name), model]));
}
