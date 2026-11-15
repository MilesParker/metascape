// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  Array2DMoore,
  barsView,
  CellOccupant,
  colors,
  connectRing,
  Continuous2D,
  continuousView,
  defineModel,
  gradient,
  Graph,
  gridView,
  histogramView,
  HostCell,
  int,
  LocatedAgent,
  networkView,
  Scape,
  Singleton,
  stat,
  timeSeriesView,
} from '@metascape/engine';

/** A cell with a fixed value, shown as shades. */
export class Patch extends HostCell {
  value = 0;
}

/** Wanders from cell to cell and spends energy. */
export class Walker extends CellOccupant<Patch> {
  energy = 10;
  name = 'walker';

  override initialize(): void {
    this.energy = this.random.int(1, 20);
    const grid = this.root.findScape<Patch>('grid');
    const cell = grid.findRandom((candidate) => candidate.isAvailable);
    if (cell) this.moveTo(cell);
  }
}

/** Drifts through continuous space. */
export class Drifter extends LocatedAgent {
  heading = 0;
}

/** A node in the tiny network. */
export class Node extends Agent {
  infected = false;
}

const shade = gradient(0xf1f5e8, 0x9bc27a);

/**
 * A small demo model for tests: wandering occupants on a grid, drifters in
 * continuous space, a six-node ring, one measure and one distribution, and
 * all six view types.
 */
export const demoModel = defineModel({
  name: 'Demo',
  description: 'Walkers wander on a grid.',
  parameters: {
    walkers: int(5, { min: 0, max: 20, label: 'Walkers', description: 'How many wander.' }),
  },
  build(root) {
    const grid = root.add(
      new Scape<Patch>({
        name: 'grid',
        space: new Array2DMoore<Patch>(),
        extent: [8, 6],
        periodic: true,
        prototypeAgent: () => new Patch(),
      }),
    );
    grid.addInitialRule('seed', (cell) => {
      cell.value = cell.random.float();
    });

    const walkers = root.add(
      new Scape<Walker>({
        name: 'walkers',
        size: root.parameters['walkers'] as number,
        prototypeAgent: () => new Walker(),
      }),
    );
    walkers.addRule('wander', (walker) => {
      walker.randomWalkAvailable();
      walker.energy += walker.random.int(-1, 2);
    });

    const space = root.add(
      new Scape<Drifter>({
        name: 'space',
        space: new Continuous2D<Drifter>(),
        extent: [20, 10],
        periodic: true,
        size: 4,
        prototypeAgent: () => new Drifter(),
      }),
    );
    space.addRule('drift', (agent) => {
      agent.heading += (agent.random.float() - 0.5) * 0.5;
      agent.moveBy(Math.cos(agent.heading) * 0.3, Math.sin(agent.heading) * 0.3);
    });

    const nodes = root.add(
      new Scape<Node>({
        name: 'nodes',
        space: new Graph<Node>(),
        size: 6,
        prototypeAgent: () => new Node(),
      }),
    );
    nodes.addInitialRule('infect', (node) => {
      node.infected = node.id % 3 === 0;
    });
    root
      .add(new Scape({ name: 'wiring', space: new Singleton() }))
      .addInitialRule('wire ring', () =>
        connectRing(nodes.space as Graph<Node>, [...nodes.members], 1),
      );

    walkers.addStatCollector(
      stat.measure('energy', (w) => w.energy, { statistics: ['mean', 'max'] }),
    );
    walkers.addStatCollector(stat.count('walkers'));
    walkers.addStatCollector(
      stat.distribution('energyDistribution', (w) => w.energy, { bins: 5, min: 0, max: 25 }),
    );
  },
  views(root) {
    const grid = root.findScape<Patch>('grid');
    const space = root.findScape<Drifter>('space');
    const nodes = root.findScape<Node>('nodes');
    return [
      gridView<Patch, Walker>({
        title: 'Grid',
        scape: grid,
        cellColor: (cell) => shade(cell.value),
        occupantColor: () => colors.red,
      }),
      continuousView<Drifter>({
        title: 'Space',
        scape: space,
        heading: (agent) => agent.heading,
        color: () => colors.teal,
      }),
      networkView<Node>({
        title: 'Network',
        nodes,
        graph: nodes.space as Graph<Node>,
        color: (node) => (node.infected ? colors.red : colors.blue),
      }),
      timeSeriesView({ title: 'Energy over time', series: ['energy.mean', 'energy.max'] }),
      barsView({ title: 'Latest', series: ['walkers', 'energy.mean'] }),
      histogramView({ title: 'Energy spread', distribution: 'energyDistribution' }),
    ];
  },
});
