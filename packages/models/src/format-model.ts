// SPDX-License-Identifier: EPL-2.0
//
// Catalogue models written in the model format (`@metascape/spec`), whether
// translated from AMP's `.metaabm` files (packages/spec/examples/escape) or
// written as format models first. Each is run by the format's interpreter (or
// as generated code), with what the catalogue adds to it: the name it knows it
// by, its description and provenance, what to look at (a curation) and its
// run specs. A model file may be an overlay of another, or have agent types
// that extend others; it is resolved into one flat model first.
import type { Model, Provenance } from '@metascape/engine';
import {
  compileModel,
  resolveModel,
  type Model as FormatModel,
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
  /**
   * The files of the models the source builds on, if it is an overlay (or one
   * of its bases is), found by their `id`. Give every file of the chain.
   */
  readonly bases?: readonly unknown[];
}

/** What a catalogue model written in the format was compiled from. */
export interface FormatSource {
  readonly model: FormatModel;
  readonly options: CompileOptions;
}

const sources = new WeakMap<Model, FormatSource>();

/**
 * The format model and compile options a catalogue model was compiled from,
 * if it was written in the format, so that it can be compiled again (the
 * tests run each both interpreted and generated).
 */
export function formatSourceOf(model: Model): FormatSource | undefined {
  return sources.get(model);
}

/**
 * Compiles a model file written in the format (an overlay is resolved against
 * `entry.bases` first), under the name the catalogue gives it. The name is
 * historical: it serves every format model, whatever its origin.
 */
export function fromMetaabm(source: unknown, entry: CatalogEntry): Model {
  const model = resolveModel(source, { bases: entry.bases ?? [] });
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
