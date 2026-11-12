// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.cv.CVModelInterGroup, CVModelInterGroupRetr, CitizenBlueGreen and edu.brook.cv.paper.CVModelII, CVModelIIRun1, CVModelIIRun2and3, CVModelIIRun4aandb.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineIntergroupModel } from './core';

const MODEL_II =
  "Epstein's model of inter-group violence: citizens of two groups, blue and green, multiply and die; " +
  'active citizens attack members of the other group in view, and cops act as peacekeepers.';

/** `edu.brook.cv.CVModelInterGroup`: the Model II base (no cops, legitimacy 0.80). */
export const cvModelInterGroup = defineIntergroupModel({
  name: 'Civil Violence: Model II (CVModelInterGroup)',
  description: MODEL_II,
  legacyClass: 'edu.brook.cv.CVModelInterGroup',
  variant: { kind: 'intergroup' },
});

/**
 * `edu.brook.cv.CVModelInterGroupRetr`: citizens decide with the retaliation
 * estimate. The legacy class selects a rule that was never added, which throws
 * in Ascape; this port runs the evidently intended rule order.
 */
export const cvModelInterGroupRetr = defineIntergroupModel({
  name: 'Civil Violence: Model II with Retaliation (CVModelInterGroupRetr)',
  description: MODEL_II + ' Citizens also weigh the risk of retaliation by the other group.',
  legacyClass: 'edu.brook.cv.CVModelInterGroupRetr',
  note: 'The legacy class throws on construction (it selects a rule that was never added); this port runs the intended behaviour: the retaliation decision rule in place of the ordinary one.',
  variant: { kind: 'intergroup', retaliation: true },
});

/** `edu.brook.cv.paper.CVModelII`: Model II of the paper. */
export const cvModelII = defineIntergroupModel({
  name: 'Civil Violence: Model II',
  description: MODEL_II,
  legacyClass: 'edu.brook.cv.paper.CVModelII',
  variant: { kind: 'intergroup' },
});

/** `CVModelIIRun1`: legitimacy 0.90, no cops. */
export const cvModelIIRun1 = defineIntergroupModel(
  {
    name: 'Civil Violence: Model II, Run 1',
    description: MODEL_II + ' High legitimacy and no cops.',
    legacyClass: 'edu.brook.cv.paper.CVModelIIRun1',
    variant: { kind: 'intergroup' },
  },
  { initialCopDensity: 0, legitimacy: 0.9 },
);

/** `CVModelIIRun2and3`: legitimacy 0.80, no cops. */
export const cvModelIIRun2and3 = defineIntergroupModel(
  {
    name: 'Civil Violence: Model II, Runs 2 and 3',
    description: MODEL_II + ' Lower legitimacy and no cops.',
    legacyClass: 'edu.brook.cv.paper.CVModelIIRun2and3',
    variant: { kind: 'intergroup' },
  },
  { initialCopDensity: 0, legitimacy: 0.8 },
);

/** `CVModelIIRun4aandb`: legitimacy 0.80 with 4% cops as peacekeepers. */
export const cvModelIIRun4aandb = defineIntergroupModel(
  {
    name: 'Civil Violence: Model II, Runs 4a and 4b',
    description: MODEL_II + ' Cops, 4% of sites, keep the peace.',
    legacyClass: 'edu.brook.cv.paper.CVModelIIRun4aandb',
    variant: { kind: 'intergroup' },
  },
  { initialCopDensity: 0.04, legitimacy: 0.8 },
);
