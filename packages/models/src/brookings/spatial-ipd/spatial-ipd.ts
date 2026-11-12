// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: name.milesparker.spatialipd.PD2DGA, PlayerGA, PD2DGA_CLOSEST, PD2DGA_FURTHEST, PD2DGA_PREFERENCE, PD2DGA_RANDOM.
// Original: Copyright 2000 Miles T. Parker.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import {
  type Cell,
  colors,
  GridScape,
  gridView,
  int,
  real,
  Scape,
  timeSeriesView,
  type ParameterValues,
  type Simulation,
} from '@metascape/engine';
import {
  addPdStatistics,
  COOPERATE,
  DEFECT,
  PdPlayer,
  pdParameters,
  PdWorld,
} from '../prisoners-dilemma/demographic-pd';
import { Chromosome } from './chromosome';

/** The parameters of `PD2DGA`: those of `PD2D` with the values `PD2DGA` sets, plus its own properties. */
export const gaParameters = {
  ...pdParameters({
    latticeWidth: 20,
    latticeHeight: 20,
    payoffCC: 3,
    payoffCD: -5,
    payoffDC: 6,
    payoffDD: -2,
    fissionWealth: 20,
    mutationRate: 0,
  }),
  memorySize: int(1, {
    min: 1,
    max: 4,
    label: 'Memory size',
    description:
      'Number of past rounds a strategy remembers; the chromosome has 4^m + 2m + 1 bits.',
  }),
  mutationProbability: real(0.01, {
    min: 0,
    max: 1,
    label: 'Mutation probability',
    description: 'Chance that each chromosome bit flips, every tick.',
  }),
  crossoverProbability: real(0.01, {
    min: 0,
    max: 1,
    label: 'Crossover probability',
    description:
      'Chance per tick that a player crosses its chromosome over with a random neighbor.',
  }),
  trackAll: int(0, {
    min: 0,
    max: 1,
    label: 'Track all partners',
    description:
      '1 keeps play histories in one table keyed by partner (shared by all players, as in the legacy code); 0 keeps one running history per player.',
  }),
} as const;

/** The parameter schema type of every model of the family. */
export type GaParameters = typeof gaParameters;
/** The resolved parameter values. */
export type GaParams = ParameterValues<GaParameters>;

/** A play history: the last rounds remembered, encoded as a number. */
export interface PlayRecord {
  played: number;
}

/** Shared state of one run. */
export class GaWorld extends PdWorld<GaParams> {
  /** Legacy quirk: one `Hashtable` shared by every player (it was cloned by reference). */
  readonly partnerRecords = new Map<PdPlayer, PlayRecord>();
}

/** A player with a chromosome strategy and memory (legacy `PlayerGA`). */
export class GaPlayer extends PdPlayer {
  strategies: Chromosome;
  playRecord: PlayRecord | undefined;
  totalCount = 0;
  cooperationCount = 0;
  tempTotalCount = 0;
  tempCooperationCount = 0;

  constructor(world: GaWorld, parent?: GaPlayer) {
    super(world, parent);
    this.strategies = new Chromosome(
      strategyBits(world.params.memorySize) + historyBits(world.params.memorySize) + 1,
    );
    if (parent) {
      // Legacy clone() copies fields shallowly, so the play record is shared with the parent.
      this.playRecord = parent.playRecord;
      this.totalCount = parent.totalCount;
      this.cooperationCount = parent.cooperationCount;
      this.tempTotalCount = parent.tempTotalCount;
      this.tempCooperationCount = parent.tempCooperationCount;
    }
  }

  get ga(): GaWorld {
    return this.world as GaWorld;
  }

  get memory(): number {
    return this.ga.params.memorySize;
  }

  override initialize(): void {
    if (this.inherited) return;
    super.initialize();
    this.strategies.randomize(this.random);
  }

  /** The response part of the chromosome as C and D. */
  strategyString(): string {
    return this.strategies.toString(strategyBits(this.memory));
  }

  /** The preference gene: 0 closest, 1 furthest. */
  get preference(): number {
    return this.strategies.encoding[this.strategies.encoding.length - 1]!;
  }

  get cooperateRatio(): number {
    return this.totalCount > 0 ? this.cooperationCount / this.totalCount : 0;
  }

  get defectRatio(): number {
    return this.totalCount > 0 ? (this.totalCount - this.cooperationCount) / this.totalCount : 0;
  }

  /** Chooses this round's move from the remembered history. */
  decidePlay(partner: GaPlayer): void {
    const m = this.memory;
    if (this.ga.params.trackAll === 1) this.playRecord = this.ga.partnerRecords.get(partner);
    if (!this.playRecord) {
      const record: PlayRecord = { played: 0 };
      const offset = strategyBits(m);
      for (let i = 0; i < historyBits(m); i++) {
        record.played += this.strategies.encoding[offset + i]! * 2 ** i;
      }
      this.playRecord = record;
      if (this.ga.params.trackAll === 1) this.ga.partnerRecords.set(partner, record);
    }
    this.strategy = this.strategies.encoding[this.playRecord.played]!;
  }

  /** Pushes this round onto the remembered history. */
  recordPlay(partner: GaPlayer): void {
    const record = this.playRecord!;
    const top = (this.memory - 1) * 2;
    record.played = Math.trunc(record.played / 4);
    record.played += this.strategy * 2 ** top;
    record.played += partner.strategy * 2 ** (top + 1);
    this.tempTotalCount++;
    if (this.strategy === COOPERATE) this.tempCooperationCount++;
  }

  override play(partner: PdPlayer): void {
    const other = partner as GaPlayer;
    this.decidePlay(other);
    other.decidePlay(this);
    super.play(partner);
    this.recordPlay(other);
    other.recordPlay(this);
  }

  playBegin(): void {
    this.tempTotalCount = 0;
    this.tempCooperationCount = 0;
  }

  playEnd(): void {
    if (this.tempTotalCount > 0) {
      this.totalCount = this.tempTotalCount;
      this.cooperationCount = this.tempCooperationCount;
    }
  }

  override playRandomNeighbor(): void {
    this.playBegin();
    super.playRandomNeighbor();
    this.playEnd();
  }

  /**
   * The occupied neighbor most (or least) like this player by Hamming
   * distance of chromosomes; ties are broken at random. Empty neighbors only
   * win when every neighbor is empty, in which case nobody is returned.
   */
  #neighborByDistance(similar: boolean): GaPlayer | undefined {
    const cell = this.cell;
    if (!cell) return undefined;
    let best = -Infinity;
    let ties: Cell[] = [];
    for (const n of cell.neighbors) {
      const other = n.occupant as GaPlayer | undefined;
      let value = -1;
      if (other) {
        const d = this.strategies.hammingDistance(other.strategies);
        value = similar ? 1 - d : d;
      }
      if (value > best) {
        best = value;
        ties = [n];
      } else if (value === best) {
        ties.push(n);
      }
    }
    if (ties.length === 0) return undefined;
    const chosen = ties.length === 1 ? ties[0]! : this.random.pick(ties);
    return chosen.occupant as GaPlayer | undefined;
  }

  /** Plays the neighbor whose chromosome is closest to this one. */
  playClosest(): void {
    this.playBegin();
    const other = this.#neighborByDistance(true);
    if (other) this.play(other);
    this.playEnd();
  }

  /** Plays the neighbor whose chromosome is furthest from this one. */
  playFurthest(): void {
    this.playBegin();
    const other = this.#neighborByDistance(false);
    if (other) this.play(other);
    this.playEnd();
  }

  /** Plays closest or furthest according to the preference gene. */
  playPreference(): void {
    this.playBegin();
    const other = this.#neighborByDistance(this.preference === 0);
    if (other) this.play(other);
    this.playEnd();
  }

  /** Clones an offspring onto a free neighbor; the child inherits the parent's chromosome. */
  override fission(): void {
    const target = this.randomAvailableNeighbor();
    if (!target) return;
    const p = this.world.params;
    const child = new GaPlayer(this.ga, this);
    this.world.players.add(child);
    // Legacy: the child is initialize()d, so its strategy starts random, then gets the parent's genes.
    child.strategy = this.random.chance() ? COOPERATE : DEFECT;
    child.strategies = this.strategies.copy();
    child.moveTo(target);
    child.wealth = p.inheritedWealth;
    child.age = this.random.int(0, p.deathAge + 1);
    this.wealth -= p.inheritedWealth;
    if (this.random.float() < p.mutationRate) {
      child.strategy = this.random.chance() ? COOPERATE : DEFECT;
    }
  }

  /** With the crossover probability, swaps a prefix of genes with a random occupied neighbor. */
  crossover(): void {
    if (this.random.float() < this.ga.params.crossoverProbability) {
      const n = this.randomNeighborOccupant() as GaPlayer | undefined;
      if (n) {
        this.strategies.crossover(
          n.strategies,
          this.random.int(0, this.strategies.encoding.length),
        );
      }
    }
  }

  /** Flips each gene with the mutation probability. */
  mutation(): void {
    this.strategies.mutate(this.random, this.ga.params.mutationProbability);
  }
}

/** Number of response bits for a memory size. */
export function strategyBits(memory: number): number {
  return 4 ** memory;
}

/** Number of default-history bits for a memory size. */
export function historyBits(memory: number): number {
  return memory * 2;
}

/** The play rules a variant switches on, besides the always-on rules. */
export type PlayRule = 'random' | 'closest' | 'furthest' | 'preference';

/** Variations among the models of the family. */
export interface GaBuildOptions {
  /** Which play rules are selected. */
  readonly plays: readonly PlayRule[];
  /** Stop the run when the population is extinct (`PD2DGAMultipleTo`). */
  readonly stopWhenExtinct?: boolean;
  /** Add the closest/furthest chart (`PD2DGA_PREFERENCE`). */
  readonly closenessChart?: boolean;
}

/** A deterministic colour for a strategy string (the legacy view drew a random colour per genome). */
export function genomeColor(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  const hue = ((hash >>> 0) % 360) / 60;
  const c = 0.7;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(hue) % 6]!;
  const m = 0.25;
  return (
    (Math.round((r! + m) * 255) << 16) |
    (Math.round((g! + m) * 255) << 8) |
    Math.round((b! + m) * 255)
  );
}

/** Builds one spatial iterated Prisoner's Dilemma world. */
export function buildSpatialIpd(sim: Simulation<GaParameters>, options: GaBuildOptions): void {
  const params: GaParams = sim.parameters;
  const grid = sim.addScape(
    new GridScape({
      name: 'Environment',
      width: params.latticeWidth,
      height: params.latticeHeight,
      wrap: true,
      neighborhood: 'vonNeumann',
    }),
  );
  const world = new GaWorld(params, grid);
  const players = sim.addScape(
    new Scape<GaPlayer>({
      name: 'Players',
      size: params.numberOfAgents,
      create: () => new GaPlayer(world),
      // PD2DGA switches the players to agent order.
      schedule: 'byAgent',
      order: 'shuffled',
    }),
  );
  world.players = players;

  const on = (play: PlayRule): boolean => options.plays.includes(play);
  const rule = (name: string, enabled: boolean, execute: (p: GaPlayer) => void): void => {
    players.addRule(name, execute);
    players.rules[players.rules.length - 1]!.enabled = enabled;
  };
  // The order is that of the legacy rule list: Player's rules, then PlayerGA's.
  players.addInitialRule('Move To Random Location', (p) => p.moveToRandomLocation());
  rule('Random Walk', true, (p) => p.randomWalk());
  rule('Play Random Neighbor', on('random'), (p) => p.playRandomNeighbor());
  rule('Fissioning', true, (p) => {
    if (p.fissionCondition()) p.fission();
  });
  rule('Update', true, (p) => p.update());
  rule('Death', true, (p) => p.death());
  rule('Play Closest', on('closest'), (p) => p.playClosest());
  rule('Play Furthest', on('furthest'), (p) => p.playFurthest());
  rule('Play Preference', on('preference'), (p) => p.playPreference());
  rule('Crossover', true, (p) => p.crossover());
  rule('Mutation', true, (p) => p.mutation());

  addPdStatistics(sim as unknown as Simulation, players as unknown as Scape<PdPlayer>, true);
  const ratio = (name: string, value: (p: GaPlayer) => number): void => {
    sim.data.measure(players, name, value, { statistics: ['count', 'sum', 'mean'] });
  };
  ratio('Cooperate Ratio', (p) => p.cooperateRatio);
  ratio('Defect Ratio', (p) => p.defectRatio);
  ratio('Cooperate Closest', (p) => (p.preference === 0 ? p.cooperateRatio : 0));
  ratio('Cooperate Farthest', (p) => (p.preference === 1 ? p.cooperateRatio : 0));
  ratio('Defect Closest', (p) => (p.preference === 0 ? 1 - p.cooperateRatio : 0));
  ratio('Defect Farthest', (p) => (p.preference === 1 ? 1 - p.cooperateRatio : 0));

  if (options.stopWhenExtinct) {
    sim.observe({
      stepped(s) {
        if (players.size === 0 && s.tick !== 0) s.stop('extinct');
      },
    });
  }

  sim.addView(
    gridView<Cell, GaPlayer>({
      title: "Player's View",
      grid,
      background: 0xd3d3d3,
      occupantColor: (p) => genomeColor(p.strategyString()),
      occupantShape: 'circle',
    }),
  );
  sim.addView(
    timeSeriesView({
      title: 'Cooperation and defection ratios',
      series: ['Cooperate Ratio.sum', 'Defect Ratio.sum'],
      colors: { 'Cooperate Ratio.sum': colors.blue, 'Defect Ratio.sum': colors.red },
      yMin: 0,
    }),
  );
  if (options.closenessChart) {
    sim.addView(
      timeSeriesView({
        title: 'Cooperation by preference',
        series: [
          'Cooperate Closest.sum',
          'Cooperate Farthest.sum',
          'Defect Closest.sum',
          'Defect Farthest.sum',
        ],
        colors: {
          'Cooperate Closest.sum': colors.blue,
          'Cooperate Farthest.sum': colors.green,
          'Defect Closest.sum': colors.red,
          'Defect Farthest.sum': colors.orange,
        },
        yMin: 0,
      }),
    );
  }
}

/** The most common strategy strings of the final population with their counts (legacy `PD2DGAMulti` run data). */
export function topGenomes(
  players: Iterable<GaPlayer>,
  rankSize = 8,
): { genome: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of players)
    counts.set(p.strategyString(), (counts.get(p.strategyString()) ?? 0) + 1);
  return [...counts]
    .map(([genome, count]) => ({ genome, count }))
    .sort((a, b) => b.count - a.count || (a.genome < b.genome ? -1 : a.genome > b.genome ? 1 : 0))
    .slice(0, rankSize);
}
