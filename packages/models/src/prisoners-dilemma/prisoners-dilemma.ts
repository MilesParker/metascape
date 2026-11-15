// SPDX-License-Identifier: EPL-2.0
import {
  Array2DVonNeumann,
  barsView,
  bool,
  CellOccupant,
  colors,
  defineModel,
  gridView,
  int,
  real,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
  type HostCell,
} from '@metascape/engine';

/** A fixed-strategy player of the Demographic Prisoner's Dilemma. */
export class Player extends CellOccupant {
  /** The strategy is inherited (with possible mutation) and never changes. */
  readonly cooperator: boolean;
  wealth: number;
  age = 0;

  constructor(cooperator: boolean, wealth: number, hostScape: Scape<HostCell>) {
    super();
    this.cooperator = cooperator;
    this.wealth = wealth;
    this.hostScape = hostScape;
  }

  /**
   * Places the player on a random empty cell of its host scape, or removes it
   * if there is none. Offspring are then moved next to their parent.
   */
  override initialize(): void {
    if (this.hostCell) return;
    this.moveToRandomLocation();
  }
}

const parameters = {
  size: int(30, { min: 3, max: 200, label: 'Grid size', description: 'Side of the square torus.' }),
  initialAgents: int(100, {
    min: 1,
    max: 2000,
    label: 'Initial agents',
    description: 'Number of agents at the start (capped at the number of cells).',
  }),
  cooperatorShare: real(0.5, {
    min: 0,
    max: 1,
    label: 'Initial share of cooperators',
    description: 'Probability that an initial agent is a cooperator.',
  }),
  initialWealth: real(6, {
    min: 0,
    max: 100,
    label: 'Initial wealth',
    description: 'Wealth of each initial agent.',
  }),
  temptation: real(6, {
    min: -100,
    max: 100,
    label: 'T (temptation)',
    description: 'Payoff to a defector against a cooperator.',
  }),
  reward: real(5, {
    min: -100,
    max: 100,
    label: 'R (reward)',
    description: 'Payoff to each of two cooperators.',
  }),
  punishment: real(-5, {
    min: -100,
    max: 100,
    label: 'P (punishment)',
    description: 'Payoff to each of two defectors.',
  }),
  sucker: real(-6, {
    min: -100,
    max: 100,
    label: 'S (sucker)',
    description: 'Payoff to a cooperator against a defector.',
  }),
  birthThreshold: real(10, {
    min: 0,
    max: 1000,
    label: 'Birth threshold',
    description: 'An agent with more wealth than this reproduces.',
  }),
  endowment: real(6, {
    min: 0,
    max: 100,
    label: 'Endowment',
    description: 'Wealth passed from a parent to its child.',
  }),
  mutation: real(0.02, {
    min: 0,
    max: 1,
    label: 'Mutation',
    description: 'Probability that a child has the opposite strategy to its parent.',
  }),
  maxAge: int(100, {
    min: 0,
    max: 10000,
    label: 'Maximum age',
    description: 'Agents die of old age after this many periods; 0 means they never do.',
  }),
  moves: bool(true, { label: 'Agents move', description: 'Whether agents move before playing.' }),
} as const;

export const prisonersDilemma = defineModel({
  name: "Demographic Prisoner's Dilemma",
  summary:
    'Cooperators and defectors play, breed and die on a lattice; clusters of cooperation can survive.',
  tags: ['game theory', 'cooperation'],
  description:
    "Joshua Epstein's Demographic Prisoner's Dilemma (Zones of Cooperation in Demographic Prisoner's Dilemma, Complexity, 1998). Fixed-strategy cooperators and defectors wander a torus, play a Prisoner's Dilemma with each neighbor, die when their wealth is negative or they are old, and reproduce when rich. Because play is local and offspring appear next to their parents, clusters of cooperators can survive and grow even though defection pays better in any single encounter.",
  parameters,
  build(root) {
    const p = root.parameters;
    const grid = root.add(
      new Scape<HostCell>({
        name: 'grid',
        space: new Array2DVonNeumann(),
        extent: [p.size, p.size],
        periodic: true,
      }),
    );
    const initial = Math.min(p.initialAgents, p.size * p.size);
    const players: Scape<Player> = root.add(
      new Scape<Player>({
        name: 'players',
        size: initial,
        prototypeAgent: () =>
          new Player(players.random.chance(p.cooperatorShare), p.initialWealth, grid),
      }),
    );

    players.addRule({
      name: 'move and play',
      execute(player) {
        if (!player.hostCell) return;
        if (p.moves) player.randomWalkAvailable();
        for (const other of player.neighbors) {
          let mine: number;
          let theirs: number;
          if (player.cooperator) {
            if (other.cooperator) mine = theirs = p.reward;
            else [mine, theirs] = [p.sucker, p.temptation];
          } else if (other.cooperator) {
            [mine, theirs] = [p.temptation, p.sucker];
          } else {
            mine = theirs = p.punishment;
          }
          player.wealth += mine;
          other.wealth += theirs;
        }
      },
      // Deaths and births are settled once everyone has played, so that a
      // neighbor's payoff from a later game still counts before it is judged.
      update(player) {
        player.age++;
        if (player.wealth < 0 || (p.maxAge > 0 && player.age > p.maxAge)) {
          player.die();
          return;
        }
        if (player.wealth > p.birthThreshold && player.hostCell) {
          const target = player.hostCell.findRandomAvailableNeighbor(player.random);
          if (!target) return;
          const cooperator = players.random.chance(p.mutation)
            ? !player.cooperator
            : player.cooperator;
          player.wealth -= p.endowment;
          const child = players.add(new Player(cooperator, p.endowment, grid));
          child.moveTo(target);
        }
      },
    });

    players.addStatCollector(stat.count('cooperators', (a) => a.cooperator));
    players.addStatCollector(stat.count('defectors', (a) => !a.cooperator));
    players.addStatCollector(stat.measure('wealth', (a) => a.wealth, { statistics: ['mean'] }));

    root.add(new Scape({ name: 'extinction', space: new Singleton() })).addRule(
      'stop when extinct',
      () => {
        if (players.size === 0) root.stop('extinct');
      },
      { randomExecution: false, causesRemoval: false },
    );

    const sides = {
      cooperators: colors.blue,
      defectors: colors.red,
    };
    grid.addView(
      gridView<HostCell, Player>({
        title: 'Torus',
        scape: grid,
        background: 0xffffff,
        legend: [
          { color: colors.blue, label: 'Cooperator', mark: 'agent' },
          { color: colors.red, label: 'Defector', mark: 'agent' },
        ],
        occupantColor: (player) => (player.cooperator ? colors.blue : colors.red),
        occupantShape: 'square',
      }),
    );
    players.addView(
      timeSeriesView({
        title: 'Population by strategy',
        series: ['cooperators', 'defectors'],
        colors: sides,
        yMin: 0,
      }),
    );
    players.addView(
      barsView({
        title: 'Cooperators and defectors',
        series: ['cooperators', 'defectors'],
        colors: sides,
      }),
    );
  },
});
