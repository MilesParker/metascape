// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  barsView,
  colors,
  connectRing,
  continuousView,
  ContinuousScape,
  defineModel,
  GridScape,
  gradient,
  gridView,
  histogramView,
  int,
  Network,
  networkView,
  Occupant,
  PointAgent,
  Scape,
  timeSeriesView,
  Cell,
} from '@metascape/engine';

/** A cell with a fixed value, shown as shades. */
export class Patch extends Cell {
  value = 0;
}

/** Wanders from cell to cell and spends energy. */
export class Walker extends Occupant<Patch> {
  energy = 10;
  name = 'walker';

  override initialize(): void {
    this.energy = this.random.int(1, 20);
    const grid = this.sim.scape('grid') as GridScape<Patch>;
    const cell = grid.randomAvailableCell();
    if (cell) this.moveTo(cell);
  }
}

/** Drifts through continuous space. */
export class Drifter extends PointAgent {
  heading = 0;
}

/** A node in the tiny network. */
export class Node extends Agent {
  infected = false;
}

/** The ring of nodes, which carries its own network so views can find it. */
export class NodeScape extends Scape<Node> {
  readonly network = new Network<Node>();
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
  build(sim) {
    const grid = sim.addScape(
      new GridScape<Patch>({
        name: 'grid',
        width: 8,
        height: 6,
        wrap: true,
        create: () => new Patch(),
      }),
    );
    grid.addInitialRule('seed', (cell) => {
      cell.value = cell.random.float();
    });

    const walkers = sim.addScape(
      new Scape<Walker>({
        name: 'walkers',
        size: sim.parameters['walkers'] as number,
        create: () => new Walker(),
      }),
    );
    walkers.addRule('wander', (walker) => {
      walker.moveToRandomAvailableNeighbor();
      walker.energy += walker.random.int(-1, 2);
    });

    const space = sim.addScape(
      new ContinuousScape<Drifter>({
        name: 'space',
        width: 20,
        height: 10,
        wrap: true,
        size: 4,
        create: () => new Drifter(),
      }),
    );
    space.addRule('drift', (agent) => {
      agent.heading += (agent.random.float() - 0.5) * 0.5;
      agent.moveBy(Math.cos(agent.heading) * 0.3, Math.sin(agent.heading) * 0.3);
    });

    const nodes = sim.addScape(new NodeScape({ name: 'nodes', size: 6, create: () => new Node() }));
    nodes.addInitialRule('infect', (node) => {
      node.infected = node.id % 3 === 0;
    });
    sim.observe({
      initialized() {
        connectRing(nodes.network, [...nodes.members], 1);
      },
    });

    sim.data.measure(walkers, 'energy', (w) => w.energy, { statistics: ['mean', 'max'] });
    sim.data.count(walkers, 'walkers');
    sim.data.distribution(walkers, 'energyDistribution', (w) => w.energy, {
      bins: 5,
      min: 0,
      max: 25,
    });
  },
  views(sim) {
    const grid = sim.scape('grid') as GridScape<Patch>;
    const space = sim.scape('space') as ContinuousScape<Drifter>;
    const nodes = sim.scape('nodes') as NodeScape;
    return [
      gridView<Patch, Walker>({
        title: 'Grid',
        grid,
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
        network: nodes.network,
        color: (node) => (node.infected ? colors.red : colors.blue),
      }),
      timeSeriesView({ title: 'Energy over time', series: ['energy.mean', 'energy.max'] }),
      barsView({ title: 'Latest', series: ['walkers', 'energy.mean'] }),
      histogramView({ title: 'Energy spread', distribution: 'energyDistribution' }),
    ];
  },
});
