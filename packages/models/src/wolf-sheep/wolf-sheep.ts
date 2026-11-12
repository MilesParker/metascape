// SPDX-License-Identifier: EPL-2.0
import {
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** A cell of grass, either grown or regrowing. */
export class Patch extends Cell {
  grown = true;
  /** Ticks left until the grass has regrown. */
  regrowth = 0;
}

/** Common behavior of sheep and wolves. */
export abstract class Animal extends Occupant<Patch> {
  energy: number;
  /** Where a newborn starts; unset for the initial population, which starts anywhere. */
  birthCell: Patch | undefined;

  protected constructor(energy: number, birthCell?: Patch) {
    super();
    this.energy = energy;
    this.birthCell = birthCell;
  }

  override initialize(): void {
    const cell = this.birthCell ?? (this.sim.scape('grass') as GridScape<Patch>).randomCell();
    this.birthCell = undefined;
    if (cell) this.moveTo(cell);
  }

  /** Moves to a random neighboring cell and pays one unit of energy for it. */
  move(): void {
    const here = this.cell;
    if (!here) return;
    this.moveTo(this.random.pick(here.neighbors));
    this.energy -= 1;
  }
}

/** Grazes on grass. */
export class Sheep extends Animal {
  constructor(energy: number, birthCell?: Patch) {
    super(energy, birthCell);
  }
}

/** Hunts sheep. */
export class Wolf extends Animal {
  constructor(energy: number, birthCell?: Patch) {
    super(energy, birthCell);
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
    min: 0,
    max: 100,
    label: 'Energy from grass',
    description: 'Energy a sheep gains by eating grass.',
  }),
  wolfGain: real(20, {
    min: 0,
    max: 100,
    label: 'Energy from sheep',
    description: 'Energy a wolf gains by eating a sheep.',
  }),
  sheepReproduce: real(0.04, {
    min: 0,
    max: 1,
    label: 'Sheep reproduction',
    description: 'Chance per tick that a sheep reproduces.',
  }),
  wolfReproduce: real(0.05, {
    min: 0,
    max: 1,
    label: 'Wolf reproduction',
    description: 'Chance per tick that a wolf reproduces.',
  }),
  grassRegrowth: int(30, {
    min: 1,
    max: 1000,
    label: 'Grass regrowth time',
    description: 'Ticks for eaten grass to grow back.',
  }),
} as const;

export const wolfSheep = defineModel({
  name: 'Wolf Sheep Predation',
  description:
    'Wolf Sheep Predation (Wilensky, 1997, NetLogo Models Library), after the Lotka-Volterra predator-prey equations. Sheep wander a wrapped grid eating grass, which regrows slowly; wolves wander and eat sheep. Animals pay energy to move, die when it runs out, and reproduce at random, splitting their energy with the offspring. The agent-based version shows what the equations cannot: oscillating populations that are driven by space, chance and local extinctions.',
  parameters,
  build(sim) {
    const p = sim.parameters;
    const grass = sim.addScape(
      new GridScape<Patch>({
        name: 'grass',
        width: p.width,
        height: p.height,
        wrap: true,
        multiOccupancy: true,
        create: () => new Patch(),
      }),
    );
    // Cells are created while the simulation is populated; give them their initial grass then.
    grass.addInitialRule({
      name: 'seed grass',
      execute(patch) {
        patch.grown = patch.random.chance(0.5);
        patch.regrowth = patch.grown ? 0 : patch.random.int(1, p.grassRegrowth + 1);
      },
    });
    grass.addRule('grow', (patch) => {
      if (patch.grown) return;
      if (--patch.regrowth <= 0) patch.grown = true;
    });
    grass.order = 'sequential';

    const sheep: Scape<Sheep> = sim.addScape(
      new Scape<Sheep>({
        name: 'sheep',
        size: p.initialSheep,
        create: () => new Sheep(sheep.random.float() * 2 * p.sheepGain),
      }),
    );
    const wolves: Scape<Wolf> = sim.addScape(
      new Scape<Wolf>({
        name: 'wolves',
        size: p.initialWolves,
        create: () => new Wolf(wolves.random.float() * 2 * p.wolfGain),
      }),
    );

    sheep.addRule('sheep', (animal) => {
      animal.move();
      const cell = animal.cell;
      if (cell?.grown) {
        cell.grown = false;
        cell.regrowth = p.grassRegrowth;
        animal.energy += p.sheepGain;
      }
      if (animal.energy < 0) {
        animal.die();
        return;
      }
      if (cell && sheep.random.chance(p.sheepReproduce)) {
        animal.energy /= 2;
        sheep.add(new Sheep(animal.energy, cell));
      }
    });

    wolves.addRule('wolf', (animal) => {
      animal.move();
      const cell = animal.cell;
      if (cell) {
        for (const occupant of cell.occupants) {
          if (occupant instanceof Sheep) {
            occupant.die();
            animal.energy += p.wolfGain;
            break;
          }
        }
      }
      if (animal.energy < 0) {
        animal.die();
        return;
      }
      if (cell && wolves.random.chance(p.wolfReproduce)) {
        animal.energy /= 2;
        wolves.add(new Wolf(animal.energy, cell));
      }
    });

    sim.data.count(sheep, 'sheep');
    sim.data.count(wolves, 'wolves');
    sim.data.count(grass, 'grass', (patch) => patch.grown);

    sim.observe({
      stepped(s) {
        if (sheep.size === 0 && wolves.size === 0) s.stop('all animals are gone');
      },
    });

    const grown = colors.green;
    const bare = colors.brown;
    sim.addView(
      gridView<Patch, Animal>({
        title: 'Meadow',
        grid: grass,
        cellColor: (patch) => (patch.grown ? grown : bare),
        // Where a cell holds both kinds, only the wolf is drawn.
        occupantColor: (animal) => {
          if (animal instanceof Wolf) return colors.black;
          const cell = animal.cell;
          if (cell?.occupants.some((other) => other instanceof Wolf)) return undefined;
          return colors.white;
        },
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Populations',
        series: ['sheep', 'wolves', 'grass'],
        colors: { sheep: colors.blue, wolves: colors.red, grass: colors.green },
        yMin: 0,
      }),
    );
  },
});
