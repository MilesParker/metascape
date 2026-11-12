// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model SIR.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  barsView,
  colors,
  defineModel,
  int,
  real,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/**
 * The stocks of the SIR system dynamics model, held by a single agent.
 *
 * The AMP runtime integrates each stock with explicit Euler steps of size 1:
 * the value at period `t` is the value at `t - 1` plus the stock's integral
 * (the net flow) evaluated with the values at `t - 1`. Its stocks hold the
 * initial value at both period 0 and period 1, so the first change shows at
 * period 2. {@link Compartments.advance} does the same, in place.
 */
export class Compartments extends Agent {
  /** SucseptiblePopulation. */
  susceptible = 0;
  /** InfectedPopulation. */
  infected = 0;
  /** RecoveredPopulation. */
  recovered = 0;
}

const parameters = {
  population: real(10000, {
    min: 1,
    max: 1e9,
    label: 'Population',
    description: 'The Population auxiliary variable: the total population in the infection rate.',
  }),
  initialSusceptible: real(9999, {
    min: 0,
    max: 1e9,
    label: 'Initial Susceptible',
    description: 'Initial value of the SucseptiblePopulation stock.',
  }),
  initialInfected: real(1, {
    min: 0,
    max: 1e9,
    label: 'Initial Infected',
    description: 'Initial value of the InfectedPopulation stock.',
  }),
  contactRate: real(0.333, {
    min: 0,
    max: 100,
    label: 'Contact Rate',
    description: 'The ContactRate auxiliary variable: contacts per person per period.',
  }),
  infectivity: real(0.2, {
    min: 0,
    max: 1,
    label: 'Infectivity',
    description:
      'The Infectivity auxiliary variable: the chance that a contact with an infected person infects.',
  }),
  illnessDuration: real(84, {
    min: 0.1,
    max: 10000,
    label: 'Illness Duration',
    description:
      'The IllnessDuration auxiliary variable, in periods: the recovery rate is the infected stock divided by it.',
  }),
  periods: int(0, {
    min: 0,
    max: 100000,
    label: 'Stop Period',
    description: 'Stop after this period; 0 runs without end. The AMP model sets no stop period.',
  }),
} as const;

/** SIR.metaabm: the Kermack and McKendrick compartment model as stocks and flows. */
export const sir = defineModel({
  name: 'SIR (system dynamics)',
  description:
    'A stock-and-flow susceptible, infected and recovered model of an epidemic: the infection rate is susceptible times contact rate times infectivity times infected over population, and infected people recover at a rate of infected divided by illness duration. Stocks are integrated with explicit Euler steps of one period.',
  provenance: {
    authors: 'W. O. Kermack and A. G. McKendrick',
    citation:
      'Kermack, W. O., & McKendrick, A. G. (1927). A contribution to the mathematical theory of epidemics. Proceedings of the Royal Society A, 115(772), 700-721.',
    portedFrom: 'Eclipse AMP, SIR.metaabm',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: 'The AMP model has no description or copyright statement; the authors and citation are those given for this port. The AMP agent count (SIR Agent Count, default 0) creates agents without rules and is not ported. The model is deterministic: the seed has no effect.',
  },
  parameters,
  build(sim) {
    const p = sim.parameters;
    const scape = sim.addScape(
      new Scape<Compartments>({
        name: 'compartments',
        size: 1,
        create: () => new Compartments(),
      }),
    );
    const flows = (c: Compartments) => ({
      infection: (c.susceptible * p.contactRate * p.infectivity * c.infected) / p.population,
      recovery: c.infected / p.illnessDuration,
    });
    scape.addInitialRule('initial values', (c) => {
      c.susceptible = p.initialSusceptible;
      c.infected = p.initialInfected;
      c.recovered = 0;
    });
    scape.addRule('integrate', (c) => {
      // Periods 0 and 1 both hold the initial values.
      if (sim.tick < 2) return;
      const { infection, recovery } = flows(c);
      c.susceptible += -infection;
      c.infected += infection - recovery;
      c.recovered += recovery;
    });
    const only = (): Compartments => scape.members[0]!;

    sim.data.value('SucseptiblePopulation', () => only().susceptible);
    sim.data.value('InfectedPopulation', () => only().infected);
    sim.data.value('RecoveredPopulation', () => only().recovered);
    sim.data.value('InfectionRate', () => flows(only()).infection);
    sim.data.value('RecoveryRate', () => flows(only()).recovery);
    sim.data.value('ContactRate', () => p.contactRate);
    sim.data.value('Population', () => p.population);
    sim.data.value('Infectivity', () => p.infectivity);
    sim.data.value('IllnessDuration', () => p.illnessDuration);

    if (p.periods > 0) {
      sim.observe({
        stepped(s) {
          if (s.tick >= p.periods) s.stop('stop period reached');
        },
      });
    }

    const stocks = ['SucseptiblePopulation', 'InfectedPopulation', 'RecoveredPopulation'];
    const palette = {
      SucseptiblePopulation: colors.blue,
      InfectedPopulation: colors.red,
      RecoveredPopulation: colors.green,
    };
    sim.addView(timeSeriesView({ title: 'Stocks', series: stocks, colors: palette, yMin: 0 }));
    sim.addView(
      timeSeriesView({
        title: 'Flows',
        series: ['InfectionRate', 'RecoveryRate'],
        colors: { InfectionRate: colors.red, RecoveryRate: colors.green },
        yMin: 0,
      }),
    );
    sim.addView(barsView({ title: 'Stocks now', series: stocks, colors: palette }));
  },
});
