// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Random } from '../random';
import type { Graph } from './graph';

/**
 * Links each agent to its `k` nearest neighbors on each side of a ring made
 * from the order of `agents`. Returns the graph.
 */
export function connectRing<A extends Agent>(
  graph: Graph<A>,
  agents: readonly A[],
  k: number,
): Graph<A> {
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be a non-negative integer');
  const n = agents.length;
  for (let i = 0; i < n; i++) {
    for (let step = 1; step <= k; step++) {
      graph.connect(agents[i] as A, agents[(i + step) % n] as A);
      graph.connect(agents[i] as A, agents[(((i - step) % n) + n) % n] as A);
    }
  }
  return graph;
}

/**
 * Erdos-Renyi: every pair of agents (every ordered pair if the graph is
 * directed) is linked with the given probability. Returns the graph.
 */
export function connectRandom<A extends Agent>(
  graph: Graph<A>,
  agents: readonly A[],
  probability: number,
  random: Random,
): Graph<A> {
  for (let i = 0; i < agents.length; i++) {
    for (let j = graph.directed ? 0 : i + 1; j < agents.length; j++) {
      if (i !== j && random.chance(probability)) graph.connect(agents[i] as A, agents[j] as A);
    }
  }
  return graph;
}

/**
 * Watts-Strogatz: a ring with `k` neighbors on each side, then each ring link
 * to a clockwise neighbor is, with `rewireProbability`, redirected to a
 * uniformly chosen agent that avoids self-links and duplicates. The number of
 * links does not change. Returns the graph.
 */
export function connectSmallWorld<A extends Agent>(
  graph: Graph<A>,
  agents: readonly A[],
  k: number,
  rewireProbability: number,
  random: Random,
): Graph<A> {
  connectRing(graph, agents, k);
  const n = agents.length;
  for (let step = 1; step <= k; step++) {
    for (let i = 0; i < n; i++) {
      const from = agents[i] as A;
      const to = agents[(i + step) % n] as A;
      if (!graph.isConnected(from, to) || !random.chance(rewireProbability)) continue;
      const options = agents.filter((other) => other !== from && !graph.isConnected(from, other));
      if (options.length === 0) continue;
      graph.disconnect(from, to);
      graph.connect(from, random.pick(options));
    }
  }
  return graph;
}
