// SPDX-License-Identifier: EPL-2.0
//
// The Metascape model format, derived from the MetaABM metamodel (see
// ./types.ts for its provenance), with its checker and core function library.
export { assertValidModel, checkModel } from './check';
export { coreLibrary } from './core-library';
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
