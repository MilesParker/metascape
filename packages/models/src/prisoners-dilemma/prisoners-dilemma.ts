// SPDX-License-Identifier: EPL-2.0
import {
  barsView,
  bool,
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** A fixed-strategy player of the Demographic Prisoner's Dilemma. */
export class Player extends Occupant {
  /** The strategy is inherited (with possible mutation) and never changes. */
  readonly cooperator: boolean;
  wealth: number;
  age = 0;

  constructor(cooperator: boolean, wealth: number) {
    super();
    this.cooperator = cooperator;
    this.wealth = wealth;
  }

  /** Places an initial player on a random empty cell; offspring are placed by their parent. */
  override initialize(): void {
    if (this.cell) return;
    const cell = (this.sim.scape('grid') as GridScape).randomAvailableCell();
    if (cell) this.moveTo(cell);
    else this.die();
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
    description: 'Agents die of old age after this many ticks; 0 means they never do.',
  }),
  moves: bool(true, { label: 'Agents move', description: 'Whether agents move before playing.' }),
} as const;

/** The free neighbors of a cell, picked from without allocating. */
function randomFreeNeighbor(cell: Cell, pick: (n: number) => number): Cell | undefined {
  const neighbors = cell.neighbors;
  let free = 0;
  for (let i = 0; i < neighbors.length; i++) if (neighbors[i]!.isAvailable) free++;
  if (free === 0) return undefined;
  let choice = pick(free);
  for (let i = 0; i < neighbors.length; i++) {
    if (!neighbors[i]!.isAvailable) continue;
    if (choice-- === 0) return neighbors[i];
  }
  return undefined;
}

export const prisonersDilemma = defineModel({
  name: "Demographic Prisoner's Dilemma",
  description:
    "Joshua Epstein's Demographic Prisoner's Dilemma (Zones of Cooperation in Demographic Prisoner's Dilemma, Complexity, 1998). Fixed-strategy cooperators and defectors wander a torus, play a Prisoner's Dilemma with each neighbor, die when their wealth is negative or they are old, and reproduce when rich. Because play is local and offspring appear next to their parents, clusters of cooperators can survive and grow even though defection pays better in any single encounter.",
  parameters,
  build(sim) {
    const p = sim.parameters;
    const grid = sim.addScape(
      new GridScape({
        name: 'grid',
        width: p.size,
        height: p.size,
        wrap: true,
        neighborhood: 'vonNeumann',
      }),
    );
    const initial = Math.min(p.initialAgents, p.size * p.size);
    const players: Scape<Player> = sim.addScape(
      new Scape<Player>({
        name: 'players',
        size: initial,
        create: () => new Player(players.random.chance(p.cooperatorShare), p.initialWealth),
      }),
    );

    const pickFree = (n: number): number => players.random.int(0, n);

    players.addRule({
      name: 'move and play',
      execute(player) {
        const here = player.cell;
        if (!here) return;
        if (p.moves) {
          const target = randomFreeNeighbor(here, pickFree);
          if (target) player.moveTo(target);
        }
        const cell = player.cell;
        if (!cell) return;
        const neighbors = cell.neighbors;
        for (let i = 0; i < neighbors.length; i++) {
          const other = neighbors[i]!.occupant as Player | undefined;
          if (!other) continue;
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
        if (player.wealth > p.birthThreshold && player.cell) {
          const target = randomFreeNeighbor(player.cell, pickFree);
          if (!target) return;
          const cooperator = players.random.chance(p.mutation)
            ? !player.cooperator
            : player.cooperator;
          player.wealth -= p.endowment;
          const child = players.add(new Player(cooperator, p.endowment));
          child.moveTo(target);
        }
      },
    });

    sim.data.count(players, 'cooperators', (a) => a.cooperator);
    sim.data.count(players, 'defectors', (a) => !a.cooperator);
    sim.data.measure(players, 'wealth', (a) => a.wealth, { statistics: ['mean'] });

    sim.observe({
      stepped(s) {
        if (players.size === 0) s.stop('extinct');
      },
    });

    const sides = {
      cooperators: colors.blue,
      defectors: colors.red,
    };
    sim.addView(
      gridView<Cell, Player>({
        title: 'Torus',
        grid,
        background: 0xffffff,
        occupantColor: (player) => (player.cooperator ? colors.blue : colors.red),
        occupantShape: 'square',
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Population by strategy',
        series: ['cooperators', 'defectors'],
        colors: sides,
        yMin: 0,
      }),
    );
    sim.addView(
      barsView({
        title: 'Cooperators and defectors',
        series: ['cooperators', 'defectors'],
        colors: sides,
      }),
    );
  },
});
