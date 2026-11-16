// SPDX-License-Identifier: EPL-2.0
//
// The files written beside each translated example: the model as JSON, and the
// diagnostics of its translation as JSON.
import { translateMetaabm } from './translate';

/** The text of the two files for a `.metaabm` file. `model` is undefined if the model could not be translated. */
export function renderTranslation(metaabm: string): {
  model: string | undefined;
  diagnostics: string;
} {
  const translation = translateMetaabm(metaabm);
  return {
    model: translation.model && `${JSON.stringify(translation.model, null, 2)}\n`,
    diagnostics: `${JSON.stringify(translation.diagnostics, null, 2)}\n`,
  };
}
