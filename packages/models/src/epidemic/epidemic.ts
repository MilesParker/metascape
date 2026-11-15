// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  barsView,
  colors,
  connectSmallWorld,
  defineModel,
  Graph,
  int,
  networkView,
  real,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** Disease states of a {@link Person}. */
export const Health = { Susceptible: 0, Infected: 1, Recovered: 2 } as const;
export type Health = (typeof Health)[keyof typeof Health];

/** One member of the population. */
export class Person extends Agent {
  health: Health = Health.Susceptible;
  /** Periods spent in the current state (infected, or recovered with waning immunity). */
  timer = 0;
  /** Whether this person has ever been infected. */
  everInfected = false;
  /** The people this person is linked to; fixed once the network is built. */
  contacts: readonly Person[] = [];
  /** State computed in `execute`, applied in `update`. */
  nextHealth: Health = Health.Susceptible;
}

const parameters = {
  population: int(500, {
    min: 10,
    max: 5000,
    label: 'Population',
    description: 'Number of people.',
  }),
  k: int(4, {
    min: 1,
    max: 20,
    label: 'Neighbors per side (k)',
    description: 'Each person starts linked to this many neighbors on each side of a ring.',
  }),
  rewire: real(0.05, {
    min: 0,
    max: 1,
    label: 'Rewiring probability',
    description: 'Chance that a ring link is redirected to a random person (Watts-Strogatz).',
  }),
  initialInfected: int(5, {
    min: 1,
    max: 5000,
    label: 'Initially infected',
    description: 'People infected at the start (capped at the population).',
  }),
  transmission: real(0.1, {
    live: true,
    min: 0,
    max: 1,
    label: 'Transmission probability',
    description: 'Chance per period that one infected neighbor infects a susceptible person.',
  }),
  infectiousPeriod: int(8, {
    live: true,
    min: 1,
    max: 200,
    label: 'Infectious period',
    description: 'Periods a person stays infected before recovering.',
  }),
  immunityPeriod: int(0, {
    live: true,
    min: 0,
    max: 1000,
    label: 'Immunity period',
    description:
      'Periods of immunity after recovery before becoming susceptible again; 0 is permanent.',
  }),
} as const;

const stateColor = (person: Person): number =>
  person.health === Health.Infected
    ? colors.red
    : person.health === Health.Recovered
      ? colors.green
      : colors.blue;

export const epidemic = defineModel({
  name: 'Epidemic (SIR on a small-world network)',
  summary: 'An infection spreads over a small-world network of contacts until it burns out.',
  tags: ['epidemics', 'networks'],
  description:
    'A susceptible-infected-recovered epidemic spreading over a Watts-Strogatz small-world network (Watts and Strogatz, Nature, 1998) with the compartmental logic of Kermack and McKendrick (1927). Each susceptible person is infected with probability 1 - (1 - transmission)^n, where n is the number of infected neighbors; infected people recover after a fixed period and are immune, permanently or for a limited time. Updating is synchronous, so results do not depend on the order of agents. A few random shortcuts make the outbreak far faster than on a pure ring.',
  explorations: [
    {
      title: 'Add shortcuts',
      description:
        'Rewire a fifth of the links at random: the outbreak no longer creeps round the ring.',
      parameters: { rewire: 0.2 },
    },
    {
      title: 'Immunity that wears off',
      description: 'Recovered people become susceptible again after 20 periods; look for waves.',
      parameters: { immunityPeriod: 20 },
    },
    {
      title: 'A less catching disease',
      description: 'Halve the transmission probability while it spreads.',
      parameters: { transmission: 0.05 },
    },
  ],
  parameters,
  build(root) {
    const p = root.parameters;
    const people = root.add(
      new Scape<Person>({
        name: 'people',
        space: new Graph<Person>(),
        size: p.population,
        prototypeAgent: () => new Person(),
      }),
    );
    const contacts = people.space as Graph<Person>;

    people.addRule({
      name: 'epidemic',
      execute(person) {
        person.nextHealth = person.health;
        switch (person.health) {
          case Health.Susceptible: {
            let infected = 0;
            const contacts = person.contacts;
            for (let i = 0; i < contacts.length; i++) {
              if (contacts[i]!.health === Health.Infected) infected++;
            }
            if (
              infected > 0 &&
              people.random.chance(1 - Math.pow(1 - root.parameters.transmission, infected))
            ) {
              person.nextHealth = Health.Infected;
            }
            break;
          }
          case Health.Infected:
            if (person.timer + 1 >= root.parameters.infectiousPeriod)
              person.nextHealth = Health.Recovered;
            break;
          case Health.Recovered:
            if (
              root.parameters.immunityPeriod > 0 &&
              person.timer + 1 >= root.parameters.immunityPeriod
            ) {
              person.nextHealth = Health.Susceptible;
            }
            break;
        }
      },
      update(person) {
        if (person.nextHealth === person.health) {
          person.timer++;
          return;
        }
        person.health = person.nextHealth;
        person.timer = 0;
        if (person.health === Health.Infected) person.everInfected = true;
      },
    });

    people.addStatCollector(stat.count('susceptible', (a) => a.health === Health.Susceptible));
    people.addStatCollector(stat.count('infected', (a) => a.health === Health.Infected));
    people.addStatCollector(stat.count('recovered', (a) => a.health === Health.Recovered));
    people.addStatCollector(stat.count('everInfected', (a) => a.everInfected));

    // The outbreak as a whole: it wires the contact network and seeds the infection once
    // everyone exists, and stops the model after the iteration in which the last case recovers.
    const outbreak = root.add(new Scape({ name: 'outbreak', space: new Singleton() }));
    outbreak.addInitialRule(
      'wire and seed',
      () => {
        const members = [...people.members];
        connectSmallWorld(contacts, members, p.k, p.rewire, people.random);
        for (const person of members) person.contacts = contacts.neighbors(person);
        const order = people.random.shuffle([...members]);
        for (const person of order.slice(0, Math.min(p.initialInfected, order.length))) {
          person.health = person.nextHealth = Health.Infected;
          person.everInfected = true;
        }
      },
      { randomExecution: false },
    );
    outbreak.addRule(
      'stop when over',
      () => {
        if (people.count((a) => a.health === Health.Infected) === 0) {
          root.stop('no one is infected');
        }
      },
      { randomExecution: false, causesRemoval: false },
    );

    const palette = {
      susceptible: colors.blue,
      infected: colors.red,
      recovered: colors.green,
    };
    const series = ['susceptible', 'infected', 'recovered'];
    people.addView(
      networkView<Person>({
        title: 'Contact network',
        nodes: people,
        graph: contacts,
        legend: [
          { color: colors.blue, label: 'Susceptible' },
          { color: colors.red, label: 'Infected' },
          { color: colors.green, label: 'Recovered' },
        ],
        color: stateColor,
        layout: 'circle',
      }),
    );
    people.addView(
      timeSeriesView({ title: 'S, I and R over time', series, colors: palette, yMin: 0 }),
    );
    people.addView(barsView({ title: 'S, I and R now', series, colors: palette }));
  },
});
