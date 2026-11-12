// SPDX-License-Identifier: EPL-2.0
import {
  bool,
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
  type Random,
} from '@metascape/engine';

/** A site of the Schelling lattice, which knows where it sits in the list of free sites. */
export class SchellingCell extends Cell {
  /** Index in the list of free cells, or -1 while occupied. */
  freeIndex = -1;
}

/** The sites nobody stands on, kept as a list so that a random free site costs O(1). */
class FreeCells {
  readonly cells: SchellingCell[] = [];

  register(cell: SchellingCell): void {
    cell.freeIndex = this.cells.length;
    this.cells.push(cell);
  }

  /** Occupies a random free cell for good, returning it; its slot is filled from the end. */
  take(random: Random): SchellingCell | undefined {
    if (this.cells.length === 0) return undefined;
    const index = random.int(0, this.cells.length);
    const cell = this.cells[index]!;
    const last = this.cells.pop()!;
    if (last !== cell) {
      this.cells[index] = last;
      last.freeIndex = index;
    }
    cell.freeIndex = -1;
    return cell;
  }

  /** Occupies a random free cell and frees `vacated` in its place; returns the cell taken. */
  swap(random: Random, vacated: SchellingCell): SchellingCell | undefined {
    if (this.cells.length === 0) return undefined;
    const index = random.int(0, this.cells.length);
    const cell = this.cells[index]!;
    this.cells[index] = vacated;
    vacated.freeIndex = index;
    cell.freeIndex = -1;
    return cell;
  }
}

/** A resident of one of two groups who wants enough neighbors of its own group. */
export class Resident extends Occupant<SchellingCell> {
  constructor(
    /** 0 or 1. */
    readonly group: number,
    private readonly tolerance: number,
    private readonly free: FreeCells,
  ) {
    super();
  }

  override initialize(): void {
    const home = this.free.take(this.random);
    if (home) this.moveTo(home);
    else this.die();
  }

  /**
   * The fraction of occupied neighboring cells holding the same group, or 1
   * when there are no neighbors at all (nothing to be unhappy about).
   */
  likeFraction(): number {
    const here = this.cell;
    if (!here) return 1;
    let like = 0;
    let occupied = 0;
    for (const neighbor of here.neighbors) {
      const other = neighbor.occupant as Resident | undefined;
      if (!other) continue;
      occupied++;
      if (other.group === this.group) like++;
    }
    return occupied === 0 ? 1 : like / occupied;
  }

  /** Whether the like-neighbor fraction is below the tolerance. */
  isUnhappy(): boolean {
    return this.likeFraction() < this.tolerance;
  }

  /** Moves to a random free cell if unhappy. */
  act(): void {
    const here = this.cell;
    if (!here || !this.isUnhappy()) return;
    const target = this.free.swap(this.random, here);
    if (target) this.moveTo(target);
  }
}

/**
 * Schelling's segregation model.
 */
export const schelling = defineModel({
  name: 'Schelling segregation',
  description:
    "Thomas Schelling's segregation model ('Dynamic Models of Segregation', Journal of " +
    'Mathematical Sociology, 1971). Residents of two groups live on a grid with some empty ' +
    'sites and move to a random vacancy whenever too small a share of their neighbors is ' +
    'like themselves. Even a mild preference for like neighbors drives strongly segregated ' +
    'neighborhoods that nobody intended.',
  parameters: {
    width: int(40, { min: 3, max: 300, label: 'Width', description: 'Number of columns.' }),
    height: int(40, { min: 3, max: 300, label: 'Height', description: 'Number of rows.' }),
    density: real(0.9, {
      min: 0,
      max: 1,
      label: 'Density',
      description: 'Fraction of sites that hold a resident.',
    }),
    ratio: real(0.5, {
      min: 0,
      max: 1,
      label: 'Group ratio',
      description: 'Fraction of residents who belong to the first group.',
    }),
    tolerance: real(0.4, {
      min: 0,
      max: 1,
      label: 'Tolerance',
      description:
        'A resident is unhappy when the share of like neighbors is below this threshold.',
    }),
    wrap: bool(false, {
      label: 'Wrap',
      description: 'Join the edges into a torus instead of having hard edges.',
    }),
  },

  build(sim) {
    const p = sim.parameters;
    const free = new FreeCells();
    sim.addScape(
      new GridScape<SchellingCell>({
        name: 'town',
        width: p.width,
        height: p.height,
        wrap: p.wrap,
        neighborhood: 'moore',
        create: () => {
          const cell = new SchellingCell();
          free.register(cell);
          return cell;
        },
      }),
    );

    const count = Math.round(p.density * p.width * p.height);
    const firstGroup = Math.round(p.ratio * count);
    const residents = sim.addScape(
      new Scape<Resident>({
        name: 'residents',
        size: count,
        create: (index) => new Resident(index < firstGroup ? 0 : 1, p.tolerance, free),
      }),
    );
    residents.addRule('relocate', (resident) => resident.act());

    sim.data.count(residents, 'unhappy', (resident) => resident.isUnhappy());
    sim.data.measure(residents, 'like', (resident) => resident.likeFraction(), {
      statistics: ['mean'],
    });

    const finishIfSettled = (): void => {
      if (sim.data.latest('unhappy') === 0) sim.stop('Nobody is unhappy');
    };
    sim.observe({ initialized: finishIfSettled, stepped: finishIfSettled });
  },

  views(sim) {
    const town = sim.scape('town') as GridScape<SchellingCell>;
    const groupColors = [colors.blue, colors.orange] as const;
    const empty = rgb(236, 236, 238);
    return [
      gridView<SchellingCell>({
        title: 'Town',
        grid: town,
        cellColor: (cell) => {
          const resident = cell.occupant as Resident | undefined;
          return resident ? groupColors[resident.group]! : empty;
        },
        background: empty,
      }),
      timeSeriesView({
        title: 'Unhappiness and segregation',
        series: ['unhappy', 'like.mean'],
        colors: { unhappy: colors.red, 'like.mean': colors.teal },
      }),
    ];
  },
});
