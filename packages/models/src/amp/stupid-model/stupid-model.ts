// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example models StupidModel1.metaabm,
// StupidModel2.metaabm, StupidModel3.metaabm and StupidModel5.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Cell,
  colors,
  GridScape,
  gridView,
  int,
  Occupant,
  rgb,
  Scape,
  timeSeriesView,
  type Color,
  type Provenance,
  type Simulation,
} from '@metascape/engine';

/** The parameters shared by every StupidModel variant, with the legacy defaults. */
export const stupidParameters = {
  bugCount: int(100, {
    min: 0,
    max: 10000,
    label: 'Bug Count',
    description: 'The number of bugs to create.',
  }),
  habitatCount: int(0, {
    min: 0,
    max: 0,
    label: 'Habitat Count',
    description:
      'The number of habitats to create. No act of the original model reads it (the habitats are the cells of the grid), so it has no effect.',
  }),
  bugVision: int(4, {
    min: 1,
    max: 50,
    label: 'Bug Vision',
    description: 'How far a bug can see, in cells (Moore distance).',
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
} as const;

/** How the variants differ. */
export interface StupidVariant {
  readonly label: string;
  /** What the "Grow" rule does: nothing (no such rule), `increment` the size by one, or `eat` habitat food. */
  readonly grow: 'none' | 'increment' | 'eat';
  /** Habitats grow food by a uniform draw in [0, rate) every tick; `undefined` means they do nothing. */
  readonly foodRate: number | undefined;
  /** Whether bugs are coloured by size (white to red) or plain red. */
  readonly sizeColor: boolean;
  /** Habitat colour from the model's style. */
  readonly habitatColor: Color;
}

/** Provenance common to the four variants; `portedFrom` is set per model. */
export function stupidProvenance(file: string, note?: string): Provenance {
  return {
    authors: 'Steven F. Railsback, Steven L. Lytinen and Volker Grimm',
    citation:
      'Railsback, S. F., Lytinen, S. L., & Grimm, V. (2005). StupidModel and extensions: A template and teaching tool for agent-based modeling platforms.',
    portedFrom: `Eclipse AMP, ${file}.metaabm`,
    copyright:
      'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License',
    ...(note ? { note } : {}),
  };
}

/** A patch of habitat: one cell of the grid. */
export class Habitat extends Cell {
  /** Food on the cell (models 3 and 5). */
  foodAvailability = 0;
}

/** A bug: it moves to a random free cell within its vision, then grows. */
export class Bug extends Occupant<Habitat> {
  /** Size: whole numbers in models 2 and 3, real in model 5. */
  size = 0;
  /** The most food a bug eats in a tick (model 5). */
  readonly maxConsumption = 0.2;

  constructor(
    private readonly world: GridScape<Habitat>,
    private readonly vision: number,
  ) {
    super();
  }

  /** The "Initialize" initial rule: move to a random available habitat. */
  placeRandomly(): void {
    const home = this.world.randomAvailableCell();
    if (home) this.moveTo(home);
  }

  /** The movement rule: a random available habitat within `bugVision`, if any. */
  move(): void {
    const here = this.cell;
    if (!here) return;
    const open = this.world.within(here, this.vision).filter((cell) => cell.isAvailable);
    if (open.length > 0) this.moveTo(this.random.pick(open));
  }

  /** Models 2 and 3: size goes up by one. */
  growByOne(): void {
    this.size += 1;
  }

  /** Model 5: eat `min(food, maxConsumption)` from the current habitat and grow by it. */
  eat(): void {
    const here = this.cell;
    if (!here) return;
    const availability = here.foodAvailability;
    const consumption = availability < this.maxConsumption ? availability : this.maxConsumption;
    this.size += consumption;
    here.foodAvailability = availability - consumption;
  }
}

const sizeColor = (size: number): Color => {
  const inverse = 1 - Math.min(size / 10, 1);
  const channel = Math.floor(inverse * 255);
  return rgb(255, channel, channel);
};

/** Builds one StupidModel variant on a simulation. */
export function buildStupidModel(
  sim: Simulation<typeof stupidParameters>,
  variant: StupidVariant,
): void {
  const p = sim.parameters;

  // As in the original, the habitat grid is added first, so it steps before the bugs.
  const world = sim.addScape(
    new GridScape<Habitat>({
      name: 'Habitats',
      width: p.width,
      height: p.height,
      wrap: true,
      neighborhood: 'moore',
      schedule: 'byRule',
      order: 'sequential',
      create: () => new Habitat(),
    }),
  );
  const rate = variant.foodRate;
  if (rate !== undefined) {
    world.addRule('determindFoodProduction', (habitat) => {
      habitat.foodAvailability += habitat.random.float() * rate;
    });
  }

  const bugs = sim.addScape(
    new Scape<Bug>({
      name: 'Bugs',
      size: p.bugCount,
      schedule: 'byRule',
      order: 'shuffled',
      create: () => new Bug(world, p.bugVision),
    }),
  );
  bugs.addInitialRule('Initialize', (bug) => bug.placeRandomly());
  bugs.addRule('Random Movement', (bug) => bug.move());
  if (variant.grow === 'increment') bugs.addRule('Grow', (bug) => bug.growByOne());
  if (variant.grow === 'eat') bugs.addRule('Grow', (bug) => bug.eat());

  sim.data.count(bugs, 'Bugs Population');
  const series = ['Bugs Population'];
  if (variant.grow !== 'none') {
    sim.data.measure(bugs, 'Bug size', (bug) => bug.size, { statistics: ['mean', 'max'] });
  }
  if (variant.foodRate !== undefined) {
    sim.data.measure(world, 'Food', (habitat) => habitat.foodAvailability, {
      statistics: ['mean'],
    });
  }

  sim.addView(
    gridView<Habitat, Bug>({
      title: variant.label,
      grid: world,
      cellColor: () => variant.habitatColor,
      occupantColor: (bug) => (variant.sizeColor ? sizeColor(bug.size) : colors.red),
      occupantShape: 'circle',
    }),
  );
  if (variant.grow !== 'none') {
    sim.addView(
      timeSeriesView({
        title: 'Bug size',
        series: ['Bug size.mean', 'Bug size.max'],
      }),
    );
  }
  if (variant.foodRate !== undefined) {
    sim.addView(timeSeriesView({ title: 'Food per habitat', series: ['Food.mean'] }));
  }
  sim.addView(timeSeriesView({ title: 'Population', series, yMin: 0 }));
}
