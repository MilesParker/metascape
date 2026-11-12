// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  barsView,
  colors,
  connectSmallWorld,
  defineModel,
  int,
  Network,
  networkView,
  real,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** Disease states of a {@link Person}. */
export const Health = { Susceptible: 0, Infected: 1, Recovered: 2 } as const;
export type Health = (typeof Health)[keyof typeof Health];

/** One member of the population. */
export class Person extends Agent {
  health: Health = Health.Susceptible;
  /** Ticks spent in the current state (infected, or recovered with waning immunity). */
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
    min: 0,
    max: 1,
    label: 'Transmission probability',
    description: 'Chance per tick that one infected neighbor infects a susceptible person.',
  }),
  infectiousPeriod: int(8, {
    min: 1,
    max: 200,
    label: 'Infectious period',
    description: 'Ticks a person stays infected before recovering.',
  }),
  immunityPeriod: int(0, {
    min: 0,
    max: 1000,
    label: 'Immunity period',
    description:
      'Ticks of immunity after recovery before becoming susceptible again; 0 is permanent.',
  }),
} as const;

/** The population, which builds its small-world network and seeds the infection when created. */
export class Population extends Scape<Person> {
  readonly network = new Network<Person>();

  constructor(
    private readonly setup: {
      readonly k: number;
      readonly rewire: number;
      readonly initialInfected: number;
    },
    size: number,
  ) {
    super({ name: 'people', size, create: () => new Person() });
  }

  override populate(): void {
    super.populate();
    const people = [...this.members];
    connectSmallWorld(this.network, people, this.setup.k, this.setup.rewire, this.random);
    for (const person of people) person.contacts = this.network.neighbors(person);
    const order = this.random.shuffle([...people]);
    for (const person of order.slice(0, Math.min(this.setup.initialInfected, order.length))) {
      person.health = person.nextHealth = Health.Infected;
      person.everInfected = true;
    }
  }
}

const stateColor = (person: Person): number =>
  person.health === Health.Infected
    ? colors.red
    : person.health === Health.Recovered
      ? colors.green
      : colors.blue;

export const epidemic = defineModel({
  name: 'Epidemic (SIR on a small-world network)',
  description:
    'A susceptible-infected-recovered epidemic spreading over a Watts-Strogatz small-world network (Watts and Strogatz, Nature, 1998) with the compartmental logic of Kermack and McKendrick (1927). Each susceptible person is infected with probability 1 - (1 - transmission)^n, where n is the number of infected neighbors; infected people recover after a fixed period and are immune, permanently or for a limited time. Updating is synchronous, so results do not depend on the order of agents. A few random shortcuts make the outbreak far faster than on a pure ring.',
  parameters,
  build(sim) {
    const p = sim.parameters;
    const people = sim.addScape(new Population(p, p.population));

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
            if (infected > 0 && people.random.chance(1 - Math.pow(1 - p.transmission, infected))) {
              person.nextHealth = Health.Infected;
            }
            break;
          }
          case Health.Infected:
            if (person.timer + 1 >= p.infectiousPeriod) person.nextHealth = Health.Recovered;
            break;
          case Health.Recovered:
            if (p.immunityPeriod > 0 && person.timer + 1 >= p.immunityPeriod) {
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

    sim.data.count(people, 'susceptible', (a) => a.health === Health.Susceptible);
    sim.data.count(people, 'infected', (a) => a.health === Health.Infected);
    sim.data.count(people, 'recovered', (a) => a.health === Health.Recovered);
    sim.data.count(people, 'everInfected', (a) => a.everInfected);

    sim.observe({
      stepped(s) {
        if (s.data.latest('infected') === 0) s.stop('no one is infected');
      },
    });
  },
  views(sim) {
    const people = sim.scape('people') as unknown as Population;
    const palette = {
      susceptible: colors.blue,
      infected: colors.red,
      recovered: colors.green,
    };
    const series = ['susceptible', 'infected', 'recovered'];
    return [
      networkView<Person>({
        title: 'Contact network',
        nodes: people,
        network: people.network,
        color: stateColor,
        layout: 'circle',
      }),
      timeSeriesView({ title: 'S, I and R over time', series, colors: palette, yMin: 0 }),
      barsView({ title: 'S, I and R now', series, colors: palette }),
    ];
  },
});
