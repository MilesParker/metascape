// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.Simple.Simple, edu.brook.Simple.SimpleAgent.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  Array2DVonNeumann,
  colors,
  defineModel,
  gridView,
  type HostCell,
  int,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** The happiness that an agent starts with, and returns to when the environment breaks it. */
export const INITIAL_HAPPINESS = 3;
/** The most happiness the first agent can reach. */
export const MAXIMUM_HAPPINESS = 1000;

/**
 * An agent of the Simple model. The first agent created (behaviour 0) doubles
 * its happiness every period; every other agent is "the environment" and, with
 * probability one in ten per period, resets the first agent's happiness.
 */
export class SimpleAgent extends Agent {
  happiness = INITIAL_HAPPINESS;
  behaviour = -1;

  readonly #next: () => number;
  readonly #first: () => SimpleAgent | undefined;
  readonly #setFirst: (agent: SimpleAgent) => void;

  constructor(
    next: () => number,
    first: () => SimpleAgent | undefined,
    setFirst: (agent: SimpleAgent) => void,
  ) {
    super();
    this.#next = next;
    this.#first = first;
    this.#setFirst = setFirst;
  }

  override initialize(): void {
    this.happiness = INITIAL_HAPPINESS;
    this.behaviour = this.#next();
    if (this.behaviour === 0) this.#setFirst(this);
  }

  /** The legacy `update` method. */
  update(): void {
    if (this.behaviour === 0) {
      this.happiness += this.happiness;
      if (this.happiness > MAXIMUM_HAPPINESS) this.happiness = MAXIMUM_HAPPINESS;
    } else if (this.random.int(0, 10) < 1) {
      const first = this.#first();
      if (first) first.happiness = INITIAL_HAPPINESS;
    }
  }

  /** Only the first agent reports its happiness; all others report 0 (as in the legacy model). */
  get reportedHappiness(): number {
    return this.behaviour === 0 ? this.happiness : 0;
  }
}

/** The Simple model: the first agent's happiness doubles until the environment breaks it. */
export const simple = defineModel({
  name: 'Simple',
  description:
    'The smallest Ascape tutorial model: one agent whose happiness doubles every period up to a ceiling, and any other agents, which each have a one in ten chance per period of resetting that happiness. The lattice is part of the model but stays empty.',
  provenance: {
    portedFrom: 'Ascape 5.6.1, edu.brook.Simple.Simple',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'The legacy sources name no author or publication. Agents are never placed on the lattice, as in the legacy model.',
  },
  parameters: {
    numberOfAgents: int(2, {
      min: 1,
      max: 1000,
      label: 'Number of agents',
      description: 'Agents in the model: the first one grows, the rest reset it.',
    }),
  } as const,
  build(root) {
    const p = root.parameters;
    const lattice = root.add(
      new Scape<HostCell>({
        name: 'lattice',
        space: new Array2DVonNeumann<HostCell>(),
        extent: [30, 30],
        periodic: true,
      }),
    );
    let counter = 0;
    let first: SimpleAgent | undefined;
    const agents: Scape<SimpleAgent> = root.add(
      new Scape<SimpleAgent>({
        name: 'Agents',
        size: p.numberOfAgents,
        executionOrder: 'byRule',
        prototypeAgent: () =>
          new SimpleAgent(
            () => counter++,
            () => first,
            (agent) => {
              first = agent;
            },
          ),
      }),
    );
    agents.addRule('Update', (agent) => agent.update(), { randomExecution: false });

    agents.addStatCollector(stat.measure('Happiness', (agent) => agent.reportedHappiness));

    root.addView(
      gridView({
        title: 'Lattice',
        scape: lattice,
        background: 0x3fa45b,
      }),
    );
    root.addView(
      timeSeriesView({
        title: 'Happiness',
        series: ['Happiness.max'],
        colors: { 'Happiness.max': colors.blue },
        yMin: 0,
      }),
    );
  },
});
