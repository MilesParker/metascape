// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Heatbugs.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
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
  type Rule,
} from '@metascape/engine';

/** One site of the heat grid. */
export class HeatCell extends Cell {
  heat = 0;
}

/** Settings a bug reads from the model. */
export interface HeatBugSettings {
  readonly idealMin: number;
  readonly idealMax: number;
  readonly outputMin: number;
  readonly outputMax: number;
  readonly maximumHeat: number;
}

/** Sets a cell's heat, capping it at `maximumHeat` as the original `setHeat` does. */
export function setHeat(cell: HeatCell, value: number, maximumHeat: number): void {
  cell.heat = value > maximumHeat ? maximumHeat : value;
}

/** Equality of the original's DataPointConcrete.equals: relative or absolute difference below 1e-9. */
function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs((a - b) / (a + b)) < 1e-9 || Math.abs(a - b) < 1e-9;
}

/**
 * The original's findMaximum / findMinimum: the extreme of `value` over the candidates,
 * choosing uniformly among those equal to it (within tolerance). `undefined` if none.
 * `sign` 1 finds the maximum, -1 the minimum.
 */
export function pickExtreme<T>(
  candidates: readonly T[],
  value: (item: T) => number,
  sign: 1 | -1,
  random: Random,
): T | undefined {
  let best = -Infinity;
  let found: T | undefined;
  let ties: T[] | undefined;
  for (const item of candidates) {
    const v = value(item) * sign;
    if (v > best) {
      best = v;
      found = item;
      ties = undefined;
    } else if (nearlyEqual(v, best)) {
      if (!ties) ties = found === undefined ? [] : [found];
      ties.push(item);
    }
  }
  return ties ? random.pick(ties) : found;
}

/** A heat bug. */
export class HeatBug extends Occupant<HeatCell> {
  idealTemperature = 0;
  outputHeat = 0;

  constructor(
    private readonly world: GridScape<HeatCell>,
    private readonly settings: HeatBugSettings,
  ) {
    super();
  }

  /** Derived: the distance between the heat of the bug's cell and its ideal temperature. */
  get unhappiness(): number {
    const here = this.cell;
    return here ? Math.abs(here.heat - this.idealTemperature) : 0;
  }

  /** The "Initialize" initial rule: a random available cell. */
  placeRandomly(): void {
    const home = this.world.randomAvailableCell();
    if (home) this.moveTo(home);
  }

  /** The "Initialize State" initial rule: uniform draws of ideal temperature and output heat. */
  initializeState(): void {
    const s = this.settings;
    this.idealTemperature = s.idealMin + this.random.float() * (s.idealMax - s.idealMin);
    this.outputHeat = s.outputMin + this.random.float() * (s.outputMax - s.outputMin);
  }

  /**
   * The "Seek Heat Rule". The cell's heat plus the bug's output is worked out first. If the cell is
   * colder than the ideal, the bug moves to the hottest available cell within one step; otherwise to
   * the coldest one (even if that is worse than staying). The heat is then written to the cell the
   * bug started on, which is the original's behaviour.
   */
  seekHeat(): void {
    const origin = this.cell;
    if (!origin) return;
    const heated = origin.heat + this.outputHeat;
    const open = this.world.within(origin, 1).filter((cell) => cell.isAvailable);
    const target =
      origin.heat < this.idealTemperature
        ? pickExtreme(open, (cell) => cell.heat, 1, this.random)
        : pickExtreme(open, (cell) => cell.heat, -1, this.random);
    if (target) this.moveTo(target);
    setHeat(origin, heated, this.settings.maximumHeat);
  }
}

/**
 * The diffusion rule: each cell moves toward the mean of its neighbours by `rate`, then
 * loses `evaporation`. Two-phase, so the order of cells does not matter.
 */
export function heatDiffusion(
  rate: number,
  evaporation: number,
  maximumHeat: number,
): Rule<HeatCell> {
  const next = new Map<HeatCell, number>();
  return {
    name: 'Diffuse',
    execute(cell) {
      const neighbors = cell.neighbors;
      let sum = 0;
      for (const n of neighbors) sum += n.heat;
      sum -= neighbors.length * cell.heat;
      sum /= neighbors.length;
      next.set(cell, (cell.heat + sum * rate) * (1 - evaporation));
    },
    update(cell) {
      const value = next.get(cell);
      if (value === undefined) return;
      next.delete(cell);
      setHeat(cell, value, maximumHeat);
    },
  };
}

/** The Heatbugs model of the AMP examples. */
export const heatbugs = defineModel({
  name: 'Heatbugs (AMP)',
  description:
    'Heat bugs radiate heat into the cell they stand on and move to a neighbouring cell that brings them toward their own ideal temperature, while heat diffuses and evaporates over a bounded grid.',
  provenance: {
    portedFrom: 'Eclipse AMP, Heatbugs.metaabm',
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    note: 'The sources name no author or publication for this model. Ported from the model file and its generated Java only.',
  },
  parameters: {
    heatBugCount: int(100, {
      min: 0,
      max: 5000,
      label: 'Heat Bug Count',
      description: 'The number of heat bugs to create.',
    }),
    diffusionRate: real(1, {
      min: 0,
      max: 1,
      label: 'Diffusion Rate',
      description: 'How far each cell moves toward the mean of its neighbours per tick.',
    }),
    evaporationRate: real(0.01, {
      min: 0,
      max: 1,
      label: 'Evaporation Rate',
      description: 'The fraction of heat each cell loses per tick.',
    }),
    idealTemperatureDrawMinimum: real(135, {
      min: 0,
      max: 1000,
      label: 'Ideal Temperature Draw Minimum',
      description: 'Lowest ideal temperature drawn.',
    }),
    idealTemperatureDrawMaximum: real(240, {
      min: 0,
      max: 1000,
      label: 'Ideal Temperature Draw Maximum',
      description: 'Highest ideal temperature drawn.',
    }),
    outputHeatDrawMinimum: real(23, {
      min: 0,
      max: 1000,
      label: 'Output Heat Draw Minimum',
      description: 'Lowest output heat drawn.',
    }),
    outputHeatDrawMaximum: real(76, {
      min: 0,
      max: 1000,
      label: 'Output Heat Draw Maximum',
      description: 'Highest output heat drawn.',
    }),
    maximumHeat: int(340, {
      min: 1,
      max: 10000,
      label: 'Maximum Heat',
      description: 'The most heat a cell can hold; also the full-red level in the grid view.',
    }),
    width: int(100, {
      min: 3,
      max: 300,
      label: 'Width',
      description: 'The horizontal extent of the grid.',
    }),
    height: int(100, {
      min: 3,
      max: 300,
      label: 'Height',
      description: 'The vertical extent of the grid.',
    }),
  },

  build(sim) {
    const p = sim.parameters;
    // As in the original, the heat grid is added first, so it diffuses before the bugs act.
    const grid = sim.addScape(
      new GridScape<HeatCell>({
        name: 'Heat Grids',
        width: p.width,
        height: p.height,
        wrap: false,
        neighborhood: 'moore',
        schedule: 'byRule',
        order: 'sequential',
        create: () => new HeatCell(),
      }),
    );
    grid.addRule(heatDiffusion(p.diffusionRate, p.evaporationRate, p.maximumHeat));

    const settings: HeatBugSettings = {
      idealMin: p.idealTemperatureDrawMinimum,
      idealMax: p.idealTemperatureDrawMaximum,
      outputMin: p.outputHeatDrawMinimum,
      outputMax: p.outputHeatDrawMaximum,
      maximumHeat: p.maximumHeat,
    };
    const bugs = sim.addScape(
      new Scape<HeatBug>({
        name: 'Heat Bugs',
        size: p.heatBugCount,
        schedule: 'byRule',
        order: 'shuffled',
        create: () => new HeatBug(grid, settings),
      }),
    );
    bugs.addInitialRule('Initialize', (bug) => bug.placeRandomly());
    bugs.addInitialRule('Initialize State', (bug) => bug.initializeState());
    bugs.addRule('Seek Heat Rule', (bug) => bug.seekHeat());

    sim.data.count(bugs, 'Heat Bugs Population');
    sim.data.measure(bugs, 'Heat Bug Unhappiness', (bug) => bug.unhappiness, {
      statistics: ['sum', 'mean', 'min', 'max'],
    });
    sim.data.measure(grid, 'Heat', (cell) => cell.heat, { statistics: ['sum', 'mean', 'max'] });

    sim.addView(
      gridView<HeatCell, HeatBug>({
        title: 'Heat grid',
        grid,
        // Style: the red channel is heat / maximum heat; bugs are green ovals.
        cellColor: (cell) => rgb(Math.floor(Math.min(cell.heat / p.maximumHeat, 1) * 255), 0, 0),
        occupantColor: () => colors.green,
        occupantShape: 'circle',
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Heat bug unhappiness',
        series: [
          'Heat Bug Unhappiness.mean',
          'Heat Bug Unhappiness.min',
          'Heat Bug Unhappiness.max',
        ],
      }),
    );
    sim.addView(timeSeriesView({ title: 'Heat', series: ['Heat.mean', 'Heat.max'] }));
  },
});
