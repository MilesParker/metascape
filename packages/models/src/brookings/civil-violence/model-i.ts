// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.cv.CVModel and edu.brook.cv.paper.CVModelI, CVModelIRun1, CVModelIRun2, CVModelIRun3and4and5, CVModelIRun3, CVModelIRun4, CVModelIRun5.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineRebellionModel } from './core';
import { NEVER_RELEASED } from './agents';

const MODEL_I =
  "Epstein's model of decentralized rebellion against a central authority: citizens turn active when " +
  'their grievance outweighs their perceived risk of arrest, and cops jail active citizens in view.';

/** `edu.brook.cv.CVModel`: the Model I base, with the legacy defaults. */
export const cvModel = defineRebellionModel({
  name: 'Civil Violence: Model I (CVModel)',
  description: MODEL_I,
  legacyClass: 'edu.brook.cv.CVModel',
  variant: { kind: 'rebellion' },
});

/** `edu.brook.cv.paper.CVModelI`: Model I of the paper (identical settings to CVModel). */
export const cvModelI = defineRebellionModel({
  name: 'Civil Violence: Model I',
  description: MODEL_I,
  legacyClass: 'edu.brook.cv.paper.CVModelI',
  variant: { kind: 'rebellion' },
});

/** `CVModelIRun1`: legitimacy 0.89, citizens do not move. */
export const cvModelIRun1 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Run 1',
    description: MODEL_I + ' Citizens stay where they were placed; only cops move.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun1',
    variant: { kind: 'rebellion', citizensMove: false },
  },
  { legitimacy: 0.89 },
);

/** `CVModelIRun2`: vision 7, legitimacy 0.82, jail term 30, 4% cops. */
export const cvModelIRun2 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Run 2',
    description:
      MODEL_I + ' Long vision and a long jail term: rebellion arrives in punctuated outbursts.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun2',
    variant: { kind: 'rebellion' },
  },
  { copVision: 7, citizenVision: 7, legitimacy: 0.82, jailTerm: 30, initialCopDensity: 0.04 },
);

const RUN_3_4_5 = {
  copVision: 7,
  citizenVision: 7,
  initialCopDensity: 0.074,
  jailTerm: NEVER_RELEASED,
  legitimacy: 0.9,
};

/** `CVModelIRun3and4and5`: the common base of Runs 3 to 5 (legitimacy 0.90, 7.4% cops, no release). */
export const cvModelIRun3and4and5 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Runs 3-5 (base)',
    description: MODEL_I + ' Jailed citizens are never released; legitimacy is held at 0.90.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun3and4and5',
    variant: { kind: 'rebellion', chartExtra: 'legitimacy' },
  },
  RUN_3_4_5,
);

/** `CVModelIRun3`: legitimacy falls by 0.01 every third tick. */
export const cvModelIRun3 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Run 3',
    description:
      MODEL_I + ' Legitimacy erodes by 0.01 every third tick while jailed citizens stay jailed.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun3',
    variant: {
      kind: 'rebellion',
      chartExtra: 'legitimacy',
      afterIteration: (world, iteration) => {
        if (iteration % 3 === 0) {
          world.legitimacy = world.legitimacy - 0.01 > 0.0 ? world.legitimacy - 0.01 : 0.0;
        }
      },
    },
  },
  RUN_3_4_5,
);

/** `CVModelIRun4`: legitimacy drops to 0.65 after tick 75. */
export const cvModelIRun4 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Run 4',
    description: MODEL_I + ' Legitimacy is cut from 0.90 to 0.65 after tick 75.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun4',
    variant: {
      kind: 'rebellion',
      chartExtra: 'legitimacy',
      afterIteration: (world, iteration) => {
        if (iteration === 75) world.legitimacy = 0.65;
      },
    },
  },
  RUN_3_4_5,
);

/** `CVModelIRun5`: legitimacy 0.80 and the cop target falls from 6% by 0.1 point per tick. */
export const cvModelIRun5 = defineRebellionModel(
  {
    name: 'Civil Violence: Model I, Run 5',
    description: MODEL_I + ' The number of cops is steadily reduced from a 6% target down to none.',
    legacyClass: 'edu.brook.cv.paper.CVModelIRun5',
    variant: {
      kind: 'rebellion',
      chartExtra: 'copDensity',
      startTargetCopDensity: 0.06,
      afterIteration: (world) => {
        world.targetCopDensity =
          world.targetCopDensity - 0.001 > 0.0 ? world.targetCopDensity - 0.001 : 0.0;
      },
    },
  },
  { ...RUN_3_4_5, legitimacy: 0.8 },
);
