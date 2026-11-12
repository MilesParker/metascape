// SPDX-License-Identifier: EPL-2.0
import {
  bool,
  Cell,
  colors,
  defineModel,
  gradient,
  GridScape,
  gridView,
  histogramView,
  int,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** The highest sugar capacity of any cell. */
export const MAX_CAPACITY = 4;

/** Lattice directions along which agents look: north, west, east, south. */
const DX = [0, -1, 1, 0] as const;
const DY = [-1, 0, 0, 1] as const;

/** One site of the Sugarscape: a sugar capacity and the sugar currently on it. */
export class SugarCell extends Cell {
  /** The most sugar this cell can hold, 0 to {@link MAX_CAPACITY}. */
  capacity: number;
  /** The sugar available to harvest now. */
  sugar: number;

  constructor(capacity = 0) {
    super();
    this.capacity = capacity;
    this.sugar = capacity;
  }
}

/**
 * Capacity at a site: two peaks of height 4, in the north-east and south-west,
 * each surrounded by bands of 3, 2 and 1, falling to 0 elsewhere.
 */
export function capacityAt(x: number, y: number, width: number, height: number): number {
  const band = (4 * width) / 50;
  const peaks = [
    [0.7 * width, 0.3 * height],
    [0.3 * width, 0.7 * height],
  ] as const;
  let nearest = Infinity;
  for (const [px, py] of peaks) nearest = Math.min(nearest, Math.hypot(x - px, y - py));
  return Math.max(0, MAX_CAPACITY - Math.floor(nearest / band));
}

/** Ranges and options the agents draw their traits from. */
export interface WalkerSettings {
  readonly visionMin: number;
  readonly visionMax: number;
  readonly metabolismMin: number;
  readonly metabolismMax: number;
  readonly sugarMin: number;
  readonly sugarMax: number;
  readonly replacement: boolean;
  readonly ageMin: number;
  readonly ageMax: number;
}

/**
 * An Epstein-Axtell agent: it has a fixed vision and metabolism and a store of
 * sugar, and each tick moves by rule M, harvests, and pays its metabolism.
 */
export class Walker extends Occupant<SugarCell> {
  vision = 0;
  metabolism = 0;
  sugar = 0;
  age = 0;
  maxAge = Infinity;

  constructor(
    private readonly settings: WalkerSettings,
    private readonly sugarGrid: GridScape<SugarCell>,
  ) {
    super();
  }

  override initialize(): void {
    const s = this.settings;
    const random = this.random;
    this.vision = random.int(s.visionMin, s.visionMax + 1);
    this.metabolism = random.int(s.metabolismMin, s.metabolismMax + 1);
    this.sugar = random.int(s.sugarMin, s.sugarMax + 1);
    if (s.replacement) this.maxAge = random.int(s.ageMin, s.ageMax + 1);
    const home = this.sugarGrid.randomAvailableCell();
    if (home) this.moveTo(home);
    else this.die();
  }

  /** Rule M (move and harvest), then metabolism, then death and, with rule R, replacement. */
  act(): void {
    this.move();
    this.sugar -= this.metabolism;
    this.age++;
    if (this.sugar <= 0 || this.age > this.maxAge) {
      this.die();
      if (this.settings.replacement) (this.scape as Scape<Walker>).spawn();
    }
  }

  /**
   * Looks along the four lattice directions up to the vision, picks the
   * unoccupied cell (or the current one) with the most sugar, nearest first
   * and at random among equals, moves there and eats all its sugar.
   */
  private move(): void {
    const here = this.cell;
    if (!here) return;
    const grid = this.sugarGrid;
    let best = here;
    let bestSugar = here.sugar;
    let bestDistance = 0;
    let ties = 1;
    for (let step = 1; step <= this.vision; step++) {
      for (let d = 0; d < 4; d++) {
        const candidate = grid.at(here.x + DX[d]! * step, here.y + DY[d]! * step);
        if (!candidate || !candidate.isAvailable) continue;
        const sugar = candidate.sugar;
        if (sugar > bestSugar) {
          best = candidate;
          bestSugar = sugar;
          bestDistance = step;
          ties = 1;
        } else if (sugar === bestSugar && step === bestDistance) {
          ties++;
          if (this.random.int(0, ties) === 0) best = candidate;
        }
      }
    }
    this.moveTo(best);
    this.sugar += best.sugar;
    best.sugar = 0;
  }
}

/** The Gini coefficient of non-negative values in `sorted` (ascending, first `n` entries). */
export function gini(sorted: Float64Array, n: number): number {
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    const x = sorted[i]!;
    total += x;
    weighted += (i + 1) * x;
  }
  if (n === 0 || total === 0) return 0;
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/**
 * Epstein and Axtell's basic Sugarscape.
 */
export const sugarscape = defineModel({
  name: 'Sugarscape',
  description:
    "Joshua Epstein and Robert Axtell's Sugarscape, the basic model of chapter II of 'Growing " +
    "Artificial Societies' (Brookings Institution Press and MIT Press, 1996). Agents with " +
    'differing vision, metabolism and initial wealth forage for sugar on a landscape with two ' +
    "peaks. Death thins the population to the landscape's carrying capacity, the survivors are " +
    'the best-adapted, and wealth ends up very unequally distributed even though the rules ' +
    'are identical for everyone.',
  parameters: {
    width: int(50, { min: 10, max: 200, label: 'Width', description: 'Number of columns.' }),
    height: int(50, { min: 10, max: 200, label: 'Height', description: 'Number of rows.' }),
    growback: real(1, {
      min: 0,
      max: 4,
      label: 'Growback',
      description: 'Sugar each cell regrows per tick, up to its capacity.',
    }),
    agents: int(400, {
      min: 0,
      max: 2500,
      label: 'Agents',
      description: 'Initial population (and the fixed size when replacement is on).',
    }),
    visionMin: int(1, { min: 1, max: 20, label: 'Vision min', description: 'Lowest vision.' }),
    visionMax: int(6, { min: 1, max: 20, label: 'Vision max', description: 'Highest vision.' }),
    metabolismMin: int(1, {
      min: 1,
      max: 10,
      label: 'Metabolism min',
      description: 'Lowest sugar eaten per tick.',
    }),
    metabolismMax: int(4, {
      min: 1,
      max: 10,
      label: 'Metabolism max',
      description: 'Highest sugar eaten per tick.',
    }),
    sugarMin: int(5, {
      min: 1,
      max: 100,
      label: 'Initial sugar min',
      description: 'Lowest initial endowment.',
    }),
    sugarMax: int(25, {
      min: 1,
      max: 100,
      label: 'Initial sugar max',
      description: 'Highest initial endowment.',
    }),
    replacement: bool(false, {
      label: 'Replacement (rule R)',
      description:
        'Agents die at a maximum age and every dead agent is replaced by a random newcomer.',
    }),
    ageMin: int(60, { min: 1, max: 1000, label: 'Max age min', description: 'Lowest lifespan.' }),
    ageMax: int(100, {
      min: 1,
      max: 1000,
      label: 'Max age max',
      description: 'Highest lifespan.',
    }),
  },

  build(sim) {
    const p = sim.parameters;
    for (const [low, high, what] of [
      [p.visionMin, p.visionMax, 'vision'],
      [p.metabolismMin, p.metabolismMax, 'metabolism'],
      [p.sugarMin, p.sugarMax, 'initial sugar'],
      [p.ageMin, p.ageMax, 'maximum age'],
    ] as const) {
      if (low > high) throw new RangeError(`Sugarscape: minimum ${what} exceeds the maximum`);
    }
    if (p.agents > p.width * p.height) {
      throw new RangeError('Sugarscape: more agents than cells');
    }

    const land = sim.addScape(
      new GridScape<SugarCell>({
        name: 'land',
        width: p.width,
        height: p.height,
        wrap: true,
        neighborhood: 'vonNeumann',
        order: 'sequential',
        create: (x, y) => new SugarCell(capacityAt(x, y, p.width, p.height)),
      }),
    );
    land.addRule('growback', (cell) => {
      cell.sugar = Math.min(cell.capacity, cell.sugar + p.growback);
    });

    const agents = sim.addScape(
      new Scape<Walker>({
        name: 'agents',
        size: p.agents,
        create: () => new Walker(p, land),
      }),
    );
    agents.addRule('move-eat-die', (walker) => walker.act());

    const data = sim.data;
    data.count(agents, 'population');
    data.measure(agents, 'vision', (a) => a.vision, { statistics: ['mean'] });
    data.measure(agents, 'metabolism', (a) => a.metabolism, { statistics: ['mean'] });
    data.measure(agents, 'wealth', (a) => a.sugar, { statistics: ['mean', 'sum', 'max'] });
    data.distribution(agents, 'wealthDistribution', (a) => a.sugar, {
      bins: 25,
      min: 0,
      max: 250,
    });
    let scratch = new Float64Array(Math.max(1, p.agents));
    data.value('gini', () => {
      const members = agents.members;
      if (members.length > scratch.length) scratch = new Float64Array(members.length * 2);
      for (let i = 0; i < members.length; i++) scratch[i] = members[i]!.sugar;
      scratch.subarray(0, members.length).sort();
      return gini(scratch, members.length);
    });

    const sugarColor = gradient(rgb(40, 36, 24), colors.yellow, rgb(255, 240, 150));
    sim.addView(
      gridView<SugarCell, Walker>({
        title: 'Sugarscape',
        grid: land,
        cellColor: (cell) => sugarColor(cell.sugar / MAX_CAPACITY),
        occupantColor: () => colors.red,
        occupantShape: 'circle',
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Population',
        series: ['population'],
        colors: { population: colors.red },
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Mean vision and metabolism',
        series: ['vision.mean', 'metabolism.mean'],
        colors: { 'vision.mean': colors.blue, 'metabolism.mean': colors.orange },
      }),
    );
    sim.addView(
      histogramView({ title: 'Wealth distribution', distribution: 'wealthDistribution' }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Gini coefficient',
        series: ['gini'],
        yMin: 0,
        yMax: 1,
        colors: { gini: colors.purple },
      }),
    );
  },
});
