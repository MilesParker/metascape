// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';

/**
 * A set of related models: the variants of one published model, or the steps
 * of one tutorial. A model picker lists families grouped by `collection`.
 */
export interface ModelFamily {
  /** Unique, lower-case with dashes, such as `brookings-sugarscape`. */
  readonly id: string;
  /** Short name, such as "Sugarscape". */
  readonly name: string;
  /** Where the family comes from, such as "Brookings Institution models". */
  readonly collection: string;
  /** One or two sentences on what the family shows. */
  readonly description?: string;
  /** The models, simplest first. Every model name is unique across the whole catalogue. */
  readonly models: readonly Model[];
}

/** Declares a family, accepting models with any parameter schema. */
export function defineFamily(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- models differ in their schemas
  family: Omit<ModelFamily, 'models'> & { readonly models: readonly Model<any>[] },
): ModelFamily {
  return family as ModelFamily;
}
