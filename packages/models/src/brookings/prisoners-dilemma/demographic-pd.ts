// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.pd.PD2D, PD2DCellular, PD2DDemo, PD2DSmallWorld, Player.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import {
  barsView,
  bool,
  type Cell,
  colors,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  Scape,
  timeSeriesView,
  type ParameterValues,
  type Simulation,
  type ViewSpec,
  wireSmallWorld,
} from '@metascape/engine';

/** The cooperation strategy symbol (legacy `PD2D.COOPERATE`). */
export const COOPERATE = 0;
/** The defection strategy symbol (legacy `PD2D.DEFECT`). */
export const DEFECT = 1;

/** Defaults that differ between the models of the family. */
export interface PdDefaults {
  readonly latticeWidth: number;
  readonly latticeHeight: number;
  readonly payoffCC?: number;
  readonly payoffCD?: number;
  readonly payoffDC?: number;
  readonly payoffDD?: number;
  readonly fissionWealth?: number;
  readonly mutationRate?: number;
}

/** The public bean properties of legacy `PD2D`, as parameters. */
export function pdParameters(d: PdDefaults) {
  return {
    numberOfAgents: int(100, {
      min: 0,
      max: 2000,
      label: 'Number of agents',
      description: 'Initial population. Agents that find no free cell are removed at once.',
    }),
    latticeWidth: int(d.latticeWidth, {
      min: 2,
      max: 100,
      label: 'Lattice width',
      description:
        'Width of the lattice. (In the legacy model changing this after creation had no effect.)',
    }),
    latticeHeight: int(d.latticeHeight, {
      min: 2,
      max: 100,
      label: 'Lattice height',
      description:
        'Height of the lattice. (In the legacy model changing this after creation had no effect.)',
    }),
    payoffCC: int(d.payoffCC ?? 2, {
      min: -100,
      max: 100,
      label: 'Payoff C vs C',
      description: 'Payoff to each player when both cooperate.',
    }),
    payoffDC: int(d.payoffDC ?? 6, {
      min: -100,
      max: 100,
      label: 'Payoff D vs C',
      description: 'Payoff to a defector against a cooperator (the temptation).',
    }),
    payoffCD: int(d.payoffCD ?? -6, {
      min: -100,
      max: 100,
      label: 'Payoff C vs D',
      description: 'Payoff to a cooperator against a defector (the sucker).',
    }),
    payoffDD: int(d.payoffDD ?? -5, {
      min: -100,
      max: 100,
      label: 'Payoff D vs D',
      description: 'Payoff to each player when both defect.',
    }),
    fissionWealth: int(d.fissionWealth ?? 11, {
      min: 0,
      max: 1000,
      label: 'Fission wealth',
      description:
        'A player with more wealth than this clones an offspring onto a neighboring site.',
    }),
    inheritedWealth: int(6, {
      min: 0,
      max: 1000,
      label: 'Inherited wealth',
      description: 'Wealth passed from parent to child. (Legacy property name: inheiritedWealth.)',
    }),
    initialWealth: int(6, {
      min: 0,
      max: 1000,
      label: 'Initial wealth',
      description: 'Wealth of each initial player.',
    }),
    mutationRate: real(d.mutationRate ?? 0.1, {
      min: 0,
      max: 1,
      label: 'Mutation rate',
      description:
        'Chance that a child draws its strategy at random instead of copying its parent.',
    }),
    deathAge: int(100, {
      min: 0,
      max: 10000,
      label: 'Death age',
      description: 'Players older than this die.',
    }),
    dieAtDeathAge: bool(true, {
      label: 'Die at death age',
      description:
        'Kept from the legacy model, where it was never read: players always die of old age.',
    }),
  } as const;
}

/** The parameter schema type shared by the family. */
export type PdParameters = ReturnType<typeof pdParameters>;
/** The resolved parameter values of the family. */
export type PdParams = ParameterValues<PdParameters>;

/** What the players of one run share: parameters, the lattice and the population. */
export class PdWorld<P extends PdParams = PdParams> {
  #players: Scape<PdPlayer> | undefined;

  constructor(
    readonly params: P,
    readonly grid: GridScape<Cell>,
  ) {}

  /** The population scape. */
  get players(): Scape<PdPlayer> {
    if (!this.#players) throw new Error('The players scape has not been set');
    return this.#players;
  }

  set players(scape: Scape<PdPlayer>) {
    this.#players = scape;
  }
}

/** A player of the demographic Prisoner's Dilemma (legacy `Player`). */
export class PdPlayer extends Occupant {
  /** The current strategy; fixed for life in the demographic game. */
  strategy: number = COOPERATE;
  age = 0;
  wealth = 6;
  /** True for a child created by fission, which is placed and set up by its parent. */
  readonly inherited: boolean;

  constructor(
    readonly world: PdWorld,
    parent?: PdPlayer,
  ) {
    super();
    this.inherited = parent !== undefined;
    if (parent) {
      this.strategy = parent.strategy;
      this.age = parent.age;
      this.wealth = parent.wealth;
    }
  }

  /** Initial population: random strategy, random age up to the death age, initial wealth. */
  override initialize(): void {
    if (this.inherited) return;
    this.strategy = this.random.chance() ? COOPERATE : DEFECT;
    this.age = this.random.int(0, this.world.params.deathAge + 1);
    this.wealth = this.world.params.initialWealth;
  }

  /** Initial rule: a random unoccupied cell, or removal if there is none. */
  moveToRandomLocation(): void {
    if (this.inherited) return;
    const cell = this.world.grid.randomAvailableCell();
    if (cell) this.moveTo(cell);
    else this.die();
  }

  /** Steps to a random neighboring cell if, and only if, that cell is unoccupied. */
  randomWalk(): void {
    const cell = this.cell;
    if (!cell || cell.neighbors.length === 0) return;
    const candidate = this.random.pick(cell.neighbors);
    if (candidate.isAvailable) this.moveTo(candidate);
  }

  /** A random neighbor that is occupied, if any. */
  randomNeighborOccupant(): PdPlayer | undefined {
    const found = this.neighboringOccupants();
    return found.length === 0 ? undefined : (this.random.pick(found) as PdPlayer);
  }

  /** Plays one random occupied neighbor. */
  playRandomNeighbor(): void {
    const other = this.randomNeighborOccupant();
    if (other) this.play(other);
  }

  /** One round of the game; payoffs accumulate as wealth on both sides. */
  play(partner: PdPlayer): void {
    const p = this.world.params;
    if (this.strategy === COOPERATE) {
      if (partner.strategy === COOPERATE) {
        this.wealth += p.payoffCC;
        partner.wealth += p.payoffCC;
      } else {
        this.wealth += p.payoffCD;
        partner.wealth += p.payoffDC;
      }
    } else if (partner.strategy === COOPERATE) {
      this.wealth += p.payoffDC;
      partner.wealth += p.payoffCD;
    } else {
      this.wealth += p.payoffDD;
      partner.wealth += p.payoffDD;
    }
  }

  /** Whether the player is rich enough to fission. */
  fissionCondition(): boolean {
    return this.wealth > this.world.params.fissionWealth;
  }

  /** A random unoccupied neighboring cell, if any. */
  randomAvailableNeighbor(): Cell | undefined {
    const cell = this.cell;
    if (!cell) return undefined;
    const free = cell.neighbors.filter((n) => n.isAvailable);
    return free.length === 0 ? undefined : this.random.pick(free);
  }

  /** Clones an offspring onto a free neighboring cell, passing on wealth and (mostly) strategy. */
  fission(): void {
    const target = this.randomAvailableNeighbor();
    if (!target) return;
    const p = this.world.params;
    const child = new PdPlayer(this.world, this);
    this.world.players.add(child);
    child.moveTo(target);
    child.wealth = p.inheritedWealth;
    child.age = 0;
    this.wealth -= p.inheritedWealth;
    if (this.random.float() < p.mutationRate) {
      child.strategy = this.random.chance() ? COOPERATE : DEFECT;
    } else {
      child.strategy = this.strategy;
    }
  }

  /** Housekeeping: one year older. */
  update(): void {
    this.age++;
  }

  /** Dies when broke or older than the death age. */
  death(): void {
    if (this.wealth < 0 || this.age > this.world.params.deathAge) this.die();
  }
}

/** Which lattice a demographic model runs on. */
export type PdLattice = 'vonNeumann' | 'smallWorld';

/** Variations among the demographic models. */
export interface PdBuildOptions {
  readonly lattice: PdLattice;
  /** Whether age statistics are collected (not in `PD2DDemo`). */
  readonly ageStats: boolean;
}

/** Builds one demographic Prisoner's Dilemma world: lattice, players, rules, statistics, views. */
export function buildDemographicPd(sim: Simulation<PdParameters>, options: PdBuildOptions): void {
  const params: PdParams = sim.parameters;
  const small = options.lattice === 'smallWorld';
  const grid = new GridScape({
    name: 'Environment',
    width: params.latticeWidth,
    height: params.latticeHeight,
    // Ascape's Array2DSmallWorld: bounded Moore lattice, rewired by wireSmallWorld.
    wrap: !small,
    neighborhood: small ? 'moore' : 'vonNeumann',
  });
  sim.addScape(grid);
  if (small) sim.setup(() => wireSmallWorld(grid));

  const world = new PdWorld(params, grid);
  const players = sim.addScape(
    new Scape<PdPlayer>({
      name: 'Players',
      size: params.numberOfAgents,
      create: () => new PdPlayer(world),
      schedule: 'byRule',
      order: 'shuffled',
    }),
  );
  world.players = players;

  players.addInitialRule('Move To Random Location', (p) => p.moveToRandomLocation());
  players.addRule('Random Walk', (p) => p.randomWalk());
  players.addRule('Play Random Neighbor', (p) => p.playRandomNeighbor());
  players.addRule('Fissioning', (p) => {
    if (p.fissionCondition()) p.fission();
  });
  players.addRule('Update', (p) => p.update());
  players.addRule('Death', (p) => p.death());

  addPdStatistics(sim, players, options.ageStats);

  sim.addView(
    gridView<Cell, PdPlayer>({
      title: "Player's View",
      grid: grid as GridScape<Cell>,
      background: colors.white,
      occupantColor: strategyColor,
      occupantShape: 'circle',
    }),
  );
  for (const view of pdCharts()) sim.addView(view);
}

/** Blue for cooperators, red for defectors (the legacy colour feature). */
export function strategyColor(player: PdPlayer): number {
  return player.strategy === COOPERATE ? colors.blue : colors.red;
}

/** The statistics of the legacy `PD2D` (counts, wealth and age by strategy). */
export function addPdStatistics(sim: Simulation, players: Scape<PdPlayer>, ages: boolean): void {
  const coop = (p: PdPlayer): boolean => p.strategy === COOPERATE;
  const defect = (p: PdPlayer): boolean => p.strategy === DEFECT;
  sim.data.count(players, 'Cooperate', coop);
  sim.data.count(players, 'Defect', defect);
  sim.data.measure(players, 'Defect Wealth', (p) => p.wealth, { when: defect });
  sim.data.measure(players, 'Cooperate Wealth', (p) => p.wealth, { when: coop });
  sim.data.measure(players, 'Overall Wealth', (p) => p.wealth);
  if (ages) {
    sim.data.measure(players, 'Cooperate Age', (p) => p.age, { when: coop });
    sim.data.measure(players, 'Defect Age', (p) => p.age, { when: defect });
    sim.data.measure(players, 'Overall Age', (p) => p.age);
  }
}

/** The legacy chart of cooperators against defectors, as time series and bars. */
export function pdCharts(): ViewSpec[] {
  const sides = { Cooperate: colors.blue, Defect: colors.red };
  return [
    timeSeriesView({
      title: 'Population by strategy',
      series: ['Cooperate', 'Defect'],
      colors: sides,
      yMin: 0,
    }),
    barsView({
      title: 'Cooperators and defectors',
      series: ['Cooperate', 'Defect'],
      colors: sides,
    }),
  ];
}
