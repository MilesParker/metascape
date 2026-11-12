// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHV, LHVGreedy.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, type Provenance } from '@metascape/engine';
import { buildLongHouseValley, lhvParameters } from './build';

/** Who devised the Artificial Anasazi model and where it was published. */
export const ANASAZI_AUTHORS =
  'Robert L. Axtell, Joshua M. Epstein, Jeffrey S. Dean, George J. Gumerman, Alan C. Swedlund and colleagues';

/** The paper defining the model. */
export const ANASAZI_CITATION =
  'Axtell, R. L., Epstein, J. M., Dean, J. S., Gumerman, G. J., Swedlund, A. C., Harburger, J., Chakravarty, S., Hammond, R., Parker, J., & Parker, M. (2002). Population growth and collapse in a multiagent model of the Kayenta Anasazi in Long House Valley. PNAS, 99(suppl. 3), 7275-7279.';

/** Copyright notice of the legacy Ascape sources. */
export const BROOKINGS_COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

/** Provenance of a model ported from the named `edu.brook.aa` class. */
export function anasaziProvenance(legacyClass: string, note?: string): Provenance {
  return {
    authors: ANASAZI_AUTHORS,
    citation: ANASAZI_CITATION,
    portedFrom: `Ascape 5.6.1, edu.brook.aa.${legacyClass}`,
    copyright: BROOKINGS_COPYRIGHT,
    ...(note === undefined ? {} : { note }),
  };
}

const DATA_NOTE =
  'Driven by the Long House Valley data files distributed with Ascape 5.6.1 (map, water sources, SARG settlement record, PDSI and hydrology histories), embedded unchanged.';

/**
 * Artificial Anasazi, Long House Valley (`LHV`): aggregate households of five
 * farm maize under the reconstructed climate of AD 800-1350; the simulated
 * household count is recorded beside the archaeological record.
 */
export const lhv = defineModel({
  name: 'Artificial Anasazi: Long House Valley (LHV)',
  description:
    'Households of the Kayenta Anasazi farm maize in Long House Valley, Arizona, under the reconstructed climate and hydrology of AD 800-1350, settling near water and fissioning or leaving as harvests allow. The simulated number of households is charted against the archaeological record, which grows and then collapses around AD 1300.',
  provenance: anasaziProvenance('LHV', DATA_NOTE),
  parameters: lhvParameters({ stopYear: 1350, minFertility: 0.125 }),
  build(sim) {
    buildLongHouseValley(sim, { households: 'aggregate' });
  },
});

/**
 * `LHVGreedy`: the LHV model with `HouseholdGreedy` households, a "very
 * preliminary exploration" whose buffer-farm claiming is commented out, so
 * it behaves like {@link lhv}.
 */
export const lhvGreedy = defineModel({
  name: 'Artificial Anasazi: Long House Valley, greedy households (LHVGreedy)',
  description:
    'A preliminary variant of the Long House Valley model whose households were to claim buffer farms around their own; the claiming was never enabled in the legacy code, so it runs like the base model.',
  provenance: anasaziProvenance(
    'LHVGreedy',
    `${DATA_NOTE} The legacy HouseholdGreedy buffer-farm code is commented out, so this behaves like LHV.`,
  ),
  parameters: lhvParameters({ stopYear: 1350, minFertility: 0.125 }),
  build(sim) {
    buildLongHouseValley(sim, { households: 'greedy' });
  },
});
