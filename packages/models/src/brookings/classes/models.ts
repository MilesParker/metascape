// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.classes.BargainingModelOne, BargainingModelTwo,
// BargainingModelPeyton, Figure2, Figure3, Figure6, Figure7, Figure8, Figure9.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { bargainingModel, type BargainingVariant } from './bargaining';

const AUTHORS = 'Robert L. Axtell, Joshua M. Epstein and H. Peyton Young';
const CITATION =
  'Axtell, R. L., Epstein, J. M., & Young, H. P. (2001). The emergence of classes in a multi-agent bargaining model. In S. N. Durlauf & H. P. Young (Eds.), Social Dynamics. MIT Press.';
const COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';
const ABOUT =
  'Agents repeatedly divide a pie by each demanding a low, medium or high share, and each demands whatever would have paid best against its memory of past opponents. Norms of what to demand emerge from these decentralized encounters and then persist, even though they may have arisen from random events.';

const base: BargainingVariant = {
  kind: 'untagged',
  minimumMemorySize: 20,
  maximumMemorySize: 100,
  randomStrategyProbability: 0.1,
  lowPayoff: 0.3,
  mediumPayoff: 0.5,
  highPayoff: 0.7,
};
const fixedMemory = { minimumMemorySize: 20, maximumMemorySize: 20 } as const;
const tagged: BargainingVariant = { ...base, kind: 'tagged' };
const figure6: BargainingVariant = {
  ...tagged,
  ...fixedMemory,
  randomStrategyProbability: 0.05,
  startRule: 'none',
};

const declare = (
  name: string,
  legacy: string,
  variant: BargainingVariant,
  description: string,
  note?: string,
) =>
  bargainingModel({
    name: `Emergence of Classes: ${name}`,
    description,
    variant,
    provenance: {
      authors: AUTHORS,
      citation: CITATION,
      portedFrom: `Ascape 5.6.1, edu.brook.classes.${legacy}`,
      copyright: COPYRIGHT,
      note:
        'The legacy intragroup and intergroup simplex views are drawn as continuous-space plots of the same memory proportions.' +
        (note ? ` ${note}` : ''),
    },
  });

/** Untagged agents with memories of 20 to 100 encounters. */
export const classesModelOne = declare(
  'Model One',
  'BargainingModelOne',
  base,
  `${ABOUT} One population of identical agents.`,
);

/** Paper figure 2: every agent remembers exactly 20 encounters. */
export const classesFigure2 = declare(
  'Figure 2',
  'Figure2',
  { ...base, ...fixedMemory },
  `${ABOUT} Every agent remembers exactly 20 encounters.`,
);

/** Paper figure 3: as figure 2, with initial memories holding only low and high demands. */
export const classesFigure3 = declare(
  'Figure 3',
  'Figure3',
  { ...base, ...fixedMemory, highLowStart: true },
  `${ABOUT} Every agent remembers exactly 20 encounters, initially all low or high demands.`,
);

/** Two randomly tagged groups that remember and treat each other's tags separately. */
export const classesModelTwo = declare(
  'Model Two',
  'BargainingModelTwo',
  tagged,
  `${ABOUT} Agents carry a light or dark tag and keep separate expectations about their own group and the other.`,
);

/** Paper figure 6: two tagged groups, memories of 20, 5% random demands, random initial memories. */
export const classesFigure6 = declare(
  'Figure 6',
  'Figure6',
  figure6,
  `${ABOUT} Two tagged groups with memories of 20 encounters and 5% random demands, starting from random memories.`,
);

/** Paper figure 7: figure 6 with light agents starting with only low and high memories of their own group. */
export const classesFigure7 = declare(
  'Figure 7',
  'Figure7',
  { ...figure6, startRule: 'lightIntraHighLow' },
  `${ABOUT} Two tagged groups; light agents begin remembering only low or high demands from their own group.`,
);

/** Paper figure 8: 20% random demands; light agents start expecting low from the other group, dark agents high. */
export const classesFigure8 = declare(
  'Figure 8',
  'Figure8',
  { ...figure6, randomStrategyProbability: 0.2, startRule: 'lightInterLowDarkInterHigh' },
  `${ABOUT} Two tagged groups with 20% random demands; light agents begin expecting low demands from the dark group, dark agents high demands from the light group.`,
);

/** Paper figure 9: figure 8's start combined with figure 7's, at 5% random demands. */
export const classesFigure9 = declare(
  'Figure 9',
  'Figure9',
  { ...figure6, startRule: 'lightInterLowIntraHighLowDarkInterHigh' },
  `${ABOUT} Two tagged groups; light agents begin with low expectations of the dark group and low or high expectations of their own, dark agents with high expectations of the light group.`,
);

/** Tagged agents that must coordinate: a demand pays only against a complementary one. */
export const classesPeyton = declare(
  'Model Peyton',
  'BargainingModelPeyton',
  { ...tagged, kind: 'peyton', lowPayoff: 0.1, mediumPayoff: 0.3, highPayoff: 0.5 },
  `${ABOUT} Two tagged groups playing a coordination game, where a demand pays only if the opponent's demand is complementary.`,
  'Demands are 0.1, 0.3 and 0.5 of the pie, as the legacy class sets them.',
);
