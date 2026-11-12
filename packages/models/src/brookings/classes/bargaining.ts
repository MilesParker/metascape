// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.classes.Bargainer, BargainerTagged, PeytonBargainer,
// Strategy, BargainingModelBase, BargainingModelOne, BargainingModelTwo, BargainingModelPeyton and
// Figure2, Figure3, Figure6, Figure7, Figure8, Figure9.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  colors,
  ContinuousScape,
  continuousView,
  defineModel,
  int,
  PointAgent,
  real,
  timeSeriesView,
  type Color,
  type Model,
  type Provenance,
  type Random,
  type Scape,
  type Simulation,
} from '@metascape/engine';

/** A demand in the bargaining game: `0` low, `1` medium, `2` high (legacy `Strategy`). */
export type Strategy = 0 | 1 | 2;
export const LOW: Strategy = 0;
export const MEDIUM: Strategy = 1;
export const HIGH: Strategy = 2;

/** The tag of an agent in the two-group variants (legacy `LIGHT_TAG` and `DARK_TAG`). */
export type Tag = -1 | 1;
export const LIGHT_TAG: Tag = -1;
export const DARK_TAG: Tag = 1;

/** Which kind of agent a model uses. */
export type AgentKind = 'untagged' | 'tagged' | 'peyton';

/**
 * How the initial memories of tagged agents are rigged (the initial rules of
 * the legacy `Figure6`, selected by `Figure7`, `Figure8` and `Figure9`).
 * In every case the memory counts are calculated afterwards.
 */
export type StartRule =
  | 'none'
  | 'lightIntraHighLow'
  | 'lightInterLowDarkInterHigh'
  | 'lightInterLowIntraHighLowDarkInterHigh';

/** The settings that differ between the models of this family. */
export interface BargainingVariant {
  readonly kind: AgentKind;
  /** Legacy `Figure3`: every initial memory entry is low or high. */
  readonly highLowStart?: boolean;
  readonly startRule?: StartRule;
  readonly minimumMemorySize: number;
  readonly maximumMemorySize: number;
  readonly randomStrategyProbability: number;
  readonly lowPayoff: number;
  readonly mediumPayoff: number;
  readonly highPayoff: number;
}

/** Everything the agents of one run share. */
export interface BargainingWorld {
  readonly variant: BargainingVariant;
  readonly minimumMemorySize: number;
  readonly maximumMemorySize: number;
  readonly randomStrategyProbability: number;
  /** Demands as 32-bit floats, as in the legacy `float` arithmetic, indexed by strategy. */
  readonly demand: readonly [number, number, number];
  agents: Scape<Bargainer>;
}

const f32 = Math.fround;

/** A uniformly random demand (legacy `Strategy.randomStrategy`). */
export function randomStrategy(random: Random): Strategy {
  return random.int(0, 3) as Strategy;
}

/** Width and height of the plot, a triangle with `high` bottom left, `medium` bottom right and `low` on top. */
export const PLOT_WIDTH = 100;
export const PLOT_HEIGHT = (PLOT_WIDTH * Math.sqrt(3)) / 2;

/**
 * A bargainer remembers the demands made by its last opponents and demands the
 * share that would have paid best against those memories.
 *
 * It is also a point in a continuous space: the position is its latest
 * memory proportions plotted on a simplex, which replaces the legacy
 * `SimplexView`. The simulation updates the position after each step.
 */
export class Bargainer extends PointAgent {
  strategyMemory: Strategy[] = [];
  oldestMemory = 0;
  lastStrategy: Strategy = MEDIUM;
  intraLowPlayers = 0;
  intraMediumPlayers = 0;
  intraHighPlayers = 0;

  constructor(protected readonly world: BargainingWorld) {
    super(PLOT_WIDTH / 2, PLOT_HEIGHT / 3);
  }

  override initialize(): void {
    const { minimumMemorySize, maximumMemorySize } = this.world;
    this.setMemorySize(this.random.int(minimumMemorySize, maximumMemorySize + 1));
    this.initializeMemoryRandom();
    this.lastStrategy = randomStrategy(this.random);
    if (this.world.variant.highLowStart) this.initializeMemoryHighLow();
  }

  initializeMemoryRandom(): void {
    for (let i = 0; i < this.strategyMemory.length; i++) {
      this.strategyMemory[i] = randomStrategy(this.random);
    }
  }

  initializeMemory(strategy: Strategy): void {
    this.strategyMemory.fill(strategy);
  }

  initializeMemoryHighLow(): void {
    for (let i = 0; i < this.strategyMemory.length; i++) {
      this.strategyMemory[i] = this.random.chance() ? LOW : HIGH;
    }
  }

  /** The best reply to three estimated payoffs, with the legacy tie-breaks. */
  protected calculateBestStrategy(low: number, medium: number, high: number): Strategy {
    const random = this.random;
    if (low > medium) {
      if (low > high) return LOW;
      if (low < high) return HIGH;
      return random.chance() ? LOW : HIGH;
    } else if (low < medium) {
      if (medium > high) return MEDIUM;
      if (medium < high) return HIGH;
      return random.chance() ? MEDIUM : HIGH;
    }
    if (high > low) return HIGH;
    if (high < low) return random.chance() ? LOW : MEDIUM;
    // All equal, which includes agents with no memory: pick one of three.
    const pick = random.float();
    if (pick < 1 / 3) return LOW;
    if (pick < 2 / 3) return MEDIUM;
    return HIGH;
  }

  /** The demand to make against `opponent`, from this agent's memory. */
  calculateNextStrategy(_opponent: Bargainer): Strategy {
    let low = 0;
    let medium = 0;
    let high = 0;
    for (const s of this.strategyMemory) {
      if (s === LOW) low++;
      else if (s === MEDIUM) medium++;
      else if (s === HIGH) high++;
    }
    this.intraLowPlayers = low;
    this.intraMediumPlayers = medium;
    this.intraHighPlayers = high;
    const d = this.world.demand;
    return this.calculateBestStrategy(
      f32(d[LOW] * this.strategyMemory.length),
      f32(d[MEDIUM] * (medium + low)),
      f32(d[HIGH] * low),
    );
  }

  addMemory(_opponent: Bargainer, strategy: Strategy): void {
    this.strategyMemory[this.oldestMemory] = strategy;
    this.oldestMemory++;
    if (this.oldestMemory >= this.strategyMemory.length) this.oldestMemory = 0;
  }

  setMemorySize(size: number): void {
    this.strategyMemory = new Array<Strategy>(size).fill(MEDIUM);
    this.oldestMemory = 0;
  }

  get memorySize(): number {
    return this.strategyMemory.length;
  }

  /** The number of memory entries the intragroup proportions are taken over. */
  countIntra(): number {
    return this.memorySize;
  }

  countIntraLow(): number {
    return this.intraLowPlayers;
  }

  countIntraMedium(): number {
    return this.intraMediumPlayers;
  }

  countIntraHigh(): number {
    return this.intraHighPlayers;
  }

  /** Both sides of an encounter choose a demand, then both remember the other's. */
  play(other: Bargainer): void {
    this.playSide(other);
    other.playSide(this);
    this.addMemory(other, other.lastStrategy);
    other.addMemory(this, this.lastStrategy);
  }

  playSide(opponent: Bargainer): void {
    if (this.random.float() > this.world.randomStrategyProbability) {
      this.lastStrategy = this.calculateNextStrategy(opponent);
    } else {
      this.lastStrategy = randomStrategy(this.random);
    }
  }

  /** The colour of the agent's dot in the plots. */
  get plotColor(): Color {
    return colors.blue;
  }
}

/** A bargainer with a tag (light or dark) that remembers whom it played, and treats each tag differently. */
export class BargainerTagged extends Bargainer {
  tag: Tag = LIGHT_TAG;
  opponentMemory: BargainerTagged[] = [];
  intraPlayers = 0;
  interPlayers = 0;
  interLowPlayers = 0;
  interMediumPlayers = 0;
  interHighPlayers = 0;

  override initialize(): void {
    super.initialize();
    this.tag = this.random.chance() ? LIGHT_TAG : DARK_TAG;
    this.initializeOpponentMemory();
  }

  initializeOpponentMemory(): void {
    const agents = this.scape as Scape<BargainerTagged>;
    for (let i = 0; i < this.strategyMemory.length; i++) {
      let randomAgent = agents.randomMember()!;
      while (randomAgent === this) randomAgent = agents.randomMember()!;
      this.opponentMemory[i] = randomAgent;
    }
  }

  /** Randomizes the entries about opponents with the given tag. */
  initializeMemoryRandomFor(forTag: Tag): void {
    for (let i = 0; i < this.strategyMemory.length; i++) {
      if (this.opponentMemory[i]!.tag === forTag) {
        this.strategyMemory[i] = randomStrategy(this.random);
      }
    }
  }

  /** Sets the entries about opponents with the given tag. */
  initializeMemoryFor(forTag: Tag, strategy: Strategy): void {
    for (let i = 0; i < this.strategyMemory.length; i++) {
      if (this.opponentMemory[i]!.tag === forTag) this.strategyMemory[i] = strategy;
    }
  }

  /** Sets the entries about opponents with the given tag to low or high at random. */
  initializeMemoryHighLowFor(forTag: Tag): void {
    for (let i = 0; i < this.strategyMemory.length; i++) {
      if (this.opponentMemory[i]!.tag === forTag) {
        this.strategyMemory[i] = this.random.chance() ? LOW : HIGH;
      }
    }
  }

  /** Counts the demands remembered against opponents of the same tag (intra) and the other tag (inter). */
  calculateMemoryCounts(): void {
    this.intraPlayers = 0;
    this.intraLowPlayers = 0;
    this.intraMediumPlayers = 0;
    this.intraHighPlayers = 0;
    this.interPlayers = 0;
    this.interLowPlayers = 0;
    this.interMediumPlayers = 0;
    this.interHighPlayers = 0;
    for (let i = 0; i < this.strategyMemory.length; i++) {
      const s = this.strategyMemory[i]!;
      if (this.opponentMemory[i]!.tag === this.tag) {
        this.intraPlayers++;
        if (s === LOW) this.intraLowPlayers++;
        else if (s === MEDIUM) this.intraMediumPlayers++;
        else this.intraHighPlayers++;
      } else {
        this.interPlayers++;
        if (s === LOW) this.interLowPlayers++;
        else if (s === MEDIUM) this.interMediumPlayers++;
        else this.interHighPlayers++;
      }
    }
  }

  override calculateNextStrategy(opponent: Bargainer): Strategy {
    this.calculateMemoryCounts();
    const d = this.world.demand;
    if ((opponent as BargainerTagged).tag === this.tag) {
      return this.calculateBestStrategy(
        f32(d[LOW] * this.intraPlayers),
        f32(d[MEDIUM] * (this.intraMediumPlayers + this.intraLowPlayers)),
        f32(d[HIGH] * this.intraLowPlayers),
      );
    }
    return this.calculateBestStrategy(
      f32(d[LOW] * this.interPlayers),
      f32(d[MEDIUM] * (this.interMediumPlayers + this.interLowPlayers)),
      f32(d[HIGH] * this.interLowPlayers),
    );
  }

  override setMemorySize(size: number): void {
    this.opponentMemory = new Array<BargainerTagged>(size);
    super.setMemorySize(size);
  }

  override addMemory(opponent: Bargainer, strategy: Strategy): void {
    this.opponentMemory[this.oldestMemory] = opponent as BargainerTagged;
    super.addMemory(opponent, strategy);
  }

  override countIntra(): number {
    return this.intraPlayers;
  }

  countInter(): number {
    return this.interPlayers;
  }

  countInterLow(): number {
    return this.interLowPlayers;
  }

  countInterMedium(): number {
    return this.interMediumPlayers;
  }

  countInterHigh(): number {
    return this.interHighPlayers;
  }

  override get plotColor(): Color {
    return this.tag === LIGHT_TAG ? 0xc0c0c0 : 0x404040;
  }
}

/**
 * A tagged bargainer that plays a coordination game: a demand pays only if
 * the opponent's remembered demands are complementary to it (low with high,
 * medium with medium, high with low).
 */
export class PeytonBargainer extends BargainerTagged {
  override calculateNextStrategy(opponent: Bargainer): Strategy {
    this.calculateMemoryCounts();
    const d = this.world.demand;
    if ((opponent as BargainerTagged).tag === this.tag) {
      return this.calculateBestStrategy(
        f32(d[LOW] * this.intraHighPlayers),
        f32(d[MEDIUM] * this.intraMediumPlayers),
        f32(d[HIGH] * this.intraLowPlayers),
      );
    }
    return this.calculateBestStrategy(
      f32(d[LOW] * this.interHighPlayers),
      f32(d[MEDIUM] * this.interMediumPlayers),
      f32(d[HIGH] * this.interLowPlayers),
    );
  }
}

/** The initial rules of the legacy `Figure6`, in the order they run. */
function startRules(rule: StartRule): ((a: BargainerTagged) => void)[] {
  const light = (a: BargainerTagged): boolean => a.tag === LIGHT_TAG;
  const interDemand = (a: BargainerTagged): void => {
    // The opponents of the other tag: light agents expect low from them, dark agents high.
    a.initializeMemoryFor(light(a) ? DARK_TAG : LIGHT_TAG, light(a) ? LOW : HIGH);
  };
  const intraHighLow = (a: BargainerTagged): void => {
    if (light(a)) a.initializeMemoryHighLowFor(LIGHT_TAG);
  };
  switch (rule) {
    case 'none':
      return [];
    case 'lightIntraHighLow':
      return [intraHighLow];
    case 'lightInterLowDarkInterHigh':
      return [interDemand];
    case 'lightInterLowIntraHighLowDarkInterHigh':
      return [
        (a) => {
          interDemand(a);
          if (light(a)) a.initializeMemoryHighLowFor(LIGHT_TAG);
        },
      ];
  }
}

/** Position on the simplex of a memory with the given counts; a memory with no counts sits at the centre. */
function simplexPoint(high: number, medium: number, low: number, total: number): [number, number] {
  if (total <= 0) return [PLOT_WIDTH / 2, PLOT_HEIGHT / 3];
  const fm = medium / total;
  const fl = low / total;
  void high;
  return [PLOT_WIDTH * (fm + fl / 2), PLOT_HEIGHT * fl];
}

/** A dot in the intergroup plot, following one bargainer. */
class InterDot extends PointAgent {
  constructor(readonly bargainer: BargainerTagged) {
    super(PLOT_WIDTH / 2, PLOT_HEIGHT / 3);
  }
}

/** A model declaration: its identity, text and the variant it runs. */
export interface BargainingDeclaration {
  readonly name: string;
  readonly description: string;
  readonly provenance: Provenance;
  readonly variant: BargainingVariant;
}

/**
 * Builds a model of the family. The root scape of the legacy
 * `BargainingModelBase` is the simulation itself; its one child scape `agents`
 * holds the bargainers, each of whom, 50 times per tick (half the population),
 * is drawn at random with replacement and plays a randomly drawn opponent.
 */
export function bargainingModel(declaration: BargainingDeclaration) {
  const v = declaration.variant;
  const memoryHint = 'Number of past encounters each agent remembers.';
  return defineModel({
    name: declaration.name,
    description: declaration.description,
    provenance: declaration.provenance,
    parameters: {
      population: int(100, {
        min: 2,
        max: 2000,
        label: 'Population',
        description:
          'Number of agents. Fixed at 100 in the legacy model, which did not expose it; half of them act in each tick.',
      }),
      minimumMemorySize: int(v.minimumMemorySize, {
        min: 1,
        max: 1000,
        label: 'Minimum memory size',
        description: `${memoryHint} Each agent's size is drawn between the minimum and maximum.`,
      }),
      maximumMemorySize: int(v.maximumMemorySize, {
        min: 1,
        max: 1000,
        label: 'Maximum memory size',
        description: `${memoryHint} Each agent's size is drawn between the minimum and maximum.`,
      }),
      randomStrategyProbability: real(v.randomStrategyProbability, {
        min: 0,
        max: 1,
        label: 'Random strategy probability',
        description: 'Chance that an agent ignores its memory and demands a random share.',
      }),
      lowPayoff: real(v.lowPayoff, {
        min: 0,
        max: 1,
        label: 'Low demand',
        description: 'Share of the pie claimed by a low demand.',
      }),
      mediumPayoff: real(v.mediumPayoff, {
        min: 0,
        max: 1,
        label: 'Medium demand',
        description: 'Share of the pie claimed by a medium demand.',
      }),
      highPayoff: real(v.highPayoff, {
        min: 0,
        max: 1,
        label: 'High demand',
        description: 'Share of the pie claimed by a high demand.',
      }),
    },
    build(sim) {
      const p = sim.parameters;
      if (p.minimumMemorySize > p.maximumMemorySize) {
        throw new RangeError('The minimum memory size must not exceed the maximum.');
      }
      const world: BargainingWorld = {
        variant: v,
        minimumMemorySize: p.minimumMemorySize,
        maximumMemorySize: p.maximumMemorySize,
        randomStrategyProbability: p.randomStrategyProbability,
        demand: [f32(p.lowPayoff), f32(p.mediumPayoff), f32(p.highPayoff)],
        agents: undefined as unknown as Scape<Bargainer>,
      };
      const create = (): Bargainer =>
        v.kind === 'untagged'
          ? new Bargainer(world)
          : v.kind === 'tagged'
            ? new BargainerTagged(world)
            : new PeytonBargainer(world);
      const tagged = v.kind !== 'untagged';

      const agents = sim.addScape(
        new ContinuousScape<Bargainer>({
          name: 'agents',
          width: PLOT_WIDTH,
          height: PLOT_HEIGHT,
          wrap: false,
          size: p.population,
          create,
          schedule: 'byAgent',
          activations: Math.floor(p.population / 2),
          sampling: 'draw',
        }),
      );
      world.agents = agents;

      // Legacy rule PLAY_OTHER: play a random other agent, giving up if there is none.
      agents.addRule('Play Other', (agent) => {
        if (agents.size <= 1) return;
        let other = agents.randomMember()!;
        while (other === agent) other = agents.randomMember()!;
        agent.play(other);
      });

      if (tagged) {
        for (const rule of startRules(v.startRule ?? 'none')) {
          agents.addInitialRule('Start memory', (a) => rule(a as BargainerTagged));
        }
        if (v.startRule !== undefined) {
          // The legacy Figure6 family always calculates the counts once, so that the plots are defined at the start.
          agents.addInitialRule('Calculate memory counts', (a) =>
            (a as BargainerTagged).calculateMemoryCounts(),
          );
        }
      }

      const intraPoint = (a: Bargainer): [number, number] =>
        simplexPoint(a.countIntraHigh(), a.countIntraMedium(), a.countIntraLow(), a.countIntra());
      let inter: ContinuousScape<InterDot> | undefined;
      if (tagged) {
        inter = sim.addScape(
          new ContinuousScape<InterDot>({
            name: 'intergroup plot',
            width: PLOT_WIDTH,
            height: PLOT_HEIGHT,
            wrap: false,
            create: (i) => new InterDot(agents.members[i] as BargainerTagged),
            size: p.population,
          }),
        );
      }
      const interPoint = (b: BargainerTagged): [number, number] =>
        simplexPoint(b.countInterHigh(), b.countInterMedium(), b.countInterLow(), b.countInter());
      const refresh = (): void => {
        for (const a of agents.members) {
          const [x, y] = intraPoint(a);
          if (x !== a.x || y !== a.y) a.moveTo(x, y);
        }
        if (inter) {
          for (const dot of inter.members) {
            const [x, y] = interPoint(dot.bargainer);
            if (x !== dot.x || y !== dot.y) dot.moveTo(x, y);
          }
        }
      };
      sim.setup(refresh);
      sim.observe({ stepped: refresh });

      sim.data.count(agents, 'low', (a) => a.lastStrategy === LOW);
      sim.data.count(agents, 'medium', (a) => a.lastStrategy === MEDIUM);
      sim.data.count(agents, 'high', (a) => a.lastStrategy === HIGH);

      sim.addView(
        continuousView<Bargainer>({
          title: 'Intragroup memory (high / medium / low)',
          scape: agents,
          color: (a) => a.plotColor,
          radius: () => 1.2,
          background: 0xffffff,
        }),
      );
      if (inter) {
        sim.addView(
          continuousView<InterDot>({
            title: 'Intergroup memory (high / medium / low)',
            scape: inter,
            color: (d) => d.bargainer.plotColor,
            radius: () => 1.2,
            background: 0xffffff,
          }),
        );
      }
      sim.addView(
        timeSeriesView({
          title: 'Demands in the latest encounter',
          series: ['low', 'medium', 'high'],
          colors: { low: colors.blue, medium: colors.green, high: colors.red },
          yMin: 0,
        }),
      );
    },
  });
}

/** The model type that {@link bargainingModel} returns. */
export type BargainingModel = Model<ReturnType<typeof bargainingModel>['parameters']>;

/** A simulation of one of the family's models. */
export type BargainingSimulation = Simulation<BargainingModel['parameters']>;
