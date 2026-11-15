// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.manual.model1 to model5, CoordinationGame and CoordinationGamePlayer.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Array2DVonNeumann,
  barsView,
  CellOccupant,
  colors,
  gridView,
  type HostCell,
  Graph,
  networkView,
  type RootScape,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** The two colours (conventions) a player can follow. */
export type Hue = 'red' | 'blue';

/** How a player revises its colour in its update rule. */
export type Revision = 'none' | 'imitate-neighbors' | 'imitate-friends' | 'best-reply';

/** What distinguishes the five tutorial steps. */
export interface StepConfig {
  /** The update rule, if the step has one. */
  readonly revision: Revision;
  /** Players reproduce and die by their recent scores (step 4). */
  readonly demography: boolean;
  /** Players have a fixed random network of friends (step 5). */
  readonly friends: boolean;
  /** Record the payoff statistic and chart (steps 2 to 5). */
  readonly payoff: boolean;
}

/** The parameter values a run reads. Unused ones keep their legacy defaults. */
export interface GameParameters {
  readonly nPlayers: number;
  readonly redScore: number;
  readonly blueScore: number;
  readonly error: number;
  readonly turnsToDie: number;
  readonly repScore: number;
  readonly minDieScore: number;
}

/** Number of plays that the scores and recent partners remember. */
export const MEMORY = 5;
/** Size of the friends network of step 5 (a public field in the legacy model, fixed at 4). */
export const FRIENDS_SIZE = 4;

/** Shared, per-run context that players read. */
export interface GameContext {
  readonly parameters: GameParameters;
  readonly config: StepConfig;
  readonly lattice: Scape<HostCell>;
  players: Scape<Player>;
}

/** A player of the coordination game, standing on a lattice cell. */
export class Player extends CellOccupant {
  color: Hue = 'red';
  totalScore = 0;
  recentPlays: number[] = new Array<number>(MEMORY).fill(0);
  count = 0;
  totalReds = 0;
  totalBlues = 0;
  recentPartners: (Hue | undefined)[] = new Array<Hue | undefined>(MEMORY).fill(undefined);
  friends: Player[] = [];
  readonly #context: GameContext;
  readonly #spawned: boolean;

  constructor(context: GameContext, spawned = false) {
    super();
    this.#context = context;
    this.#spawned = spawned;
  }

  override initialize(): void {
    this.doRandom();
    this.recentPlays = new Array<number>(MEMORY).fill(0);
    this.recentPartners = new Array<Hue | undefined>(MEMORY).fill(undefined);
    this.friends = [];
    // The legacy initial rule MOVE_RANDOM_LOCATION_RULE; offspring are placed by their parent.
    if (this.#spawned || this.hostCell) return;
    const cell = this.#context.lattice.findRandom((cell) => cell.isAvailable);
    if (cell) this.moveTo(cell);
    else this.die();
  }

  doRandom(): void {
    this.color = this.random.int(0, 2) > 0 ? 'red' : 'blue';
  }

  /** RANDOM_WALK_RULE: step to a random neighbor cell, if it is empty. */
  override randomWalk(): void {
    const cell = this.hostCell;
    if (!cell) return;
    const candidate = this.random.pick(cell.neighbors);
    if (candidate.isAvailable) this.moveTo(candidate);
  }

  /** PLAY_RANDOM_NEIGHBOR_RULE: play one randomly chosen neighboring occupant. */
  playRandomNeighbor(): void {
    const neighbors = this.neighboringOccupants() as Player[];
    if (neighbors.length === 0) return;
    this.play(this.random.pick(neighbors));
  }

  play(partner: Player): void {
    const p = this.#context.parameters;
    let score = 0;
    if (partner.color === this.color && this.color === 'blue') score = p.blueScore;
    else if (partner.color === this.color && this.color === 'red') score = p.redScore;
    this.count += 1;
    this.#updateRecentPlays(score);
    if (this.#context.config.revision === 'best-reply') this.#updateRecentPartners(partner.color);
  }

  #updateRecentPlays(score: number): void {
    this.totalScore = 0;
    for (let i = 0; i < this.recentPlays.length - 1; i++) {
      this.recentPlays[i] = this.recentPlays[i + 1] as number;
      this.totalScore += this.recentPlays[i] as number;
    }
    this.recentPlays[this.recentPlays.length - 1] = score;
    this.totalScore += score;
  }

  #updateRecentPartners(hue: Hue): void {
    this.totalReds = 0;
    this.totalBlues = 0;
    for (let i = 0; i < this.recentPartners.length - 1; i++) {
      this.recentPartners[i] = this.recentPartners[i + 1];
      if (this.recentPartners[i] === 'red') this.totalReds++;
      else if (this.recentPartners[i] === 'blue') this.totalBlues++;
    }
    this.recentPartners[this.recentPartners.length - 1] = hue;
    if (hue === 'red') this.totalReds++;
    if (hue === 'blue') this.totalBlues++;
  }

  /** UPDATE_RULE: revise the colour, once enough plays have been made. */
  update(): void {
    const p = this.#context.parameters;
    this.count++;
    if (this.count <= this.recentPlays.length) return;
    switch (this.#context.config.revision) {
      case 'none':
        return;
      case 'imitate-neighbors':
        if (this.random.int(0, 101) >= p.error) {
          this.#imitate(this.neighboringOccupants() as Player[]);
        } else this.doRandom();
        return;
      case 'imitate-friends':
        if (this.random.int(0, 101) >= p.error) this.#imitate(this.friends);
        else this.doRandom();
        return;
      case 'best-reply':
        if (this.random.int(0, 101) >= p.error) {
          const blue = this.totalBlues * p.blueScore;
          const red = this.totalReds * p.redScore;
          if (red > blue) this.color = 'red';
          else if (blue > red) this.color = 'blue';
          else this.doRandom();
        } else this.doRandom();
        return;
    }
  }

  /** Adopt the colour of the best-scoring player who beats this one (the first such, if tied). */
  #imitate(others: readonly Player[]): void {
    let best = this.totalScore;
    for (const other of others) {
      if (other.totalScore > best) {
        best = other.totalScore;
        this.color = other.color;
      }
    }
  }

  /** METABOLISM_RULE of step 4: reproduce at exactly the reproduction score, or die when doing badly. */
  metabolism(): void {
    const p = this.#context.parameters;
    if (this.totalScore === p.repScore) {
      this.count = 0;
      this.#reproduce();
      for (let i = 0; i < this.recentPlays.length - 1; i++) this.recentPlays[i] = 0;
    } else if (this.totalScore <= p.minDieScore && this.count >= p.turnsToDie) {
      this.die();
    }
  }

  #reproduce(): void {
    const cell = this.hostCell;
    if (!cell) return;
    const free = cell.neighbors.filter((neighbor) => neighbor.isAvailable);
    if (free.length === 0) return;
    // The legacy clone copies the parent's score and count (0 here); initialize() gives fresh memories.
    const baby = new Player(this.#context, true);
    baby.totalScore = this.totalScore;
    baby.count = this.count;
    this.#context.players.add(baby);
    baby.color = this.color;
    baby.moveTo(this.random.pick(free));
  }
}

/** Builds one step of the tutorial. */
export function buildCoordinationGame(
  root: RootScape,
  parameters: GameParameters,
  config: StepConfig,
): void {
  const lattice = root.add(
    new Scape<HostCell>({
      name: 'Lattice',
      space: new Array2DVonNeumann<HostCell>(),
      extent: [30, 30],
      periodic: true,
    }),
  );
  const context: GameContext = {
    parameters,
    config,
    lattice,
    players: undefined as unknown as Scape<Player>,
  };
  const players: Scape<Player> = root.add(
    new Scape<Player>({
      name: 'Players',
      size: parameters.nPlayers,
      prototypeAgent: () => new Player(context),
      // As Ascape runs this scape: by rule, each random rule in a fresh random order and the
      // others in creation order.
      executionOrder: 'byRule',
      randomOrderPerRule: true,
    }),
  );
  context.players = players;

  players.addRule('Random Walk', (p) => p.randomWalk(), { causesRemoval: false });
  if (config.revision !== 'none') {
    players.addRule('Update', (p) => p.update(), { randomExecution: false, causesRemoval: false });
  }
  players.addRule('Play Random Neighbor', (p) => p.playRandomNeighbor(), { causesRemoval: false });
  if (config.demography) {
    players.addRule('Metabolism', (p) => p.metabolism(), { randomExecution: false });
  }

  // The legacy initial rule SetNewNetwork: four players drawn at random, with repetition, possibly oneself.
  // The friends, as a graph whose members are the players it links. It draws nothing
  // at random, so it shares the root's stream rather than forking one.
  const network = new Graph<Player>({ directed: true });
  if (config.friends) {
    root.add(new Scape<Player>({ name: 'Friends', space: network, randomStream: 'parent' }));
    players.addInitialRule(
      'Set New Network',
      (player) => {
        for (let i = 0; i < FRIENDS_SIZE; i++) {
          player.friends.push(players.random.pick(players.members));
        }
        for (const friend of player.friends) network.connect(player, friend);
      },
      { randomExecution: false },
    );
  }

  players.addStatCollector(stat.count('reds', (p) => p.color === 'red'));
  players.addStatCollector(stat.count('blues', (p) => p.color === 'blue'));
  const chart = ['reds', 'blues'];
  if (config.payoff) {
    players.addStatCollector(
      stat.measure('payoff', (p) => p.totalScore * 10, { statistics: ['mean'] }),
    );
    chart.push('payoff.mean');
  }

  root.addView(
    gridView<HostCell, Player>({
      title: 'Lattice',
      scape: lattice,
      background: colors.green,
      cellColor: () => colors.green,
      occupantColor: (p) => (p.color === 'red' ? colors.red : colors.blue),
      legend: [
        { color: colors.red, label: 'Plays red', mark: 'agent' },
        { color: colors.blue, label: 'Plays blue', mark: 'agent' },
        { color: colors.green, label: 'Empty site' },
      ],
    }),
  );
  if (config.friends) {
    root.addView(
      networkView<Player>({
        title: 'Friends',
        nodes: players,
        graph: network,
        color: (p) => (p.color === 'red' ? colors.red : colors.blue),
        legend: [
          { color: colors.red, label: 'Plays red' },
          { color: colors.blue, label: 'Plays blue' },
        ],
      }),
    );
  }
  root.addView(
    timeSeriesView({
      title: 'Players',
      series: chart,
      colors: { reds: colors.red, blues: colors.blue, 'payoff.mean': colors.black },
      yMin: 0,
    }),
  );
  root.addView(
    barsView({
      title: 'Reds and blues',
      series: ['reds', 'blues'],
      colors: { reds: colors.red, blues: colors.blue },
    }),
  );
}
