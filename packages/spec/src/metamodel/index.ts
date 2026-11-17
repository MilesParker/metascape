// SPDX-License-Identifier: EPL-2.0
//
// The Metascape model format, derived from the MetaABM metamodel (see
// ./types.ts for its provenance), with its checker and core function library.
export { assertValidModel, checkModel } from './check';
export { coreLibrary } from './core-library';
export {
  coreFunctions,
  StyleAccumulator,
  type Argument,
  type Call,
  type CallContext,
  type CallInfo,
  type Datum,
  type FunctionImplementation,
  type InputInfo,
  type Mark,
  type Shape,
  type SpatialTerm,
  type ValueType,
} from './functions';
export { compileModel, styleOf, type CompileOptions } from './interpreter';
export type {
  MethodAgent,
  MethodImplementation,
  MethodImplementations,
  MethodRandom,
  MethodScape,
} from './method';
export { MethodCodeError, UnsupportedModelError } from './model-index';
export { MAX_TRIGGER_DEPTH } from './runtime';
export {
  formatPath,
  librarySchema,
  ModelFormatError,
  modelJsonSchema,
  modelSchema,
  parseLibrary,
  parseModel,
} from './schema';
export * from './types';
