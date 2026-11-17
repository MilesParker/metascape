// SPDX-License-Identifier: EPL-2.0
//
// The translation from MetaABM `.metaabm` files (EMF XMI) to the Metascape
// model format.
export { translateMetaabm } from './translate';
export type {
  ProvidedMethods,
  TranslateOptions,
  Translation,
  TranslationDiagnostic,
  TranslationKind,
} from './translate';
export {
  runFileId,
  translateApar,
  translateAtest,
  type AparOptions,
  type AtestOptions,
  type ModelResolver,
  type RunFileTranslation,
} from './apar';
