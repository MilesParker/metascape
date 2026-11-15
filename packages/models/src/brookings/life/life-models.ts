// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.life.ConwayLife, ConwayLifeSmallWorld and SmallConwayLife.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  type Array2D,
  Array2DMoore,
  defineModel,
  gridView,
  int,
  real,
  type RootScape,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
  wireSmallWorld,
} from '@metascape/engine';
import { ALIVE, DEAD, lifeProvenance, LifeCell } from './life-cell';

const DENSITY = (description: string) =>
  real(0.1, { min: 0, max: 1, label: 'Initial alive density', description });

/** Adds the shared views and the live-cell count. */
function addLifeViews(root: RootScape, cells: Scape<LifeCell>): void {
  cells.addStatCollector(stat.count('Alive', (cell) => cell.on));
  root.addView(
    gridView<LifeCell>({
      title: 'Overhead View',
      scape: cells,
      cellColor: (cell) => (cell.on ? ALIVE : DEAD),
      legend: [
        { color: ALIVE, label: 'Alive' },
        { color: DEAD, label: 'Dead' },
      ],
    }),
  );
  root.addView(
    timeSeriesView({ title: 'Live cells', series: ['Alive'], colors: { Alive: ALIVE } }),
  );
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
  build(root) {
    const { width, height, initialAliveDensity } = root.parameters;
    const cells = root.add(
      new Scape<LifeCell>({
        name: 'Lattice',
        space: new Array2DMoore<LifeCell>(),
        extent: [width, height],
        periodic: true,
        prototypeAgent: () => new LifeCell(),
        executionOrder: 'byRule',
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity), {
      randomExecution: false,
    });
    cells.addRule({
      randomExecution: false,
      name: 'Determine Next State',
      execute(cell) {
        cell.next = cell.calculateNext(cell.neighbors);
      },
      update(cell) {
        cell.on = cell.next;
      },
    });
    addLifeViews(root, cells);
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
  build(root) {
    const { initialAliveDensity, radius, randomEdgeRatio } = root.parameters;
    const cells = root.add(
      new Scape<LifeCell>({
        name: 'Lattice',
        space: new Array2DMoore<LifeCell>(),
        extent: [60, 60],
        periodic: false,
        prototypeAgent: () => new LifeCell(),
        executionOrder: 'byRule',
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity), {
      randomExecution: false,
    });
    // Wired once the cells are seeded, as Ascape's Array2DSmallWorld is when the lattice is created.
    root
      .add(new Scape({ name: 'Small world', space: new Singleton() }))
      .addInitialRule(
        'Wire',
        () => wireSmallWorld(cells.space as Array2D<LifeCell>, { radius, randomEdgeRatio }),
        { randomExecution: false },
      );
    cells.addRule({
      randomExecution: false,
      name: 'Determine Next State',
      execute(cell) {
        cell.next = cell.calculateNext(cell.neighbors);
      },
      update(cell) {
        cell.on = cell.next;
      },
    });
    addLifeViews(root, cells);
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
  build(root) {
    const { initialAliveDensity } = root.parameters;
    const cells = root.add(
      new Scape<LifeCell>({
        name: 'Lattice',
        space: new Array2DMoore<LifeCell>(),
        extent: [60, 60],
        periodic: true,
        prototypeAgent: () => new LifeCell(),
        executionOrder: 'byRule',
      }),
    );
    cells.addInitialRule('Seed', (cell) => cell.seed(initialAliveDensity), {
      randomExecution: false,
    });
    cells.addRule({
      randomExecution: false,
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
    addLifeViews(root, cells);
  },
});
