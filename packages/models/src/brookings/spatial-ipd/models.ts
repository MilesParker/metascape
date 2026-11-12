// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: name.milesparker.spatialipd.PD2DGA, PD2DGA_CLOSEST, PD2DGA_FURTHEST, PD2DGA_PREFERENCE, PD2DGA_RANDOM, PD2DGAMulti, PD2DGAMultiple, PD2DGAMultipleTo.
// Original: Copyright 2000 Miles T. Parker.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import { defineModel, type Provenance } from '@metascape/engine';
import { buildSpatialIpd, gaParameters, type GaBuildOptions } from './spatial-ipd';

const DESCRIPTION =
  "Players on a lattice play an iterated Prisoner's Dilemma against neighbors with a genetic-algorithm strategy: each carries a chromosome that maps the remembered last rounds to a move. Rich players clone onto neighboring sites, and chromosomes mutate and cross over with neighbors.";

function provenance(legacyClass: string, note?: string): Provenance {
  return {
    authors: 'Miles T. Parker',
    portedFrom: `Ascape 5.6.1, name.milesparker.spatialipd.${legacyClass}`,
    copyright: 'Copyright 2000 Miles T. Parker.',
    ...(note ? { note } : {}),
  };
}

function ga(
  legacyClass: string,
  title: string,
  description: string,
  options: GaBuildOptions,
  note?: string,
) {
  return defineModel({
    name: `Spatial IPD (GA): ${legacyClass}`,
    description: `${title} ${description}`,
    provenance: provenance(legacyClass, note),
    parameters: gaParameters,
    build: (sim) => buildSpatialIpd(sim, options),
  });
}

/** `PD2DGA`: each player plays one random occupied neighbor per tick. */
export const pd2dga = ga('PD2DGA', 'Random partners.', DESCRIPTION, { plays: ['random'] });

/** `PD2DGA_RANDOM`: identical to `PD2DGA`; it selects the random-neighbor rule that is already on. */
export const pd2dgaRandom = ga('PD2DGA_RANDOM', 'Random partners.', DESCRIPTION, {
  plays: ['random'],
});

/** `PD2DGA_CLOSEST`: each player plays the neighbor with the most similar chromosome. */
export const pd2dgaClosest = ga(
  'PD2DGA_CLOSEST',
  'Plays the closest neighbor.',
  DESCRIPTION,
  { plays: ['closest'] },
  'The play rule sits after Death in the rule list, as in the legacy rule order.',
);

/** `PD2DGA_FURTHEST`: each player plays the neighbor with the least similar chromosome. */
export const pd2dgaFurthest = ga(
  'PD2DGA_FURTHEST',
  'Plays the furthest neighbor.',
  DESCRIPTION,
  { plays: ['furthest'] },
  'The play rule sits after Death in the rule list, as in the legacy rule order.',
);

/** `PD2DGA_PREFERENCE`: a preference gene decides between the closest and the furthest neighbor. */
export const pd2dgaPreference = ga(
  'PD2DGA_PREFERENCE',
  'Plays the closest or furthest neighbor according to an evolved preference gene.',
  DESCRIPTION,
  { plays: ['preference'], closenessChart: true },
  'The legacy class selects a rule "Play Preference" that no code defines, so it throws when created; the rule is supplied from the existing PlayerGA.playPreference() method and placed after "Play Furthest".',
);

/** `PD2DGAMulti`: `PD2DGA` plus a run-data export of the commonest genomes; see {@link pd2dgaMultiDesign}. */
export const pd2dgaMulti = ga(
  'PD2DGAMulti',
  'Batch variant that records the most common genomes of a finished run.',
  DESCRIPTION,
  { plays: ['random'] },
  'Dynamics equal PD2DGA; the run-data export is the experiment design pd2dgaMultiDesign.',
);

/** `PD2DGAMultiple`: batch harness with the preference rule added to random play; see {@link pd2dgaMultipleDesign}. */
export const pd2dgaMultiple = ga(
  'PD2DGAMultiple',
  'Batch variant (35 runs of 1000 ticks in the legacy sweep) with random and preference play.',
  DESCRIPTION,
  { plays: ['random', 'preference'] },
  'Batch harness: use pd2dgaMultipleDesign with runExperiment. Unlike PD2DGA_PREFERENCE it leaves random play on. The "Play Preference" rule is supplied as for PD2DGA_PREFERENCE.',
);

/** `PD2DGAMultipleTo`: batch harness that runs until extinction; see {@link pd2dgaMultipleToDesign}. */
export const pd2dgaMultipleTo = ga(
  'PD2DGAMultipleTo',
  'Batch variant with random and closest play that stops when the population is extinct.',
  DESCRIPTION,
  { plays: ['random', 'closest'], stopWhenExtinct: true },
  'Batch harness: use pd2dgaMultipleToDesign with runExperiment. Unlike PD2DGA_CLOSEST it leaves random play on.',
);
