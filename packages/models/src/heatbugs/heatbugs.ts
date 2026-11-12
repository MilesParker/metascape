// SPDX-License-Identifier: EPL-2.0
import {
  Cell,
  colors,
  defineModel,
  diffusion,
  gradient,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** One site of the Heatbugs world, holding heat. */
export class HeatCell extends Cell {
  heat = 0;
}

/** Ranges and probabilities that bugs draw their traits from. */
export interface BugSettings {
  readonly idealMin: number;
  readonly idealMax: number;
  readonly outputMin: number;
  readonly outputMax: number;
  readonly randomMove: number;
}

/**
 * A heat bug: it radiates a fixed amount of heat into its cell and prefers
 * one particular temperature, moving about to reach it.
 */
export class HeatBug extends Occupant<HeatCell> {
  /** The temperature this bug is happiest at. */
  ideal = 0;
  /** The heat it adds to its cell each tick. */
  output = 0;
  /** The distance between its cell's heat and its ideal, as of its last turn. */
  unhappiness = 0;

  constructor(
    private readonly settings: BugSettings,
    private readonly world: GridScape<HeatCell>,
  ) {
    super();
  }

  override initialize(): void {
    const s = this.settings;
    const random = this.random;
    this.ideal = s.idealMin + random.float() * (s.idealMax - s.idealMin);
    this.output = s.outputMin + random.float() * (s.outputMax - s.outputMin);
    const home = this.world.randomAvailableCell();
    if (home) {
      this.moveTo(home);
      this.unhappiness = Math.abs(home.heat - this.ideal);
    } else {
      this.die();
    }
  }

  /** Heat the cell, assess it, and move to the free neighbor that suits better. */
  act(): void {
    const here = this.cell;
    if (!here) return;
    here.heat += this.output;
    const ideal = this.ideal;
    this.unhappiness = Math.abs(here.heat - ideal);
    if (this.unhappiness === 0) return;

    const random = this.random;
    const neighbors = here.neighbors;
    let target: HeatCell | undefined;
    if (random.chance(this.settings.randomMove)) {
      let free = 0;
      for (const n of neighbors) {
        if (n.isAvailable && random.int(0, ++free) === 0) target = n;
      }
    } else {
      // Hotter if too cold, cooler if too hot: the free neighbor closest to the ideal,
      // but only if it is closer than the current cell. Random among equals.
      const wantHotter = here.heat < ideal;
      let bestGap = this.unhappiness;
      let ties = 0;
      for (const n of neighbors) {
        if (!n.isAvailable) continue;
        const gap = Math.abs(n.heat - ideal);
        // A neighbor on the wrong side of the ideal is not what the bug looks for.
        if (n.heat < ideal !== wantHotter && gap !== 0) continue;
        if (gap < bestGap) {
          bestGap = gap;
          target = n;
          ties = 1;
        } else if (gap === bestGap && target && random.int(0, ++ties) === 0) {
          target = n;
        }
      }
    }
    if (target) this.moveTo(target);
  }
}

/**
 * The Swarm "Heatbugs" model.
 */
export const heatbugs = defineModel({
  name: 'Heatbugs',
  description:
    'The Heatbugs model from the Swarm simulation system (Santa Fe Institute, Minar, Burkhart, ' +
    'Langton and Askenazi, 1996). Bugs radiate heat and try to sit at a preferred temperature, ' +
    'while the heat diffuses and evaporates across a torus. No bug is told to cluster, yet ' +
    'the swarm gathers into warm clumps that drift about as each bug seeks the right ' +
    'temperature, a standard illustration of self-organization from purely local rules.',
  parameters: {
    width: int(50, { min: 5, max: 200, label: 'Width', description: 'Number of columns.' }),
    height: int(50, { min: 5, max: 200, label: 'Height', description: 'Number of rows.' }),
    bugs: int(200, { min: 0, max: 5000, label: 'Bugs', description: 'Number of heat bugs.' }),
    idealMin: real(12, {
      min: 0,
      max: 200,
      label: 'Ideal min',
      description: 'Lowest preferred temperature.',
    }),
    idealMax: real(40, {
      min: 0,
      max: 200,
      label: 'Ideal max',
      description: 'Highest preferred temperature.',
    }),
    outputMin: real(3, {
      min: 0,
      max: 50,
      label: 'Output min',
      description: 'Lowest heat a bug adds per tick.',
    }),
    outputMax: real(10, {
      min: 0,
      max: 50,
      label: 'Output max',
      description: 'Highest heat a bug adds per tick.',
    }),
    diffusionRate: real(0.5, {
      min: 0,
      max: 1,
      label: 'Diffusion rate',
      description: 'Fraction of its heat each cell shares with its neighbors per tick.',
    }),
    evaporationRate: real(0.03, {
      min: 0,
      max: 1,
      label: 'Evaporation rate',
      description: 'Fraction of heat lost from each cell per tick.',
    }),
    randomMove: real(0.1, {
      min: 0,
      max: 1,
      label: 'Random move',
      description: 'Probability that a bug moves to a random free neighbor instead.',
    }),
    maxHeat: real(60, {
      min: 1,
      max: 1000,
      label: 'Display max heat',
      description: 'The heat shown as brightest in the grid view.',
    }),
  },

  build(sim) {
    const p = sim.parameters;
    if (p.idealMin > p.idealMax) throw new RangeError('Heatbugs: idealMin exceeds idealMax');
    if (p.outputMin > p.outputMax) throw new RangeError('Heatbugs: outputMin exceeds outputMax');
    if (p.bugs > p.width * p.height) throw new RangeError('Heatbugs: more bugs than cells');

    const world = sim.addScape(
      new GridScape<HeatCell>({
        name: 'world',
        width: p.width,
        height: p.height,
        wrap: true,
        neighborhood: 'moore',
        order: 'sequential',
        create: () => new HeatCell(),
      }),
    );
    world.addRule(
      diffusion<HeatCell>({
        name: 'heat',
        get: (cell) => cell.heat,
        set: (cell, value) => {
          cell.heat = value;
        },
        rate: p.diffusionRate,
        evaporation: p.evaporationRate,
      }),
    );

    const bugs = sim.addScape(
      new Scape<HeatBug>({
        name: 'bugs',
        size: p.bugs,
        create: () => new HeatBug(p, world),
      }),
    );
    bugs.addRule('seek', (bug) => bug.act());

    sim.data.measure(bugs, 'unhappiness', (bug) => bug.unhappiness, {
      statistics: ['mean', 'max'],
    });
    sim.data.measure(world, 'heat', (cell) => cell.heat, { statistics: ['sum'] });
  },

  views(sim) {
    const world = sim.scape('world') as GridScape<HeatCell>;
    const maxHeat = sim.parameters.maxHeat;
    const heatColor = gradient(rgb(8, 8, 16), rgb(150, 30, 20), colors.orange, rgb(255, 245, 200));
    return [
      gridView<HeatCell, HeatBug>({
        title: 'Heat and bugs',
        grid: world,
        cellColor: (cell) => heatColor(cell.heat / maxHeat),
        occupantColor: () => colors.green,
        occupantShape: 'circle',
      }),
      timeSeriesView({
        title: 'Mean unhappiness',
        series: ['unhappiness.mean'],
        colors: { 'unhappiness.mean': colors.orange },
      }),
    ];
  },
});
