// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import type { Curation } from '@metascape/spec';
import { defineFamily } from '../../catalog';
import { fromMetaabm as fromFormat } from '../../format-model';
import abSource from './ABDiffusion.model.json';
import abcSource from './ABCDiffusion.model.json';
import abcdefSource from './ABCDEFDiffusion.model.json';
import { abcDiffusion } from './abc-model';
import { abDiffusion } from './ab-model';
import { diffusionProvenance } from './action-model';
import { abcdefDiffusion, bigAbcdefDiffusion, bigAbcdefDiffusionBW } from './abcdef-models';

export { abcDiffusion, abDiffusion, abcdefDiffusion, bigAbcdefDiffusion, bigAbcdefDiffusionBW };

/** The chart of the cells playing each action, in the coded models' colours. */
const curation = (model: string, actions: readonly string[]): Curation => ({
  schemaVersion: 1,
  model,
  charts: [
    {
      title: 'Cells playing each action',
      series: actions.map((action) => ({
        measure: 'count' as const,
        agent: 'cell',
        attribute: 'action',
        qualifier: action.toLowerCase(),
        label: `Plays ${action}`,
      })),
      yMin: 0,
    },
  ],
});

const note = 'Written in the model format from the coded port; see the coded model beside it.';
const halves =
  ' The chart counts the cells of each action over the whole lattice, not in its upper and lower halves as the coded model does.';

/** The AB model, written in the model format. */
export const abDiffusionFormat = fromFormat(abSource, {
  name: 'Diffusion: AB Diffusion Model (format)',
  provenance: diffusionProvenance('ABModel', note),
  curation: curation('abDiffusion', ['A', 'B']),
});

/** The ABC model, written in the model format. */
export const abcDiffusionFormat = fromFormat(abcSource, {
  name: 'Diffusion: ABC Diffusion Model (format)',
  provenance: diffusionProvenance('ABCModel', note + halves),
  curation: curation('abcDiffusion', ['A', 'B', 'C']),
});

/** The ABCDEF model, written in the model format. */
export const abcdefDiffusionFormat = fromFormat(abcdefSource, {
  name: 'Diffusion: ABCDEF Diffusion Model (format)',
  provenance: diffusionProvenance('ABCDEFModel', note + halves),
  curation: curation('abcdefDiffusion', ['A', 'B', 'C', 'D', 'E', 'F']),
});

/** The same model with other settings: a catalogue entry that is a run of it. */
function variant(
  base: Model,
  name: string,
  provenance: NonNullable<Model['provenance']>,
  defaults: Readonly<Record<string, number | boolean>>,
): Model {
  return {
    ...base,
    name,
    provenance,
    parameters: Object.fromEntries(
      Object.entries(base.parameters).map(([key, parameter]) => [
        key,
        key in defaults ? { ...parameter, default: defaults[key] } : parameter,
      ]),
    ) as Model['parameters'],
  };
}

/** BigABCDEFModel: the ABCDEF model on a 20 by 20 lattice. */
export const bigAbcdefDiffusionFormat = variant(
  abcdefDiffusionFormat,
  'Diffusion: Big ABCDEF Diffusion Model (format)',
  diffusionProvenance('BigABCDEFModel', note + halves),
  { 'world.width': 20, 'world.height': 20 },
);

/** BigABCDEFModelBW: the same drawn in black and white. */
export const bigAbcdefDiffusionBWFormat = variant(
  abcdefDiffusionFormat,
  'Diffusion: Big ABCDEF Diffusion Model (black and white) (format)',
  diffusionProvenance('BigABCDEFModelBW', note + halves),
  { 'world.width': 20, 'world.height': 20, blackAndWhite: true },
);

/** Diffusion of behavior through a lattice (Young; Axtell). */
export const family = defineFamily({
  id: 'brookings-diffusion',
  name: 'Diffusion',
  collection: 'Brookings Institution models (from Ascape)',
  tags: ['diffusion', 'social norms'],
  description:
    'Diffusion in social networks: cells adopt a behavior by its inherent payoff and how many neighbors have adopted it, with random error. Two, three and six actions.',
  models: [
    abDiffusion,
    abDiffusionFormat,
    abcDiffusion,
    abcDiffusionFormat,
    abcdefDiffusion,
    abcdefDiffusionFormat,
    bigAbcdefDiffusion,
    bigAbcdefDiffusionFormat,
    bigAbcdefDiffusionBW,
    bigAbcdefDiffusionBWFormat,
  ],
});
