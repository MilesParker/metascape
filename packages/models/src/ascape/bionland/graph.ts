// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.bionland.Model_R and Model_S (with their inner
// classes Bion, RedBion, OrangeBion, BlueBion, the move rules and the assign/change-neighbors rules),
// and the Ascape core spaces org.ascape.model.space.Graph, GraphSmallWorld, Discrete and
// BFSWithinIterator (breadth-first nearest search, findCellToward, findCellAway).
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  bool,
  int,
  Network,
  networkView,
  real,
  Scape,
  timeSeriesView,
  type Color,
  type Model,
  type Random,
} from '@metascape/engine';
import { BIONLAND_COPYRIGHT, SPECIES, SPECIES_COLORS } from './lattice-model';

/** A node of the graph; at most one bion stands on it. */
export class GraphNode extends Agent {
  occupant: GraphBion | undefined;
}

/** A bion standing on a graph node. */
export class GraphBion extends Agent {
  vision = 0;
  node: GraphNode | undefined;

  constructor(
    readonly species: number,
    private readonly world: GraphWorld,
  ) {
    super();
  }

  override initialize(): void {
    this.vision = this.random.int(this.world.minVision, this.world.maxVision + 1);
  }

  /** Steps onto a free node. */
  moveTo(node: GraphNode): void {
    if (node.occupant) throw new Error('Node is already occupied');
    this.leave();
    node.occupant = this;
    this.node = node;
  }

  /** Steps off the current node. */
  leave(): void {
    if (this.node) this.node.occupant = undefined;
    this.node = undefined;
  }

  override removed(): void {
    this.leave();
  }

  /** Moves to a random free node, as Ascape's initial MOVE_RANDOM_LOCATION_RULE does; dies if there is none. */
  moveToRandomLocation(): void {
    const free = this.world.graph.filter((n) => !n.occupant);
    if (free.length === 0) this.die();
    else this.moveTo(this.random.pick(free));
  }

  /** One step toward or away from the nearest bion of a species, if one is in sight. */
  chase(species: number, toward: boolean): void {
    const here = this.node;
    if (!here) return;
    const target = nearestNode(
      this.world.network,
      here,
      (n) => n.occupant?.species === species,
      Math.trunc(this.vision),
      this.random,
    );
    if (!target) return;
    const next = toward
      ? nodeToward(this.world.network, here, target, this.random)
      : nodeAway(this.world.network, here, target, this.random);
    if (!next.occupant) this.moveTo(next);
  }
}

/** The shared world of a graph step. */
export interface GraphWorld {
  readonly graph: Scape<GraphNode>;
  readonly network: Network<GraphNode>;
  readonly minVision: number;
  readonly maxVision: number;
}

/**
 * Breadth-first search along out-links, up to `maxDepth` links. Returns a
 * random one of the matching nodes nearest to the origin (never the origin).
 */
export function nearestNode(
  network: Network<GraphNode>,
  origin: GraphNode,
  condition: (node: GraphNode) => boolean,
  maxDepth: number,
  random: Random,
): GraphNode | undefined {
  const visited = new Set<GraphNode>([origin]);
  let frontier: GraphNode[] = [origin];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: GraphNode[] = [];
    for (const node of frontier) {
      for (const other of network.neighbors(node)) {
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    if (next.length === 0) return undefined;
    const matches = next.filter(condition);
    if (matches.length > 0) return random.pick(matches);
    frontier = next;
  }
  return undefined;
}

/** Number of links on the shortest path from one node to another, or NaN if there is none. */
export function pathLength(network: Network<GraphNode>, from: GraphNode, to: GraphNode): number {
  if (from === to) return 0;
  const visited = new Set<GraphNode>([from]);
  let frontier: GraphNode[] = [from];
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: GraphNode[] = [];
    for (const node of frontier) {
      for (const other of network.neighbors(node)) {
        if (other === to) return depth;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return Number.NaN;
}

/** Ascape `findCellTowardBFS`: the out-neighbor with the shortest path to the target (origin if none). */
export function nodeToward(
  network: Network<GraphNode>,
  origin: GraphNode,
  target: GraphNode,
  random: Random,
): GraphNode {
  let min = Number.MAX_VALUE;
  let closest: GraphNode[] = [];
  for (const neighbor of network.neighbors(origin)) {
    const d = pathLength(network, neighbor, target);
    if (d < min) {
      min = d;
      closest = [neighbor];
    } else if (d === min) {
      closest.push(neighbor);
    }
  }
  return closest.length > 0 ? random.pick(closest) : origin;
}

/** Ascape `findCellAwayBFS`: the out-neighbor farthest from the target (unreachable counts as 0). */
export function nodeAway(
  network: Network<GraphNode>,
  origin: GraphNode,
  target: GraphNode,
  random: Random,
): GraphNode {
  let distance = 0;
  const furthest: GraphNode[] = [];
  for (const neighbor of network.neighbors(origin)) {
    const raw = pathLength(network, neighbor, target);
    const d = Number.isNaN(raw) ? 0 : Math.trunc(raw);
    if (d > distance) {
      distance = d;
      furthest.length = 0;
    }
    if (d === distance) furthest.push(neighbor);
  }
  return furthest.length > 0 ? random.pick(furthest) : origin;
}

interface GraphSettings {
  readonly name: string;
  readonly description: string;
  readonly legacy: string;
  readonly note: string;
  readonly smallWorld: boolean;
}

function graphModel(settings: GraphSettings): Model {
  return {
    name: settings.name,
    description: settings.description,
    provenance: {
      portedFrom: `Ascape 5.6.1, org.ascape.examples.bionland.${settings.legacy}`,
      copyright: BIONLAND_COPYRIGHT,
      note:
        `${settings.note} Authors and citation are not stated in the sources. ` +
        'Edge thickness, edge visibility and agent size were view-only settings and are not ported.',
    },
    parameters: {
      initialScapeSize: int(5, {
        min: 1,
        max: 16,
        label: 'Initial scape size',
        description: 'Bions of each species.',
      }),
      minVision: int(5, {
        min: 1,
        max: 30,
        label: 'Minimum vision',
        description: 'Links a bion can see along, at least.',
      }),
      maxVision: int(10, {
        min: 1,
        max: 30,
        label: 'Maximum vision',
        description: 'Links a bion can see along, at most.',
      }),
      graphSize: int(50, {
        min: 6,
        max: 200,
        label: 'Graph size',
        description: 'Number of nodes.',
      }),
      directedGraph: bool(true, {
        label: 'Directed graph',
        description: 'Whether random links run one way only.',
      }),
      probBuildLink: real(0.1, {
        min: 0,
        max: 1,
        label: 'Probability of building a link',
        description: 'Chance of a link to each other node when a node (re)builds its links.',
      }),
      probChangeNeighbors: real(0.01, {
        min: 0,
        max: 1,
        label: 'Probability of changing neighbors',
        description: 'Chance per tick that a node drops its links and rebuilds them.',
      }),
      ...(settings.smallWorld
        ? {
            randomEdgeRatio: real(0.1, {
              min: 0,
              max: 1,
              label: 'Random edge ratio',
              description: 'Chance that a node gets one extra random link on top of the ring.',
            }),
          }
        : {}),
    },
    build(sim) {
      const p = sim.parameters as Readonly<Record<string, number | boolean | string>>;
      const initialScapeSize = p['initialScapeSize'] as number;
      const minVision = p['minVision'] as number;
      const maxVision = Math.max(minVision, p['maxVision'] as number);
      const graphSize = p['graphSize'] as number;
      const directed = p['directedGraph'] as boolean;
      const buildProbability = p['probBuildLink'] as number;
      const changeProbability = p['probChangeNeighbors'] as number;
      const network = new Network<GraphNode>({ directed: true });

      const addLink = (from: GraphNode, to: GraphNode, oneWay: boolean): void => {
        network.connect(from, to);
        if (!oneWay) network.connect(to, from);
      };
      /** Ascape's neighbor assignment: each other node is linked with the build probability. */
      const buildLinks = (node: GraphNode, inclusive: boolean): void => {
        for (const other of graph.members) {
          const draw = node.random.float();
          if ((inclusive ? draw <= buildProbability : draw < buildProbability) && other !== node) {
            addLink(node, other, directed);
          }
        }
      };

      const graph = new Scape<GraphNode>({
        name: 'Graph',
        size: graphSize,
        create: () => new GraphNode(),
        // Ascape: graph.setExecutionOrder(RULE_ORDER)
        schedule: 'byRule',
      });
      if (!settings.smallWorld) {
        graph.addInitialRule({
          name: 'Assign Neighbors Randomly',
          execute: (node) => buildLinks(node, false),
        });
      }
      graph.addRule({
        name: 'Change Neighbors',
        execute(node) {
          if (node.random.float() < changeProbability) {
            for (const other of [...network.neighbors(node)]) network.disconnect(node, other);
            buildLinks(node, true);
          }
        },
      });
      sim.addScape(graph);

      const world: GraphWorld = { graph, network, minVision, maxVision };
      const bions = SPECIES.map((name, species) => {
        const scape = new Scape<GraphBion>({
          name,
          size: initialScapeSize,
          create: () => new GraphBion(species, world),
        });
        scape.addInitialRule({
          name: 'Move To Random Location',
          execute: (b) => b.moveToRandomLocation(),
        });
        scape.addRule({
          name: `Move Toward ${SPECIES[(species + 1) % 3]}`,
          execute: (b) => b.chase((species + 1) % 3, true),
        });
        scape.addRule({
          name: `Move Away ${SPECIES[(species + 2) % 3]}`,
          execute: (b) => b.chase((species + 2) % 3, false),
        });
        return sim.addScape(scape);
      });

      if (settings.smallWorld) {
        const edgeRatio = p['randomEdgeRatio'] as number;
        // Ascape GraphSmallWorld.initialize: a ring of two-way links, then random one-way links.
        sim.setup(() => {
          const nodes = graph.members;
          nodes.forEach((cell, i) => {
            if (i > 0) addLink(cell, nodes[i - 1] as GraphNode, false);
            if (i === nodes.length - 1 && i > 0) addLink(cell, nodes[0] as GraphNode, false);
          });
          if (edgeRatio > 0) {
            for (const cell of nodes) {
              if (graph.random.float() <= edgeRatio) {
                const choices = nodes.filter((n) => n !== cell && !network.isConnected(cell, n));
                if (choices.length > 0) addLink(cell, graph.random.pick(choices), true);
              }
            }
          }
        });
      }

      bions.forEach((scape, i) => sim.data.count(scape, SPECIES[i] as string));
      sim.data.value('Links', () => graph.members.reduce((sum, n) => sum + network.degree(n), 0));
      sim.addView(
        networkView<GraphNode>({
          title: 'Graph',
          nodes: graph,
          network,
          color: (node) =>
            node.occupant ? (SPECIES_COLORS[node.occupant.species] as Color) : 0xffffff,
          layout: 'circle',
          background: 0xffffff,
        }),
      );
      sim.addView(timeSeriesView({ title: 'Links', series: ['Links'] }));
    },
  };
}

/** Step R: the species chase on a random graph whose links keep changing. */
export const stepR = graphModel({
  name: 'Bionland: Step R',
  legacy: 'Model_R',
  description:
    'Fifteen bions of three species chase and flee each other across a random directed graph of 50 nodes, whose links are occasionally rebuilt.',
  note: 'Step R: moves the movement rules of Step D onto a random graph (a node links to each other node with some probability).',
  smallWorld: false,
});

/** Step S: the same on a small-world graph. */
export const stepS = graphModel({
  name: 'Bionland: Step S',
  legacy: 'Model_S',
  description:
    'The species chase of Step R on a small-world graph: a ring of two-way links with a few random extra links.',
  note: 'Step S: replaces the random graph of Step R by a small-world graph (ring plus random edge ratio).',
  smallWorld: true,
});
