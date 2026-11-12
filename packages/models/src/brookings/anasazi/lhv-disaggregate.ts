// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHVDisaggregate, LHVClan.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel } from '@metascape/engine';
import { buildLongHouseValley, lhvParameters, personParameters } from './build';
import { anasaziProvenance } from './lhv';

const NOTE =
  'A "very preliminary exploration" in the legacy sources. Households hold individual people with age-specific birth and death rates; people marry across clans and found households. As in the legacy code, household maize is harvested but never eaten, households run metabolism and movement twice a year, and every person is a PersonClan.';

/** `LHVDisaggregate`: households made of individual people. */
export const lhvDisaggregate = defineModel({
  name: 'Artificial Anasazi: Long House Valley, individual people (LHVDisaggregate)',
  description:
    'An exploratory variant of the Long House Valley model in which households are made of individual people who are born, marry across clans, found new households and die at age-specific rates.',
  provenance: anasaziProvenance('LHVDisaggregate', NOTE),
  parameters: {
    ...lhvParameters({ stopYear: 1350, minFertility: 0.25 }),
    ...personParameters(),
  },
  build(sim) {
    buildLongHouseValley(sim, { households: 'disaggregate' });
  },
});

/** `LHVClan`: the disaggregated model run to AD 1400 with clan series and colours. */
export const lhvClan = defineModel({
  name: 'Artificial Anasazi: Long House Valley, clans (LHVClan)',
  description:
    'The individual-people variant of the Long House Valley model run to AD 1400, charting households by clan and colouring farmland by the clan that worked it.',
  provenance: anasaziProvenance(
    'LHVClan',
    `${NOTE} LHVClan only changes the stop year (1400), the minimum fertility default (0.33, unused by people) and the views.`,
  ),
  parameters: {
    ...lhvParameters({ stopYear: 1400, minFertility: 0.33 }),
    ...personParameters(),
  },
  build(sim) {
    buildLongHouseValley(sim, { households: 'disaggregate', clanViews: true });
  },
});
