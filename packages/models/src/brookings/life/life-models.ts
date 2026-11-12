// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.life.ConwayLife, ConwayLifeSmallWorld and SmallConwayLife.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  defineModel,
  GridScape,
  gridView,
  int,
  real,
  timeSeriesView,
  wireSmallWorld,
  type Simulation,
} from '@metascape/engine';
import { ALIVE, DEAD, lifeProvenance, LifeCell } from './life-cell';

const DENSITY = (description: string) =>
  real(0.1, { min: 0, max: 1, label: 'Initial alive density', description });

/** Adds the shared views and the live-cell count. */
function addLifeViews(sim: Simulation, cells: GridScape<LifeCell>): void {
  sim.data.count(cells, 'Alive', (cell) => cell.on);
  sim.addView(
    gridView<LifeCell>({
      title: 'Overhead View',
      grid: cells,
      cellColor: (cell) => (cell.on ? ALIVE : DEAD),
    }),
  );
  sim.addView(timeSeriesView({ title: 'Live cells', series: ['Alive'], colors: { Alive: ALIVE } }));
}

/** Conway's Life on a 51 by 51 torus, updated synchronously (execute, then update). */
export const conwayLife = defineModel({
  name: "Conway's Life: ConwayLife",
  description:
    'A classic cellular automaton: a live cell with two or three live neighbors survives, a dead ' +
    'cell with exactly three live neighbors comes alive, and very simple rules give lively, ' +
    'life-like patterns. Cells update synchronously.',
  provenance: lifeProvenance(
    'ConwayLife',
    'The count of live cells is added for the chart (the legacy collector is commented out).',
  ),
  parameters: {
    width: int(51, { min: 3, max: 400, label: 'Width', description: 'Number of columns.' }),
    height: int(51, { min: 3, max: 400, label: 'Height', description: 'Number of rows.' }),
    initialAliveDensity: DENSITY('Probability that a cell starts alive.'),
  },
  build(sim) {
    const { width, height, initialAliveDensity } = sim.parameters;
    const cells = sim.addScape(
      new GridScape<LifeCell>({
        name: 'Lattice',
        width,
        height,
        wrap: true,
        neighborhood: 'moore',
        order: 'sequential',
        schedule: 'byRule',
        create: () => new LifeCell(),
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity));
    cells.addRule({
      name: 'Determine Next State',
      execute(cell) {
        cell.next = cell.calculateNext(cell.neighbors);
      },
      update(cell) {
        cell.on = cell.next;
      },
    });
    addLifeViews(sim, cells);
  },
});

/**
 * Conway's Life on a 60 by 60 lattice with Ascape's small-world neighborhood.
 * With Ascape's defaults (radius 1, random edge ratio 0) that is a plain Moore
 * neighborhood, and because the legacy code builds `Array2DSmallWorld` without
 * a periodic geometry the lattice has hard edges.
 */
export const conwayLifeSmallWorld = defineModel({
  name: "Conway's Life: ConwayLifeSmallWorld",
  description:
    "Conway's Life on a lattice whose neighborhoods can be rewired at random, as in a small-world " +
    'network. With no rewiring (the default) it is ordinary Life on a lattice with edges. ' +
    'Cells update synchronously.',
  provenance: lifeProvenance(
    'ConwayLifeSmallWorld',
    'Array2DSmallWorld is created without a geometry, so it is not periodic: cells beyond the edge do not exist. Its radius (1) and randomEdgeRatio (0) are space properties that the legacy model does not expose; they are offered here as parameters with the legacy defaults.',
  ),
  parameters: {
    initialAliveDensity: DENSITY('Probability that a cell starts alive.'),
    radius: int(1, {
      min: 1,
      max: 5,
      label: 'Radius',
      description: 'Moore radius of a neighborhood.',
    }),
    randomEdgeRatio: real(0, {
      min: 0,
      max: 1,
      label: 'Random edge ratio',
      description: 'Probability that each neighbor is replaced by a random cell.',
    }),
  },
  build(sim) {
    const { initialAliveDensity, radius, randomEdgeRatio } = sim.parameters;
    const cells = sim.addScape(
      new GridScape<LifeCell>({
        name: 'Lattice',
        width: 60,
        height: 60,
        wrap: false,
        neighborhood: 'moore',
        order: 'sequential',
        schedule: 'byRule',
        create: () => new LifeCell(),
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity));
    sim.setup(() => wireSmallWorld(cells, { radius, randomEdgeRatio }));
    cells.addRule({
      name: 'Determine Next State',
      execute(cell) {
        cell.next = cell.calculateNext(cell.neighbors);
      },
      update(cell) {
        cell.on = cell.next;
      },
    });
    addLifeViews(sim, cells);
  },
});

/**
 * The condensed version of Life. Its `iterate` sets `nextAlive` only when the
 * state changes, so `nextAlive` keeps its previous value otherwise. It starts
 * false, which means that in the first step every initially live cell dies,
 * even one with two or three neighbors (kept from the legacy code).
 */
export const smallConwayLife = defineModel({
  name: "Conway's Life: SmallConwayLife",
  description:
    "A condensed version of Conway's Life, to show how small a working model can be. A live cell " +
    'with two or three live neighbors survives and a dead cell with three comes alive.',
  provenance: lifeProvenance(
    'SmallConwayLife',
    'Legacy quirk kept: nextAlive is only written when a cell changes state and starts false, so in the first step every initially live cell dies, whatever its neighbors. From the second step the rule is the standard one.',
  ),
  parameters: {
    initialAliveDensity: DENSITY('Probability that a cell starts alive.'),
  },
  build(sim) {
    const { initialAliveDensity } = sim.parameters;
    const cells = sim.addScape(
      new GridScape<LifeCell>({
        name: 'Lattice',
        width: 60,
        height: 60,
        wrap: true,
        neighborhood: 'moore',
        order: 'sequential',
        schedule: 'byRule',
        create: () => new LifeCell(),
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity));
    cells.addRule({
      name: 'Iterate and Update',
      execute(cell) {
        let live = 0;
        for (const neighbor of cell.neighbors) if (neighbor.on) live++;
        if (cell.on) {
          if (live < 2 || live > 3) cell.next = false;
        } else if (live === 3) {
          cell.next = true;
        }
      },
      update(cell) {
        cell.on = cell.next;
      },
    });
    addLifeViews(sim, cells);
  },
});
