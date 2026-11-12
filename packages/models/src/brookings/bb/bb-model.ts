// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.bb.Bb.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { defineModel, int, rgb, Scape, timeSeriesView, type Color } from '@metascape/engine';
import { Beaver, type BeaverConfig, type BeaverType } from './beaver';

const MEASURES: readonly { name: string; type: BeaverType; max: boolean; color: Color }[] = [
  { name: 'RAOnes', type: 'r', max: false, color: rgb(255, 255, 0) },
  { name: 'GAOnes', type: 'g', max: false, color: rgb(0, 255, 0) },
  { name: 'MAOnes', type: 'm', max: false, color: rgb(255, 175, 175) },
  { name: 'SMOnes', type: 's', max: true, color: rgb(0, 0, 0) },
  { name: 'RMOnes', type: 'r', max: true, color: rgb(255, 0, 0) },
  { name: 'GMOnes', type: 'g', max: true, color: rgb(0, 0, 255) },
  { name: 'MMOnes', type: 'm', max: true, color: rgb(255, 0, 255) },
];

/**
 * The busy-beaver search: beavers search for rule tables of small Turing
 * machines that halt having written as many 1s as possible on a blank tape.
 */
export const busyBeavers = defineModel({
  name: 'Busy Beavers: Bb',
  description:
    'Agents ("beavers") search for the small Turing machine that halts after writing the most ones ' +
    'on a blank tape. One beaver uses a fixed rule, and the others try random rules or evolve ' +
    'rule tables with a genetic algorithm, either whole tables or one state at a time.',
  provenance: {
    portedFrom: 'Ascape 5.6.1, edu.brook.bb.Bb',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'The legacy sources name no authors, citation or description. The lattice that the legacy model creates (30 by 30, von Neumann) is not used by the beavers and is omitted. The beaver that prints its best machine to the console does not do so here.',
  },
  parameters: {
    numberOfAgents: int(16, {
      min: 1,
      max: 100,
      label: 'Number of agents',
      description: 'Number of beavers.',
    }),
    states: int(3, {
      min: 2,
      max: 4,
      label: 'States',
      description: 'Machine states (legacy 3; the static beaver has rules for 2 to 4).',
    }),
    maxTransitions: int(50, {
      min: 5,
      max: 200,
      label: 'Maximum transitions',
      description: 'A machine still running after this many transitions counts as not halting.',
    }),
    subStepsPerStep: int(100, {
      min: 1,
      max: 1000,
      label: 'Trials per step',
      description: 'Machines each beaver tries per step.',
    }),
  },

  build(sim) {
    const { numberOfAgents, states, maxTransitions, subStepsPerStep } = sim.parameters;
    const config: BeaverConfig = {
      tapeLength: 512,
      maxStati: states,
      maxTrans: maxTransitions,
      subStepPerStep: subStepsPerStep,
    };
    const beavers = sim.addScape(
      new Scape<Beaver>({
        name: 'Beavers',
        size: numberOfAgents,
        create: (index) => new Beaver(config, index),
      }),
    );
    beavers.addInitialRule('Step', (beaver) => beaver.step());
    beavers.addRule('Step', (beaver) => beaver.step());

    const series: string[] = [];
    const colors: Record<string, Color> = {};
    for (const m of MEASURES) {
      sim.data.measure(beavers, m.name, (b) => (m.max ? b.maxOnes : b.meanOnes), {
        when: (b) => b.type === m.type,
      });
      series.push(`${m.name}.max`);
      colors[`${m.name}.max`] = m.color;
    }
    sim.addView(timeSeriesView({ title: 'Maximum ones', series, colors }));
  },
});
