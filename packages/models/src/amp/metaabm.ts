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
  type CompileOptions,
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

/** What a catalogue model written in the format was compiled from. */
export interface FormatSource {
  readonly model: FormatModel;
  readonly options: CompileOptions;
}

type FormatModel = ReturnType<typeof parseModel>;

const sources = new WeakMap<Model, FormatSource>();

/**
 * The format model and compile options a catalogue model was compiled from,
 * if it was written in the format, so that it can be compiled again (the
 * tests run each both interpreted and generated).
 */
export function formatSourceOf(model: Model): FormatSource | undefined {
  return sources.get(model);
}

/** Compiles a translated `.metaabm` model, under the name the catalogue has always given it. */
export function fromMetaabm(source: unknown, entry: CatalogEntry): Model {
  const model = parseModel(source);
  const options: CompileOptions = {
    ...(entry.curation && { curation: entry.curation }),
    ...(entry.runSpecs && { runSpecs: entry.runSpecs }),
    ...(entry.methods && { methods: entry.methods }),
  };
  const compiled = compileModel(model, options);
  const result: Model = {
    ...compiled,
    name: entry.name,
    ...(entry.description !== undefined && { description: entry.description }),
    provenance: entry.provenance,
  };
  sources.set(result, { model, options });
  return result;
}
