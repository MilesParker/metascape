// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.bionland.Model_A to Model_M, Model_P and
// Model (with their inner classes BionTile, Bion, RedBion, OrangeBion, BlueBion, the move, consume,
// leave-energy and diffusion rules), shared here because the steps are near-copies of one another.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Cell,
  GridScape,
  gridView,
  int,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
  type Color,
  type Model,
  type ParameterSchema,
  type Rule,
  type Simulation,
} from '@metascape/engine';
import {
  cellAway,
  cellToward,
  maximumWithin,
  nearestMatch,
  type LatticeKind,
} from './lattice-space';

/** The three bion species, in the order of Ascape's rule lists. */
export const SPECIES = ['Red', 'Orange', 'Blue'] as const;

/** Java's `Color.red`, `Color.orange` and `Color.blue`. */
export const SPECIES_COLORS: readonly Color[] = [0xff0000, 0xffc800, 0x0000ff];

/** Where the legacy provenance of every step is written once. */
export const BIONLAND_COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.';

/** One site of Bionland: it can hold the "energy" each species leaves behind. */
export class BionTile extends Cell {
  /** Red, orange and blue energy, in 0..1 once any bion has left some. */
  readonly energy: [number, number, number] = [0, 0, 0];
  /** Scratch space for the two-phase diffusion rules. */
  readonly pending: [number, number, number] = [0, 0, 0];
}

/** How a tile is coloured in the map. */
export type TileStyle = 'green' | 'lightGray' | 'black' | 'mixed' | 'pure';

/** What movement rules the species follow, besides any random walk. */
export type MoveStyle = 'none' | 'avoid' | 'energy';

/** Which tile energies a species consumes. */
export type ConsumeStyle = 'none' | 'others' | 'prey';

/** How tile energy diffuses. */
export type DiffusionStyle = 'none' | 'average' | 'parameterized';

/**
 * Everything that differs between the steps of the tutorial. A step is its
 * predecessor's configuration plus the few entries it changes.
 */
export interface LatticeConfig {
  readonly name: string;
  readonly description: string;
  /** The legacy class, such as `Model_C`. */
  readonly legacy: string;
  /** What this step adds, for the note on the model. */
  readonly adds: string;
  readonly kind: LatticeKind;
  readonly width: number;
  readonly height: number;
  /** Name of the territory scape, "Bionland" (or "Map" in the full model). */
  readonly territoryName: string;
  /** One undifferentiated population (steps A and B) or three species. */
  readonly species: 'one' | 'three';
  /** Size of the single population. */
  readonly singleCount: number;
  readonly density: number;
  readonly tiles: TileStyle;
  readonly walk: boolean;
  /** `fixed` is Ascape's hard-coded vision of 8 that ignores the range (steps G to M and P). */
  readonly vision: 'none' | 'range' | 'fixed';
  readonly move: MoveStyle;
  readonly consume: ConsumeStyle;
  /** Tile energy is deposited (and consumed). */
  readonly tileEnergy: boolean;
  /** Bions carry stored energy and fission or die by it. */
  readonly storedEnergy: boolean;
  /** Whether `bionEnergyGain` exists (step H on). */
  readonly gainParameter: boolean;
  readonly diffusion: DiffusionStyle;
  /** Record the stored energy of each species (step I on). */
  readonly energyStats: boolean;
  /** The full model's details: fission threshold parameter, `>=`, deposit scaled by gain, rule order. */
  readonly full: boolean;
  readonly occupantShape: 'circle' | 'square';
  /** Stop the run after this tick, as the legacy data-collecting launchers did. */
  readonly stopAt?: number;
  readonly densityKey: string;
  readonly visionKeys: readonly [string, string];
  readonly gainKey: string;
}

type Values = Readonly<Record<string, number | boolean | string>>;

function num(values: Values, key: string, fallback: number): number {
  const v = values[key];
  return typeof v === 'number' ? v : fallback;
}

/** The settings a running lattice model reads from its parameters. */
interface Settings {
  readonly leakage: number;
  readonly consumption: number;
  readonly gain: number;
  readonly initialEnergy: number;
  readonly fissionEnergy: number;
  readonly minVision: number;
  readonly maxVision: number;
  readonly diffusionConstant: number;
  readonly evaporation: number;
}

/** A bion: one agent of a species, standing on a tile. */
export class Bion extends Occupant<BionTile> {
  vision = 0;
  storedEnergy = 0;

  constructor(
    readonly species: number,
    private readonly world: LatticeWorld,
  ) {
    super();
  }

  override initialize(): void {
    const { config, settings } = this.world;
    if (config.vision === 'range') {
      this.vision = this.random.int(settings.minVision, settings.maxVision + 1);
    } else if (config.vision === 'fixed') {
      this.vision = 8;
    }
    if (config.storedEnergy) this.storedEnergy = config.full ? 1.5 : settings.initialEnergy;
  }

  /** Random walk: step to a random neighbor if it happens to be free. */
  randomWalk(): void {
    const cell = this.cell;
    if (!cell) return;
    const candidate = this.random.pick(this.world.grid.neighbors(cell));
    if (candidate.isAvailable) this.moveTo(candidate);
  }

  /** Moves one step toward a tile, if the tile one step that way is free. */
  moveToward(target: BionTile): void {
    const cell = this.cell;
    if (!cell) return;
    const next = cellToward(this.world.grid, cell, target);
    if (next.isAvailable) this.moveTo(next);
  }

  /** Moves one step away from a tile, if the tile one step that way is free. */
  moveAway(target: BionTile): void {
    const cell = this.cell;
    if (!cell) return;
    const next = cellAway(this.world.grid, cell, target, this.world.ring, this.random);
    if (next.isAvailable) this.moveTo(next);
  }

  /** Moves toward or away from the nearest bion of a species. */
  moveRelativeToSpecies(species: number, toward: boolean): void {
    const cell = this.cell;
    if (!cell) return;
    const target = nearestMatch(
      this.world.grid,
      cell,
      (c) => (c.occupant as Bion | undefined)?.species === species,
      this.vision,
      this.world.ring,
      this.random,
    );
    if (!target) return;
    if (toward) this.moveToward(target);
    else this.moveAway(target);
  }

  /** Moves toward or away from the tile with the most of a species' energy nearby. */
  moveRelativeToEnergy(species: number, toward: boolean): void {
    const cell = this.cell;
    if (!cell) return;
    const target = maximumWithin(
      this.world.grid,
      cell,
      (c) => c.energy[species] as number,
      this.vision,
      this.world.config.kind,
      this.random,
    );
    if (!target) return;
    if (toward) this.moveToward(target);
    else this.moveAway(target);
  }

  /** Eats up to `consumption` of one species' energy from the tile underfoot. */
  consume(species: number): void {
    const cell = this.cell;
    if (!cell) return;
    const energy = Math.min(cell.energy[species] as number, this.world.settings.consumption);
    cell.energy[species] = (cell.energy[species] as number) - energy;
    this.storedEnergy += energy;
  }

  /** Pays for living and leaves some of its own species' energy on the tile. */
  leaveEnergy(): void {
    const cell = this.cell;
    if (!cell) return;
    const { config, settings } = this.world;
    if (config.storedEnergy) {
      this.storedEnergy -= config.full
        ? settings.leakage
        : settings.leakage * (1.0 / settings.gain);
    }
    const deposit = config.full ? settings.leakage * settings.gain : settings.leakage;
    cell.energy[this.species] = Math.min((cell.energy[this.species] as number) + deposit, 1.0);
  }

  /** Death, when stored energy has run out. */
  death(): void {
    if (this.storedEnergy <= 0.0) this.die();
  }

  /** Splits in two when energy is high enough and a neighboring tile is free. */
  fissioning(): void {
    const { config, settings, grid } = this.world;
    const threshold = config.full ? settings.fissionEnergy : 2.0;
    if (!(config.full ? this.storedEnergy >= threshold : this.storedEnergy > threshold)) return;
    const cell = this.cell;
    if (!cell) return;
    const free = grid.neighbors(cell).filter((c) => c.isAvailable);
    if (free.length === 0) return;
    const child = new Bion(this.species, this.world);
    this.scape.add(child);
    child.moveTo(this.random.pick(free));
    const half = this.storedEnergy / 2.0;
    child.storedEnergy = half;
    this.storedEnergy = half;
  }
}

/** The shared world a step builds, which agents consult. */
export interface LatticeWorld {
  readonly config: LatticeConfig;
  readonly settings: Settings;
  readonly grid: GridScape<BionTile>;
  readonly ring: boolean;
}

function tileColor(style: TileStyle, tile: BionTile): Color {
  const [r, o, b] = tile.energy;
  switch (style) {
    case 'green':
      return 0x00ff00;
    case 'lightGray':
      return 0xc0c0c0;
    case 'black':
      return 0x000000;
    case 'mixed':
      return rgb(Math.min(1, r + o) * 255, o * 0.8 * 255, b * 255);
    case 'pure':
      return rgb(r * 255, o * 255, b * 255);
  }
}

/** Adds the parameters a step offers, with the legacy defaults. */
function schemaFor(config: LatticeConfig): ParameterSchema {
  const schema: Record<string, ReturnType<typeof real> | ReturnType<typeof int>> = {};
  if (config.species === 'three') {
    schema[config.densityKey] = real(config.density, {
      min: 0.01,
      max: 0.9,
      label: 'Initial population density',
      description: 'Fraction of sites that start occupied, shared between the three species.',
    });
  }
  if (config.vision !== 'none') {
    schema[config.visionKeys[0]] = int(8, {
      min: 1,
      max: 30,
      label: 'Minimum vision',
      description:
        config.vision === 'fixed' && !config.full
          ? 'How far a bion can see. Unused here, as in the original: vision is fixed at 8.'
          : 'How far a bion can see, at least. Searches reach at most about 8 sites.',
    });
    schema[config.visionKeys[1]] = int(8, {
      min: 1,
      max: 30,
      label: 'Maximum vision',
      description:
        config.vision === 'fixed' && !config.full
          ? 'How far a bion can see. Unused here, as in the original: vision is fixed at 8.'
          : 'How far a bion can see, at most. Searches reach at most about 8 sites.',
    });
  }
  if (config.tileEnergy) {
    schema['bionEnergyLeakage'] = real(0.02, {
      min: 0,
      max: 0.2,
      label: 'Bion energy leakage',
      description: 'Energy a bion leaves on its tile (and loses, once it stores energy) each tick.',
    });
    schema['bionEnergyConsumption'] = real(config.full ? 0.023 : 0.015, {
      min: 0,
      max: 0.2,
      label: 'Bion energy consumption',
      description: 'The most energy a bion eats from its tile each tick.',
    });
  }
  if (config.storedEnergy && !config.full) {
    schema['initialStoredEnergy'] = real(1.5, {
      min: 0.1,
      max: 5,
      label: 'Initial stored energy',
      description: 'Energy each bion starts with.',
    });
  }
  if (config.storedEnergy && config.full) {
    schema['fissionEnergy'] = real(2.0, {
      min: 0.5,
      max: 5,
      label: 'Fission energy',
      description: 'A bion splits in two when its stored energy reaches this.',
    });
  }
  if (config.gainParameter) {
    schema[config.gainKey] = real(1.0, {
      min: 0.8,
      max: 3,
      label: 'Bion energy gain',
      description: config.full
        ? 'Scales the energy bions leave on their tiles.'
        : 'How much each unit of consumed energy is worth: bions pay leakage divided by this.',
    });
  }
  if (config.diffusion === 'parameterized') {
    schema['diffusionConstant'] = real(1.0, {
      min: 0,
      max: 1,
      label: 'Diffusion constant',
      description: 'How far each tile moves toward the mean of its neighbors each tick.',
    });
    schema['evaporationRate'] = real(0.0, {
      min: 0,
      max: 0.2,
      label: 'Evaporation rate',
      description: 'Fraction of tile energy that disappears each tick.',
    });
  }
  return schema;
}

/** Builds a tutorial step (or the full model) from its configuration. */
export function latticeModel(config: LatticeConfig): Model {
  return {
    name: config.name,
    description: config.description,
    provenance: {
      portedFrom: `Ascape 5.6.1, org.ascape.examples.bionland.${config.legacy}`,
      copyright: BIONLAND_COPYRIGHT,
      note:
        `${config.adds} Authors and citation are not stated in the sources. ` +
        'Map colours follow the legacy colour features; ball images, sliders and custom drawing are not ported.',
    },
    parameters: schemaFor(config),
    build: (sim) => buildLattice(sim, config),
  };
}

function buildLattice(sim: Simulation, config: LatticeConfig): void {
  const values = sim.parameters as Values;
  const settings: Settings = {
    leakage: num(values, 'bionEnergyLeakage', 0.02),
    consumption: num(values, 'bionEnergyConsumption', 0.015),
    gain: num(values, config.gainKey, 1.0),
    initialEnergy: num(values, 'initialStoredEnergy', 1.5),
    fissionEnergy: num(values, 'fissionEnergy', 2.0),
    minVision: num(values, config.visionKeys[0], 8),
    maxVision: Math.max(num(values, config.visionKeys[0], 8), num(values, config.visionKeys[1], 8)),
    diffusionConstant: num(values, 'diffusionConstant', 1.0),
    evaporation: num(values, 'evaporationRate', 0.0),
  };
  const ring = config.kind === 'ring';

  const grid = new GridScape<BionTile>({
    name: config.territoryName,
    width: config.width,
    height: config.height,
    wrap: true,
    neighborhood: config.kind === 'vonNeumann' ? 'vonNeumann' : 'moore',
    create: () => new BionTile(),
    // Ascape: territory.setExecutionOrder(RULE_ORDER) once there is diffusion.
    schedule: 'byRule',
  });
  const world: LatticeWorld = { config, settings, grid, ring };
  if (config.diffusion !== 'none') {
    for (let colour = 0; colour < 3; colour++) grid.addRule(diffusionRule(world, colour));
  }
  sim.addScape(grid);

  const density = num(values, config.densityKey, config.density);
  const populationSize = Math.trunc((grid.width * grid.height * density) / 3.0);
  const scapes: Scape<Bion>[] = [];
  if (config.species === 'one') {
    scapes.push(sim.addScape(bionScape(world, 'Bions', 0, config.singleCount)));
  } else {
    SPECIES.forEach((name, index) => {
      scapes.push(sim.addScape(bionScape(world, name, index, populationSize)));
    });
  }

  // Ascape's initial rule MOVE_RANDOM_LOCATION_RULE. It is run once from here, not as an
  // initial rule, because bions born later by fission must not be moved to a random tile.
  sim.setup(() => {
    for (const scape of scapes) {
      for (const bion of scape.random.shuffle([...scape.members])) {
        const home = grid.randomAvailableCell();
        if (home) bion.moveTo(home);
        else bion.die();
      }
    }
  });

  // Statistics and charts.
  const names = config.species === 'one' ? ['Bions'] : [...SPECIES];
  scapes.forEach((scape, i) => sim.data.count(scape, names[i] as string));
  if (config.energyStats) {
    scapes.forEach((scape, i) => {
      sim.data.measure(scape, `${names[i]} Stored Energy`, (b) => b.storedEnergy, {
        statistics: ['count', 'mean', 'min', 'max'],
      });
    });
  }
  const useEnergyChart = config.energyStats && config.diffusion === 'none';
  const series = names.map((n) => (useEnergyChart ? `${n} Stored Energy.mean` : n));
  const colors: Record<string, Color> = {};
  series.forEach(
    (id, i) => (colors[id] = config.species === 'one' ? 0x000000 : (SPECIES_COLORS[i] as Color)),
  );

  sim.addView(
    gridView<BionTile, Bion>({
      title: 'Map',
      grid,
      cellColor: (tile) => tileColor(config.tiles, tile),
      occupantColor: (bion) =>
        config.species === 'one' ? 0x000000 : (SPECIES_COLORS[bion.species] as Color),
      occupantShape: config.occupantShape,
    }),
  );
  sim.addView(
    timeSeriesView({
      title: useEnergyChart ? 'Average stored energy' : 'Population',
      series,
      colors,
    }),
  );

  if (config.stopAt !== undefined) {
    const stopAt = config.stopAt;
    sim.observe({
      stepped(s) {
        if (s.tick >= stopAt) s.stop(`legacy stop period ${stopAt} reached`);
      },
    });
  }
}

/** A scape of bions of one species and the rules it follows, in Ascape's rule-list order. */
function bionScape(world: LatticeWorld, name: string, species: number, size: number): Scape<Bion> {
  const { config } = world;
  const scape = new Scape<Bion>({
    name,
    size,
    create: () => new Bion(species, world),
  });
  const rules: Rule<Bion>[] = [];
  const add = (ruleName: string, execute: (b: Bion) => void): void => {
    rules.push({ name: ruleName, execute });
  };
  const prey = (species + 1) % 3;
  const predator = (species + 2) % 3;
  const otherNames = (s: number): string => SPECIES[s] as string;

  if (config.walk) add('Random Walk', (b) => b.randomWalk());
  if (config.move === 'avoid') {
    add(`Move Away ${otherNames(predator)}`, (b) => b.moveRelativeToSpecies(predator, false));
  } else if (config.move === 'energy') {
    add(`Move Toward ${otherNames(prey)} Energy`, (b) => b.moveRelativeToEnergy(prey, true));
    add(`Move Away ${otherNames(predator)} Energy`, (b) => b.moveRelativeToEnergy(predator, false));
  }
  if (config.consume !== 'none') {
    const eaten = config.consume === 'prey' ? [prey] : [0, 1, 2].filter((s) => s !== species);
    for (const s of eaten) add(`Consume ${otherNames(s)} Energy`, (b) => b.consume(s));
  }
  if (config.full) {
    add('Death', (b) => b.death());
    add('Fissioning', (b) => b.fissioning());
    if (config.tileEnergy) add('Leave Energy', (b) => b.leaveEnergy());
  } else {
    if (config.tileEnergy) add('Leave Energy', (b) => b.leaveEnergy());
    if (config.storedEnergy) {
      add('Fissioning', (b) => b.fissioning());
      add('Death', (b) => b.death());
    }
  }
  for (const rule of rules) scape.addRule(rule);
  return scape;
}

/** Ascape's `Diffusion` (a plain neighbor average) or `ParameterizedDiffusion` for one colour of energy. */
function diffusionRule(world: LatticeWorld, colour: number): Rule<BionTile> {
  const { config, settings, grid } = world;
  const parameterized = config.diffusion === 'parameterized';
  return {
    name: `Diffuse ${SPECIES[colour]} Energy`,
    execute(tile) {
      const neighbors = grid.neighbors(tile);
      let sum = 0;
      for (const n of neighbors) sum += n.energy[colour] as number;
      const own = tile.energy[colour] as number;
      if (!parameterized) {
        tile.pending[colour] = sum / neighbors.length;
        return;
      }
      sum -= neighbors.length * own;
      sum /= neighbors.length;
      sum = own + sum * settings.diffusionConstant;
      sum *= 1.0 - settings.evaporation;
      tile.pending[colour] = sum;
    },
    update(tile) {
      tile.energy[colour] = tile.pending[colour] as number;
    },
  };
}
