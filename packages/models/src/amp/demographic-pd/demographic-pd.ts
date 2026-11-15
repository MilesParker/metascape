// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model DemographicPrisoner_sDilemma.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  type Array2D,
  Array2DVonNeumann,
  CellOccupant,
  colors,
  defineModel,
  gridView,
  HostCell,
  int,
  real,
  Scape,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** One site of the game space. */
export class PlayCell extends HostCell {}

/** The settings a player reads from the model. */
export interface PlayerSettings {
  readonly maximumAge: number;
  readonly initialWealth: number;
  readonly payoffCC: number;
  readonly payoffCD: number;
  readonly payoffDC: number;
  readonly payoffDD: number;
  readonly fissionWealth: number;
  readonly inheritedWealth: number;
  readonly mutationRate: number;
  readonly deathAge: number;
}

/** A player: it either cooperates or defects with every neighbour it plays. */
export class Player extends CellOccupant<PlayCell> {
  cooperate = false;
  age = 0;
  wealth = 0;
  /** Set on children born by fission, which skip the initial rules. */
  born = false;

  constructor(
    private readonly world: Array2D<PlayCell>,
    private readonly scapeOfPlayers: () => Scape<Player>,
    private readonly settings: PlayerSettings,
  ) {
    super();
  }

  /** The "Initialize" initial rule: initial wealth, a random age below `maximumAge`, a random strategy. */
  initializeState(): void {
    if (this.born) return;
    this.wealth = this.settings.initialWealth;
    this.age = this.random.int(0, this.settings.maximumAge);
    this.cooperate = this.random.chance(0.5);
  }

  /** The "Move To Random Location" initial rule. */
  override moveToRandomLocation(): void {
    if (this.born) return;
    const cell = this.world.findRandomAvailable();
    if (cell) this.moveTo(cell);
  }

  /** The "Random Walk" rule: step to a random available von Neumann neighbour, if any. */
  override randomWalk(): void {
    this.randomWalkAvailable();
  }

  /** The "Play Neighbor" rule: play one randomly chosen neighbouring player; both are paid. */
  playNeighbor(): void {
    const others = this.neighboringOccupants();
    if (others.length === 0) return;
    const other = this.random.pick(others) as Player;
    const s = this.settings;
    if (other.cooperate && this.cooperate) {
      this.wealth += s.payoffCC;
      other.wealth += s.payoffCC;
    }
    if (other.cooperate && !this.cooperate) {
      this.wealth += s.payoffDC;
      other.wealth += s.payoffCD;
    }
    if (!other.cooperate && this.cooperate) {
      this.wealth += s.payoffCD;
      other.wealth += s.payoffDC;
    }
    if (!this.cooperate && !other.cooperate) {
      this.wealth += s.payoffDD;
      other.wealth += s.payoffDD;
    }
  }

  /** The "Update Age" rule. */
  updateAge(): void {
    this.age += 1;
  }

  /**
   * The "Fission Rule": with enough wealth, and an available neighbouring cell, give birth there.
   * The child gets `inheritedWealth` (the parent loses as much), a strategy copied from the
   * parent or, with probability `mutationRate`, a random one, and age 0.
   */
  fission(): void {
    if (this.wealth < this.settings.fissionWealth) return;
    const here = this.hostCell;
    if (!here) return;
    const free = here.neighbors.filter((cell) => cell.isAvailable);
    if (free.length === 0) return;
    const birthplace = this.random.pick(free);
    const child = new Player(this.world, this.scapeOfPlayers, this.settings);
    child.born = true;
    child.wealth = this.settings.inheritedWealth;
    child.cooperate =
      this.random.float() < this.settings.mutationRate ? this.random.chance(0.5) : this.cooperate;
    this.scapeOfPlayers().add(child);
    child.moveTo(birthplace);
    this.wealth -= this.settings.inheritedWealth;
  }

  /** The "Die At Age" rule: removed once older than `deathAge`. */
  dieAtAge(): void {
    if (this.age > this.settings.deathAge) this.die();
  }

  /** The "Die At Wealth 0" rule: removed once wealth is below zero. */
  dieAtWealth0(): void {
    if (this.wealth < 0) this.die();
  }
}

/** The Demographic Prisoner's Dilemma of the AMP examples. */
export const demographicPd = defineModel({
  name: "Demographic Prisoner's Dilemma (AMP)",
  description:
    "Players wander a torus of von Neumann neighbours, each playing a one-shot Prisoner's Dilemma with a random neighbour every period; wealthy players have children, poor or old ones die, and strategies are inherited with some mutation.",
  provenance: {
    authors: 'Joshua M. Epstein',
    citation:
      "Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma. Complexity, 4(2), 36-48.",
    portedFrom: 'Eclipse AMP, DemographicPrisoner_sDilemma.metaabm',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: "The model file's rules are ported; the paper's variants (such as a different neighbourhood or move rule) are not part of this file.",
  },
  parameters: {
    playerCount: int(100, {
      min: 0,
      max: 5000,
      label: 'Player Count',
      description: 'The number of players to create.',
    }),
    minimumWealth: int(20, {
      min: 0,
      max: 1000,
      label: 'Minimum Wealth',
      description: 'Not read by any act of the original model; no effect.',
    }),
    maximumWealth: int(100, {
      min: 0,
      max: 1000,
      label: 'Maximum Wealth',
      description: 'Not read by any act of the original model; no effect.',
    }),
    maximumAge: int(100, {
      min: 1,
      max: 1000,
      label: 'Maximum Age',
      description: 'Initial ages are drawn from 0 up to, but not including, this value.',
    }),
    payoffCC: int(2, {
      min: -100,
      max: 100,
      label: 'Payoff Cooperate Cooperate',
      description: 'The change in wealth for a player when playing cooperate against cooperate.',
    }),
    payoffCD: int(-6, {
      min: -100,
      max: 100,
      label: 'Payoff Cooperate Defect',
      description: 'The change in wealth for a player when playing cooperate against defect.',
    }),
    payoffDC: int(6, {
      min: -100,
      max: 100,
      label: 'Payoff Defect Cooperate',
      description: 'The change in wealth for a player when playing defect against cooperate.',
    }),
    payoffDD: int(-5, {
      min: -100,
      max: 100,
      label: 'Payoff Defect Defect',
      description: 'The change in wealth for a player when both players defect.',
    }),
    fissionWealth: int(11, {
      min: 0,
      max: 1000,
      label: 'Fission Wealth',
      description: 'The wealth level at which an agent can fission.',
    }),
    inheritedWealth: int(6, {
      min: 0,
      max: 1000,
      label: 'Inherited Wealth',
      description: 'The wealth that is passed from parent to child.',
    }),
    initialWealth: int(6, {
      min: 0,
      max: 1000,
      label: 'Initial Wealth',
      description: 'The wealth initially assigned to an agent at the beginning of a model run.',
    }),
    mutationRate: real(0.1, {
      min: 0,
      max: 1,
      label: 'Mutation Rate',
      description:
        'The probability that a child draws a random strategy instead of copying its parent.',
    }),
    deathAge: int(100, {
      min: 0,
      max: 10000,
      label: 'Death Age',
      description: 'A player older than this many periods is removed.',
    }),
    birthAge: int(0, {
      min: 0,
      max: 0,
      label: 'Birth Age',
      description: 'Not read by any act of the original model; no effect.',
    }),
    width: int(20, {
      min: 3,
      max: 200,
      label: 'Width',
      description: 'The horizontal extent of the game space.',
    }),
    height: int(20, {
      min: 3,
      max: 200,
      label: 'Height',
      description: 'The vertical extent of the game space.',
    }),
  },

  build(root) {
    const p = root.parameters;
    const world = root.add(
      new Scape<PlayCell>({
        name: 'Game Spaces',
        space: new Array2DVonNeumann<PlayCell>(),
        extent: [p.width, p.height],
        periodic: true,
        prototypeAgent: () => new PlayCell(),
        executionOrder: 'byRule',
      }),
    );
    const settings: PlayerSettings = {
      maximumAge: p.maximumAge,
      initialWealth: p.initialWealth,
      payoffCC: p.payoffCC,
      payoffCD: p.payoffCD,
      payoffDC: p.payoffDC,
      payoffDD: p.payoffDD,
      fissionWealth: p.fissionWealth,
      inheritedWealth: p.inheritedWealth,
      mutationRate: p.mutationRate,
      deathAge: p.deathAge,
    };
    const players: Scape<Player> = root.add(
      new Scape<Player>({
        name: 'Players',
        size: p.playerCount,
        executionOrder: 'byRule',
        prototypeAgent: () => new Player(world.space as Array2D<PlayCell>, () => players, settings),
      }),
    );
    players.addInitialRule('Initialize', (a) => a.initializeState());
    players.addInitialRule('Move To Random Location', (a) => a.moveToRandomLocation());
    players.addRule('Random Walk', (a) => a.randomWalk());
    players.addRule('Play Neighbor', (a) => a.playNeighbor());
    players.addRule('Update Age', (a) => a.updateAge());
    players.addRule('Fission Rule', (a) => a.fission());
    players.addRule('Die At Age', (a) => a.dieAtAge());
    players.addRule('Die At Wealth 0', (a) => a.dieAtWealth0());

    players.addStatCollector(stat.count('Players Population'));
    players.addStatCollector(stat.count('Player is Cooperate', (a) => a.cooperate));
    players.addStatCollector(stat.count('Player is not Cooperate', (a) => !a.cooperate));
    players.addStatCollector(
      stat.measure('Player Age', (a) => a.age, { statistics: ['mean', 'min', 'max'] }),
    );
    players.addStatCollector(
      stat.measure('Player Wealth', (a) => a.wealth, {
        statistics: ['mean', 'min', 'max'],
      }),
    );

    root.addView(
      gridView<PlayCell, Player>({
        title: 'Game space',
        scape: world,
        // Style: cells are green; cooperators are blue ovals and defectors red ovals.
        cellColor: () => colors.green,
        occupantColor: (a) => (a.cooperate ? colors.blue : colors.red),
        occupantShape: 'circle',
        legend: [
          { color: colors.blue, label: 'Cooperates', mark: 'agent' },
          { color: colors.red, label: 'Defects', mark: 'agent' },
        ],
      }),
    );
    root.addView(
      timeSeriesView({
        title: 'Cooperators and defectors',
        series: ['Player is Cooperate', 'Player is not Cooperate'],
        colors: { 'Player is Cooperate': colors.blue, 'Player is not Cooperate': colors.red },
        yMin: 0,
      }),
    );
    root.addView(timeSeriesView({ title: 'Population', series: ['Players Population'], yMin: 0 }));
    root.addView(
      timeSeriesView({
        title: 'Player wealth and age',
        series: ['Player Wealth.mean', 'Player Age.mean'],
      }),
    );
  },
});
