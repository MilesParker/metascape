// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.manual.model1 to model5, CoordinationGame.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, int, type Provenance } from '@metascape/engine';
import { buildCoordinationGame, type GameParameters, type StepConfig } from './coordination-game';

const COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

const provenance = (step: number, note?: string): Provenance => ({
  portedFrom: `Ascape 5.6.1, edu.brook.manual.model${step}.CoordinationGame`,
  copyright: COPYRIGHT,
  note: note
    ? `The tutorial models of the Ascape manual. ${note}`
    : 'The tutorial models of the Ascape manual.',
});

const nPlayers = int(100, {
  min: 1,
  max: 900,
  label: 'Players',
  description: 'Number of players, placed on distinct cells of a 30 x 30 lattice.',
});
const redScore = int(1, {
  min: 0,
  max: 10,
  label: 'Red score',
  description: 'Payoff to a player who meets a partner of the same colour, red.',
});
const blueScore = int(1, {
  min: 0,
  max: 10,
  label: 'Blue score',
  description: 'Payoff to a player who meets a partner of the same colour, blue.',
});
const error = int(0, {
  min: 0,
  max: 100,
  label: 'Error (%)',
  description:
    'Chance in about 101 that a player picks a colour at random instead of revising by the rule.',
});

const defaults: GameParameters = {
  nPlayers: 100,
  redScore: 1,
  blueScore: 1,
  error: 0,
  turnsToDie: 5,
  repScore: 5,
  minDieScore: 3,
};

function config(overrides: Partial<StepConfig>): StepConfig {
  return { revision: 'none', demography: false, friends: false, payoff: true, ...overrides };
}

/** Step 1: imitate the best-scoring neighbor. */
export const step1 = defineModel({
  name: 'Coordination Game: Step 1',
  description:
    'Players on a lattice take random steps and play a coordination game with a random neighbor: matching on red or on blue pays the player. After a few plays each player copies the colour of any neighbor who is scoring better.',
  provenance: provenance(1),
  parameters: { nPlayers, redScore, blueScore } as const,
  build(sim) {
    buildCoordinationGame(
      sim,
      { ...defaults, ...sim.parameters },
      config({ revision: 'imitate-neighbors', payoff: false }),
    );
  },
});

/** Step 2: step 1 with mistakes, and a payoff chart. */
export const step2 = defineModel({
  name: 'Coordination Game: Step 2',
  description:
    'Step 1 with errors: with a given chance a player picks a colour at random instead of imitating. The chart adds the average payoff.',
  provenance: provenance(2),
  parameters: { nPlayers, redScore, blueScore, error } as const,
  build(sim) {
    buildCoordinationGame(
      sim,
      { ...defaults, ...sim.parameters },
      config({ revision: 'imitate-neighbors' }),
    );
  },
});

/** Step 3: best reply to recent partners instead of imitation. */
export const step3 = defineModel({
  name: 'Coordination Game: Step 3',
  description:
    'Players remember the colours of their last five partners and switch to the colour with the higher expected payoff against them (a best reply), choosing at random on ties or with the given error.',
  provenance: provenance(3),
  parameters: { nPlayers, redScore, blueScore, error } as const,
  build(sim) {
    buildCoordinationGame(
      sim,
      { ...defaults, ...sim.parameters },
      config({ revision: 'best-reply' }),
    );
  },
});

/** Step 4: no revision, but players reproduce and die. */
export const step4 = defineModel({
  name: 'Coordination Game: Step 4',
  description:
    'Players no longer change colour. A player whose last five plays score exactly the reproduction score has an offspring of the same colour on a free neighboring cell; a player with low score after enough plays dies. The population evolves by selection.',
  provenance: provenance(4),
  parameters: {
    nPlayers,
    redScore,
    blueScore,
    turnsToDie: int(5, {
      min: 0,
      max: 1000,
      label: 'Turns to die',
      description: 'Plays a player needs before it can die of a low score.',
    }),
    repScore: int(5, {
      min: 0,
      max: 100,
      label: 'Reproduction score',
      description: 'A player reproduces when its recent score equals this exactly.',
    }),
    minDieScore: int(3, {
      min: -100,
      max: 100,
      label: 'Minimum score to survive',
      description: 'A player with a recent score at or below this dies, once it has played enough.',
    }),
  } as const,
  build(sim) {
    buildCoordinationGame(sim, { ...defaults, ...sim.parameters }, config({ demography: true }));
  },
});

/** Step 5: imitate a fixed network of friends rather than neighbors. */
export const step5 = defineModel({
  name: 'Coordination Game: Step 5',
  description:
    'Players play their lattice neighbors but imitate four randomly chosen friends anywhere on the lattice, so that conventions spread through a social network instead of through space.',
  provenance: provenance(
    5,
    'Births and deaths of step 4 are not part of this step, as in the legacy code.',
  ),
  parameters: { nPlayers, redScore, blueScore, error } as const,
  build(sim) {
    buildCoordinationGame(
      sim,
      { ...defaults, ...sim.parameters },
      config({ revision: 'imitate-friends', friends: true }),
    );
  },
});
