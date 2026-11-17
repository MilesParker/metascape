// SPDX-License-Identifier: EPL-2.0
//
// The Eclipse AMP example models, from their MetaABM originals. Each model is
// the translation of its `.metaabm` file (packages/spec/examples/escape), run
// by the model format's interpreter, with what the catalogue adds to it.
import type { Model, Provenance } from '@metascape/engine';
import { compileCurated, type Curation } from '../curation';

/** The fallback copyright of AMP example files that state none. */
export const AMP_COPYRIGHT =
  'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License';

/** Compiles a translated `.metaabm` model, under the name the catalogue has always given it. */
export function fromMetaabm(
  source: unknown,
  curation: Curation & { readonly name: string; readonly provenance: Provenance },
): Model {
  return compileCurated(source, curation);
}
