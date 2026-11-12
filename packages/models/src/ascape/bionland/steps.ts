// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.bionland.Model_A, Model_B, Model_C, Model_D,
// Model_E, Model_F, Model_G, Model_H, Model_I, Model_J, Model_K, Model_L, Model_M, Model_P, Model,
// ModelData, ModelData_N and ModelData_O.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { latticeModel, type LatticeConfig } from './lattice-model';

/**
 * Step A: a bare 25 x 25 Moore lattice with 100 bions placed at random.
 * Every later step is written as the earlier one plus the few settings it changes.
 */
const configA: LatticeConfig = {
  name: 'Bionland: Step A',
  description:
    'A bare 25 x 25 lattice with 100 bions dropped at random positions. Nothing moves yet: the first step of the Bionland tutorial.',
  legacy: 'Model_A',
  adds: 'Step A: the lattice and 100 randomly placed bions.',
  kind: 'moore',
  width: 25,
  height: 25,
  territoryName: 'Bionland',
  species: 'one',
  singleCount: 100,
  density: 0.28,
  tiles: 'green',
  walk: false,
  vision: 'none',
  move: 'none',
  consume: 'none',
  tileEnergy: false,
  storedEnergy: false,
  gainParameter: false,
  diffusion: 'none',
  energyStats: false,
  full: false,
  occupantShape: 'square',
  densityKey: 'initialPopulationDensity',
  visionKeys: ['minimumVision', 'maximumVision'],
  gainKey: 'bionEnergyGain',
};

const step = (
  previous: LatticeConfig,
  name: string,
  legacy: string,
  description: string,
  adds: string,
  changes: Partial<LatticeConfig>,
): LatticeConfig => ({ ...previous, ...changes, name, legacy, description, adds });

const configB = step(
  configA,
  'Bionland: Step B',
  'Model_B',
  'The bions now take a random walk each tick, one step to a random neighboring site when it is free, on light gray tiles.',
  'Step B: adds the random walk rule and light gray tiles.',
  { walk: true, tiles: 'lightGray' },
);

const configC = step(
  configB,
  'Bionland: Step C',
  'Model_C',
  'Three species of bions (red, orange and blue) share the lattice at a chosen overall density and random-walk on black tiles.',
  'Step C: replaces the single population with three coloured species sized by an initial population density (28%).',
  { species: 'three', tiles: 'black' },
);

const configD = step(
  configC,
  'Bionland: Step D',
  'Model_D',
  'Bions can now see up to a vision distance and move away from the nearest bion of the species that preys on them (red from blue, orange from red, blue from orange), as well as walking at random.',
  'Step D: adds vision (minimum and maximum) and the "move away from the nearest" rules, selected as a cycle.',
  { vision: 'range', move: 'avoid' },
);

const configE = step(
  configD,
  'Bionland: Step E',
  'Model_E',
  'Each species leaves a coloured energy on the tile it stands on, and eats the energy of the other two species from its tile; the tile colour mixes the three energies.',
  'Step E: adds tile energies, the leave-energy rule, consume-energy rules and the leakage and consumption parameters.',
  { tiles: 'mixed', tileEnergy: true, consume: 'others' },
);

const configF = step(
  configE,
  'Bionland: Step F',
  'Model_F',
  'The same model as Step E; only the way it is drawn changes (bions as balls rather than squares).',
  'Step F: only the overhead view changes, to ball images drawn in 15-pixel cells.',
  { occupantShape: 'circle' },
);

const configG = step(
  configF,
  'Bionland: Step G',
  'Model_G',
  'Bions now carry stored energy: they pay for living, gain what they eat, split in two when they hold more than 2 and die when they run out.',
  'Step G: adds stored energy, the fissioning and death rules and the initial stored energy parameter. Vision is fixed at 8 regardless of the range.',
  { storedEnergy: true, vision: 'fixed' },
);

const configH = step(
  configG,
  'Bionland: Step H',
  'Model_H',
  'Bions now follow gradients of tile energy: toward the energy of the species they eat and away from the energy of the species that eats them. An energy gain parameter sets what energy is worth.',
  'Step H: adds the "move toward/away from maximum energy" rules (which replace the move-away rules in use) and the bion energy gain parameter.',
  { move: 'energy', gainParameter: true },
);

const configI = step(
  configH,
  'Bionland: Step I',
  'Model_I',
  "As Step H, with statistics: the chart shows each species' average stored energy.",
  'Step I: adds a stored-energy statistic for each species and the chart of their averages.',
  { energyStats: true },
);

const configJ = step(
  configI,
  'Bionland: Step J',
  'Model_J',
  'Tile energy now spreads: each tile takes the average of its neighbors every tick. The chart now counts bions.',
  'Step J: adds plain diffusion (each tile becomes the mean of its neighbors) of all three energies; the chart switches to bion counts; the ball images are commented out.',
  { diffusion: 'average', occupantShape: 'square' },
);

const configK = step(
  configJ,
  'Bionland: Step K',
  'Model_K',
  'Diffusion now has a diffusion constant and an evaporation rate. At the defaults (1 and 0) it is the same as Step J.',
  'Step K: replaces plain diffusion with parameterized diffusion (diffusion constant, evaporation rate); the ball images return in the view.',
  { diffusion: 'parameterized', occupantShape: 'circle' },
);

const configL = step(
  configK,
  'Bionland: Step L',
  'Model_L',
  'The lattice now has a von Neumann neighborhood (four neighbors) instead of Moore (eight), which changes walking, diffusion and how far bions can follow energy.',
  'Step L: switches the lattice to von Neumann and adds slider controls (not ported).',
  { kind: 'vonNeumann' },
);

const configM = step(
  configL,
  'Bionland: Step M',
  'Model_M',
  'Back on the Moore lattice, drawn with a ring around each bion that shrinks as its stored energy falls.',
  'Step M: returns to Moore and replaces the view with a custom draw (energy rings); the legacy chart is commented out.',
  { kind: 'moore' },
);

const configP = step(
  configM,
  'Bionland: Step P',
  'Model_P',
  'The lattice becomes a one-dimensional ring of 190 sites at 10% density, shown with pure red, orange and blue tile energies.',
  'Step P: replaces the 2D lattice by a 1D ring (190 sites), lowers the density to 10% and colours tiles by the raw energies.',
  { kind: 'ring', width: 190, height: 1, density: 0.1, tiles: 'pure' },
);

/** The full model: Step P's ring with its rules rewritten and tuned. */
const configFull = step(
  configP,
  'Bionland: Full Model',
  'Model',
  'Three species chase each other along a ring of 190 sites, each eating the energy of the species it hunts, leaving its own behind, and splitting or dying with its stored energy.',
  'Full model: no random walk, each species eats only its prey, random vision, a fission energy parameter, the energy gain scales what is left behind, and a different rule order (death, fission, leave).',
  {
    density: 0.28,
    tiles: 'mixed',
    territoryName: 'Map',
    walk: false,
    vision: 'range',
    consume: 'prey',
    full: true,
    densityKey: 'populationDensity',
    visionKeys: ['minVision', 'maxVision'],
    gainKey: 'energyGain',
  },
);

const configDataFull = step(
  configFull,
  'Bionland: Data Run (Full Model)',
  'ModelData',
  'The full model, set to stop after 50 ticks as the legacy data-collecting launcher did.',
  'ModelData: the full model with a stop period of 50 (the legacy launcher also wrote data files and swept the diffusion constant, which are not ported).',
  { stopAt: 50 },
);

const configDataN = step(
  configM,
  'Bionland: Data Run N',
  'ModelData_N',
  'Step M on a 10 x 10 lattice, set to stop after 2000 ticks as the legacy data-collecting launcher did.',
  'ModelData_N: Step M with a 10 x 10 lattice and a stop period of 2000 (the legacy launcher also wrote data files, which is not ported).',
  { width: 10, height: 10, stopAt: 2000 },
);

const configDataO = step(
  configM,
  'Bionland: Data Run O',
  'ModelData_O',
  'Step M on a 10 x 10 lattice, set to stop after 500 ticks as the legacy data-collecting launcher did.',
  'ModelData_O: Step M with a 10 x 10 lattice and a stop period of 500 (the legacy launcher also wrote data files and swept the diffusion constant, which are not ported).',
  { width: 10, height: 10, stopAt: 500 },
);

/** Step configurations, for tests that want to vary one. */
export const stepConfigs = {
  a: configA,
  b: configB,
  c: configC,
  d: configD,
  e: configE,
  f: configF,
  g: configG,
  h: configH,
  i: configI,
  j: configJ,
  k: configK,
  l: configL,
  m: configM,
  p: configP,
  full: configFull,
} as const;

/** Step A: a bare lattice with randomly placed bions. */
export const stepA = latticeModel(configA);
/** Step B: bions random-walk. */
export const stepB = latticeModel(configB);
/** Step C: three species. */
export const stepC = latticeModel(configC);
/** Step D: vision and moving away. */
export const stepD = latticeModel(configD);
/** Step E: tile energy. */
export const stepE = latticeModel(configE);
/** Step F: ball images. */
export const stepF = latticeModel(configF);
/** Step G: stored energy, fission and death. */
export const stepG = latticeModel(configG);
/** Step H: following energy gradients. */
export const stepH = latticeModel(configH);
/** Step I: statistics. */
export const stepI = latticeModel(configI);
/** Step J: diffusion. */
export const stepJ = latticeModel(configJ);
/** Step K: parameterized diffusion. */
export const stepK = latticeModel(configK);
/** Step L: von Neumann lattice. */
export const stepL = latticeModel(configL);
/** Step M: Moore lattice with energy rings. */
export const stepM = latticeModel(configM);
/** Step P: a one-dimensional ring. */
export const stepP = latticeModel(configP);
/** The full Bionland model. */
export const fullModel = latticeModel(configFull);
/** The full model, stopping at tick 50. */
export const dataRunFull = latticeModel(configDataFull);
/** Step M on a 10 x 10 lattice, stopping at tick 2000. */
export const dataRunN = latticeModel(configDataN);
/** Step M on a 10 x 10 lattice, stopping at tick 500. */
export const dataRunO = latticeModel(configDataO);
