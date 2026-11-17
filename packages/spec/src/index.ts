// SPDX-License-Identifier: EPL-2.0
//
// The Metascape model format, derived from the MetaABM metamodel (see
// ./metamodel/types.ts for its provenance): its schema, checker, core function
// library and interpreter, and example models written in it. The translation
// from `.metaabm` files is `@metascape/spec/metaabm`.
export * from './metamodel';
export { examples, forager, life, schelling, stupidModel1 } from './metamodel/examples';
