// SPDX-License-Identifier: EPL-2.0
import {
  Array2DMoore,
  CellOccupant,
  colors,
  defineModel,
  gridView,
  HostCell,
  int,
  real,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** A cell of grass, either grown or regrowing. */
export class Patch extends HostCell {
  grown = true;
  /** Periods left until the grass has regrown. */
  regrowth = 0;
}

/** Common behavior of sheep and wolves. */
export abstract class Animal extends CellOccupant<Patch> {
  energy: number;
  /** Where a newborn starts; unset for the initial population, which starts anywhere. */
  birthCell: Patch | undefined;

  protected constructor(energy: number, meadow: Scape<Patch>, birthCell?: Patch) {
    super();
    this.energy = energy;
    this.hostScape = meadow;
    this.birthCell = birthCell;
  }

  override initialize(): void {
    const cell = this.birthCell ?? this.hostScape?.findRandom();
    this.birthCell = undefined;
    if (cell) this.moveTo(cell);
  }

  /** Moves to a random neighboring cell and pays one unit of energy for it. */
  move(): void {
    if (!this.hostCell) return;
    this.randomWalk();
    this.energy -= 1;
  }
}

/** Grazes on grass. */
export class Sheep extends Animal {
  constructor(energy: number, meadow: Scape<Patch>, birthCell?: Patch) {
    super(energy, meadow, birthCell);
  }
}

/** Hunts sheep. */
export class Wolf extends Animal {
  constructor(energy: number, meadow: Scape<Patch>, birthCell?: Patch) {
    super(energy, meadow, birthCell);
  }
}

const parameters = {
  width: int(40, { min: 5, max: 200, label: 'Width', description: 'Grid width in cells.' }),
  height: int(40, { min: 5, max: 200, label: 'Height', description: 'Grid height in cells.' }),
  initialSheep: int(100, {
    min: 0,
    max: 5000,
    label: 'Initial sheep',
    description: 'Number of sheep at the start.',
  }),
  initialWolves: int(30, {
    min: 0,
    max: 5000,
    label: 'Initial wolves',
    description: 'Number of wolves at the start.',
  }),
  sheepGain: real(4, {
    live: true,
    min: 0,
    max: 100,
    label: 'Energy from grass',
    description: 'Energy a sheep gains by eating grass.',
  }),
  wolfGain: real(20, {
    live: true,
    min: 0,
    max: 100,
    label: 'Energy from sheep',
    description: 'Energy a wolf gains by eating a sheep.',
  }),
  sheepReproduce: real(0.04, {
    live: true,
    min: 0,
    max: 1,
    label: 'Sheep reproduction',
    description: 'Chance per period that a sheep reproduces.',
  }),
  wolfReproduce: real(0.05, {
    live: true,
    min: 0,
    max: 1,
    label: 'Wolf reproduction',
    description: 'Chance per period that a wolf reproduces.',
  }),
  grassRegrowth: int(30, {
    live: true,
    min: 1,
    max: 1000,
    label: 'Grass regrowth time',
    description: 'Periods for eaten grass to grow back.',
  }),
} as const;

export const wolfSheep = defineModel({
  name: 'Wolf Sheep Predation',
  summary: 'Wolves eat sheep, sheep eat grass; populations boom and crash in predator-prey cycles.',
  tags: ['ecology', 'predator-prey'],
  description:
    'Wolf Sheep Predation (Wilensky, 1997, NetLogo Models Library), after the Lotka-Volterra predator-prey equations. Sheep wander a wrapped grid eating grass, which regrows slowly; wolves wander and eat sheep. Animals pay energy to move, die when it runs out, and reproduce at random, splitting their energy with the offspring. The agent-based version shows what the equations cannot: oscillating populations that are driven by space, chance and local extinctions.',
  explorations: [
    {
      title: 'Fast-growing grass',
      description: 'More food for sheep: do the wolves win or lose?',
      parameters: { grassRegrowth: 5 },
    },
    {
      title: 'Lean wolves',
      description: 'Each sheep gives a wolf less energy. Can the wolves survive?',
      parameters: { wolfGain: 8 },
    },
  ],
  parameters,
  build(root) {
    const p = root.parameters;
    const grass = root.add(
      new Scape<Patch>({
        name: 'grass',
        space: new Array2DMoore<Patch>({ multiOccupancy: true }),
        extent: [p.width, p.height],
        periodic: true,
        prototypeAgent: () => new Patch(),
      }),
    );
    // Cells are created when the model is populated; give them their initial grass then.
    grass.addInitialRule({
      name: 'seed grass',
      randomExecution: false,
      causesRemoval: false,
      execute(patch) {
        patch.grown = patch.random.chance(0.5);
        patch.regrowth = patch.grown ? 0 : patch.random.int(1, p.grassRegrowth + 1);
      },
    });
    grass.addRule(
      'grow',
      (patch) => {
        if (patch.grown) return;
        if (--patch.regrowth <= 0) patch.grown = true;
      },
      { randomExecution: false, causesRemoval: false },
    );

    const sheep: Scape<Sheep> = root.add(
      new Scape<Sheep>({
        name: 'sheep',
        size: p.initialSheep,
        prototypeAgent: () => new Sheep(sheep.random.float() * 2 * p.sheepGain, grass),
      }),
    );
    const wolves: Scape<Wolf> = root.add(
      new Scape<Wolf>({
        name: 'wolves',
        size: p.initialWolves,
        prototypeAgent: () => new Wolf(wolves.random.float() * 2 * p.wolfGain, grass),
      }),
    );

    sheep.addRule('sheep', (animal) => {
      animal.move();
      const cell = animal.hostCell;
      if (cell?.grown) {
        cell.grown = false;
        cell.regrowth = root.parameters.grassRegrowth;
        animal.energy += root.parameters.sheepGain;
      }
      if (animal.energy < 0) {
        animal.die();
        return;
      }
      if (cell && sheep.random.chance(root.parameters.sheepReproduce)) {
        animal.energy /= 2;
        sheep.add(new Sheep(animal.energy, grass, cell));
      }
    });

    wolves.addRule('wolf', (animal) => {
      animal.move();
      const cell = animal.hostCell;
      if (cell) {
        for (const occupant of cell.occupants) {
          if (occupant instanceof Sheep) {
            occupant.die();
            animal.energy += root.parameters.wolfGain;
            break;
          }
        }
      }
      if (animal.energy < 0) {
        animal.die();
        return;
      }
      if (cell && wolves.random.chance(root.parameters.wolfReproduce)) {
        animal.energy /= 2;
        wolves.add(new Wolf(animal.energy, grass, cell));
      }
    });

    sheep.addStatCollector(stat.count('sheep'));
    wolves.addStatCollector(stat.count('wolves'));
    grass.addStatCollector(stat.count('grass', (patch) => patch.grown));

    root.add(new Scape({ name: 'meadow', space: new Singleton() })).addRule(
      'stop when empty',
      () => {
        if (sheep.size === 0 && wolves.size === 0) root.stop('all animals are gone');
      },
      { randomExecution: false, causesRemoval: false },
    );

    const grown = colors.green;
    const bare = colors.brown;
    grass.addView(
      gridView<Patch, Animal>({
        title: 'Meadow',
        scape: grass,
        legend: [
          { color: colors.white, label: 'Sheep', mark: 'agent' },
          { color: colors.black, label: 'Wolf', mark: 'agent' },
          { color: grown, label: 'Grass' },
          { color: bare, label: 'Bare ground' },
        ],
        cellColor: (patch) => (patch.grown ? grown : bare),
        // Where a cell holds both kinds, only the wolf is drawn.
        occupantColor: (animal) => {
          if (animal instanceof Wolf) return colors.black;
          const cell = animal.hostCell;
          if (cell?.occupants.some((other) => other instanceof Wolf)) return undefined;
          return colors.white;
        },
      }),
    );
    root.addView(
      timeSeriesView({
        title: 'Populations',
        series: ['sheep', 'wolves', 'grass'],
        colors: { sheep: colors.blue, wolves: colors.red, grass: colors.green },
        yMin: 0,
      }),
    );
  },
});
