// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../../agent';
import type { Random } from '../../random';
import type { Network } from './network';

/**
 * Links each agent to its `k` nearest neighbors on each side of a ring made
 * from the order of `agents`. Returns the network.
 */
export function connectRing<A extends Agent>(
  network: Network<A>,
  agents: readonly A[],
  k: number,
): Network<A> {
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be a non-negative integer');
  const n = agents.length;
  for (let i = 0; i < n; i++) {
    for (let step = 1; step <= k; step++) {
      network.connect(agents[i] as A, agents[(i + step) % n] as A);
      network.connect(agents[i] as A, agents[(((i - step) % n) + n) % n] as A);
    }
  }
  return network;
}

/**
 * Erdos-Renyi: every pair of agents (every ordered pair if the network is
 * directed) is linked with the given probability. Returns the network.
 */
export function connectRandom<A extends Agent>(
  network: Network<A>,
  agents: readonly A[],
  probability: number,
  random: Random,
): Network<A> {
  for (let i = 0; i < agents.length; i++) {
    for (let j = network.directed ? 0 : i + 1; j < agents.length; j++) {
      if (i !== j && random.chance(probability)) network.connect(agents[i] as A, agents[j] as A);
    }
  }
  return network;
}

/**
 * Watts-Strogatz: a ring with `k` neighbors on each side, then each ring link
 * to a clockwise neighbor is, with `rewireProbability`, redirected to a
 * uniformly chosen agent that avoids self-links and duplicates. The number of
 * links does not change. Returns the network.
 */
export function connectSmallWorld<A extends Agent>(
  network: Network<A>,
  agents: readonly A[],
  k: number,
  rewireProbability: number,
  random: Random,
): Network<A> {
  connectRing(network, agents, k);
  const n = agents.length;
  for (let step = 1; step <= k; step++) {
    for (let i = 0; i < n; i++) {
      const from = agents[i] as A;
      const to = agents[(i + step) % n] as A;
      if (!network.isConnected(from, to) || !random.chance(rewireProbability)) continue;
      const options = agents.filter((other) => other !== from && !network.isConnected(from, other));
      if (options.length === 0) continue;
      network.disconnect(from, to);
      network.connect(from, random.pick(options));
    }
  }
  return network;
}
