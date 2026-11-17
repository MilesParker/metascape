// SPDX-License-Identifier: EPL-2.0
//
// The Metascape model format, derived from the MetaABM metamodel (see
// ./metamodel/types.ts for its provenance): its schema, checker, core function
// library and interpreter, and example models written in it; and beside it,
// run specs, run tests and curation (./runspec, ./curation). The translation
// from AMP's `.metaabm`, `.apar` and `.atest` files is `@metascape/spec/metaabm`.
export * from './metamodel';
export * from './runspec';
export {
  exampleRuns,
  examples,
  forager,
  foragerRun,
  life,
  schelling,
  schellingRun,
  stupidModel1,
} from './metamodel/examples';
