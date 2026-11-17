// SPDX-License-Identifier: EPL-2.0
//
// The Eclipse AMP example models, from their MetaABM originals. Each model is
// the translation of its `.metaabm` file (packages/spec/examples/escape), run
// by the model format's interpreter, with what the catalogue adds to it: the
// name it knows it by, its description and provenance, what to look at (a
// curation) and the run specs AMP gave it.
import type { Model, Provenance } from '@metascape/engine';
import {
  compileModel,
  parseModel,
  type Curation,
  type MethodImplementations,
  type RunSpec,
} from '@metascape/spec';

/** The fallback copyright of AMP example files that state none. */
export const AMP_COPYRIGHT =
  'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License';

export interface CatalogEntry {
  /** The name in the catalogue, from which Studio makes the model's address. */
  readonly name: string;
  /** Default: the model's description. */
  readonly description?: string;
  readonly provenance: Provenance;
  readonly curation?: Curation;
  /** Offered as the model's runs. */
  readonly runSpecs?: readonly RunSpec[];
  /** The implementations of the model's method acts, ported by hand (R21). */
  readonly methods?: MethodImplementations;
}

/** Compiles a translated `.metaabm` model, under the name the catalogue has always given it. */
export function fromMetaabm(source: unknown, entry: CatalogEntry): Model {
  const compiled = compileModel(parseModel(source), {
    ...(entry.curation && { curation: entry.curation }),
    ...(entry.runSpecs && { runSpecs: entry.runSpecs }),
    ...(entry.methods && { methods: entry.methods }),
  });
  return {
    ...compiled,
    name: entry.name,
    ...(entry.description !== undefined && { description: entry.description }),
    provenance: entry.provenance,
  };
}
