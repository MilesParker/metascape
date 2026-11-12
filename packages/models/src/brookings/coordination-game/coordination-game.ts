// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.manual.model1 to model5, CoordinationGame and CoordinationGamePlayer.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  barsView,
  colors,
  GridScape,
  gridView,
  Network,
  networkView,
  Occupant,
  Scape,
  timeSeriesView,
  type Cell,
  type Simulation,
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
  readonly lattice: GridScape<Cell>;
  players: Scape<Player>;
}

/** A player of the coordination game, standing on a lattice cell. */
export class Player extends Occupant {
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
    if (this.#spawned || this.cell) return;
    const cell = this.#context.lattice.randomAvailableCell();
    if (cell) this.moveTo(cell);
    else this.die();
  }

  doRandom(): void {
    this.color = this.random.int(0, 2) > 0 ? 'red' : 'blue';
  }

  /** RANDOM_WALK_RULE: step to a random neighbor cell, if it is empty. */
  randomWalk(): void {
    const cell = this.cell;
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
    const cell = this.cell;
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

/** One pass of a rule over the players, in the visiting order the legacy rule asks for. */
interface Pass {
  readonly random: boolean;
  readonly run: (player: Player) => void;
}

/**
 * Ascape runs a scape by rule, and each rule shuffles the visiting order
 * afresh if it is a "random execution" rule and keeps the creation order
 * otherwise. The engine has one order per scape, so the passes are run by a
 * single driver agent in its own scape, after the players' scape.
 */
function addPasses(sim: Simulation, players: Scape<Player>, passes: readonly Pass[]): void {
  const driver = sim.addScape(
    new Scape<Agent>({ name: 'Schedule', size: 1, create: () => new Agent() }),
  );
  driver.addRule('Rules by rule order', () => {
    for (const pass of passes) {
      const order = [...players.members];
      if (pass.random) players.random.shuffle(order);
      for (const player of order) if (player.alive) pass.run(player);
    }
  });
}

/** Builds one step of the tutorial. */
export function buildCoordinationGame(
  sim: Simulation,
  parameters: GameParameters,
  config: StepConfig,
): void {
  const lattice = sim.addScape(
    new GridScape({
      name: 'Lattice',
      width: 30,
      height: 30,
      wrap: true,
      neighborhood: 'vonNeumann',
    }),
  );
  const context: GameContext = {
    parameters,
    config,
    lattice,
    players: undefined as unknown as Scape<Player>,
  };
  const players: Scape<Player> = sim.addScape(
    new Scape<Player>({
      name: 'Players',
      size: parameters.nPlayers,
      create: () => new Player(context),
    }),
  );
  context.players = players;

  const passes: Pass[] = [{ random: true, run: (p) => p.randomWalk() }];
  if (config.revision !== 'none') passes.push({ random: false, run: (p) => p.update() });
  passes.push({ random: true, run: (p) => p.playRandomNeighbor() });
  if (config.demography) passes.push({ random: false, run: (p) => p.metabolism() });
  addPasses(sim, players, passes);

  // The legacy initial rule SetNewNetwork: four players drawn at random, with repetition, possibly oneself.
  const network = new Network<Player>({ directed: true });
  if (config.friends) {
    sim.setup(() => {
      for (const player of players.members) {
        for (let i = 0; i < FRIENDS_SIZE; i++)
          player.friends.push(players.random.pick(players.members));
        for (const friend of player.friends) network.connect(player, friend);
      }
    });
  }

  sim.data.count(players, 'reds', (p) => p.color === 'red');
  sim.data.count(players, 'blues', (p) => p.color === 'blue');
  const chart = ['reds', 'blues'];
  if (config.payoff) {
    sim.data.measure(players, 'payoff', (p) => p.totalScore * 10, { statistics: ['mean'] });
    chart.push('payoff.mean');
  }

  sim.addView(
    gridView<Cell, Player>({
      title: 'Lattice',
      grid: lattice,
      background: colors.green,
      cellColor: () => colors.green,
      occupantColor: (p) => (p.color === 'red' ? colors.red : colors.blue),
    }),
  );
  if (config.friends) {
    sim.addView(
      networkView<Player>({
        title: 'Friends',
        nodes: players,
        network,
        color: (p) => (p.color === 'red' ? colors.red : colors.blue),
      }),
    );
  }
  sim.addView(
    timeSeriesView({
      title: 'Players',
      series: chart,
      colors: { reds: colors.red, blues: colors.blue, 'payoff.mean': colors.black },
      yMin: 0,
    }),
  );
  sim.addView(
    barsView({
      title: 'Reds and blues',
      series: ['reds', 'blues'],
      colors: { reds: colors.red, blues: colors.blue },
    }),
  );
}
