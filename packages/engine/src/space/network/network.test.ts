// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Agent, Random, Scape, Simulation, type Model, type ParameterSchema } from '../../index';
import { connectRandom, connectRing, connectSmallWorld, Network } from './index';

function makeAgents(count: number, seed = 1): { agents: Agent[]; scape: Scape<Agent> } {
  const model: Model<ParameterSchema> & { scape: Scape<Agent> } = {
    name: 'net',
    parameters: {},
    scape: undefined as unknown as Scape<Agent>,
    build(sim: Simulation) {
      model.scape = sim.addScape(
        new Scape<Agent>({ name: 'nodes', size: count, create: () => new Agent() }),
      );
    },
  };
  new Simulation(model, { seed });
  return { agents: [...model.scape.members], scape: model.scape };
}

const ids = (agents: readonly Agent[] | undefined) => agents?.map((a) => a.id);

describe('Network (undirected)', () => {
  it('connects, rejects self-links and duplicates, and disconnects', () => {
    const { agents } = makeAgents(3);
    const [a, b, c] = agents as [Agent, Agent, Agent];
    const net = new Network();
    expect(net.directed).toBe(false);
    expect(net.connect(a, b)).toBe(true);
    expect(net.connect(a, b)).toBe(false);
    expect(net.connect(b, a)).toBe(false);
    expect(net.connect(a, a)).toBe(false);
    expect(net.isConnected(a, b)).toBe(true);
    expect(net.isConnected(b, a)).toBe(true);
    expect(net.isConnected(a, c)).toBe(false);
    expect(net.edgeCount).toBe(1);
    expect(net.disconnect(b, a)).toBe(true);
    expect(net.disconnect(b, a)).toBe(false);
    expect(net.isConnected(a, b)).toBe(false);
    expect(net.edgeCount).toBe(0);
  });

  it('lists neighbors in order of link creation, and edges once each', () => {
    const { agents } = makeAgents(4);
    const [a, b, c, d] = agents as [Agent, Agent, Agent, Agent];
    const net = new Network();
    net.connect(a, c);
    net.connect(a, b);
    net.connect(d, a);
    expect(ids(net.neighbors(a))).toEqual([c.id, b.id, d.id]);
    expect(ids(net.inNeighbors(a))).toEqual([c.id, b.id, d.id]);
    expect(net.degree(a)).toBe(3);
    expect(net.degree(b)).toBe(1);
    expect(net.neighbors(new Agent())).toEqual([]);
    const edges = [...net.edges()].map(([x, y]) => [x.id, y.id]);
    expect(edges).toHaveLength(3);
    expect(net.edgeCount).toBe(3);
    const keys = new Set(edges.map(([x, y]) => [x, y].sort().join()));
    expect(keys.size).toBe(3);
  });

  it('disconnectAll and clear remove links', () => {
    const { agents } = makeAgents(4);
    const [a, b, c, d] = agents as [Agent, Agent, Agent, Agent];
    const net = new Network();
    net.connect(a, b);
    net.connect(a, c);
    net.connect(c, d);
    net.disconnectAll(a);
    expect(net.degree(a)).toBe(0);
    expect(net.isConnected(b, a)).toBe(false);
    expect(net.edgeCount).toBe(1);
    net.clear();
    expect(net.edgeCount).toBe(0);
    expect(net.neighbors(c)).toEqual([]);
  });
});

describe('Network (directed)', () => {
  it('keeps the direction of links', () => {
    const { agents } = makeAgents(3);
    const [a, b, c] = agents as [Agent, Agent, Agent];
    const net = new Network({ directed: true });
    expect(net.directed).toBe(true);
    expect(net.connect(a, b)).toBe(true);
    expect(net.connect(b, a)).toBe(true);
    expect(net.connect(a, c)).toBe(true);
    expect(net.connect(a, c)).toBe(false);
    expect(net.isConnected(a, c)).toBe(true);
    expect(net.isConnected(c, a)).toBe(false);
    expect(ids(net.neighbors(a))).toEqual([b.id, c.id]);
    expect(ids(net.inNeighbors(a))).toEqual([b.id]);
    expect(ids(net.inNeighbors(c))).toEqual([a.id]);
    expect(net.degree(a)).toBe(2);
    expect(net.degree(c)).toBe(0);
    expect(net.edgeCount).toBe(3);
    expect(net.disconnect(a, b)).toBe(true);
    expect(net.isConnected(b, a)).toBe(true);
    expect(net.edgeCount).toBe(2);
    net.disconnectAll(a);
    expect(net.edgeCount).toBe(0);
  });

  it('respects direction in paths', () => {
    const { agents } = makeAgents(3);
    const [a, b, c] = agents as [Agent, Agent, Agent];
    const net = new Network({ directed: true });
    net.connect(a, b);
    net.connect(b, c);
    expect(net.distance(a, c)).toBe(2);
    expect(net.distance(c, a)).toBe(Infinity);
    expect(net.shortestPath(c, a)).toBeUndefined();
  });
});

describe('dead agents', () => {
  it('are never returned and links are pruned', () => {
    const { agents } = makeAgents(4);
    const [a, b, c, d] = agents as [Agent, Agent, Agent, Agent];
    const net = new Network();
    net.connect(a, b);
    net.connect(a, c);
    net.connect(b, d);
    expect(net.edgeCount).toBe(3);
    b.die();
    expect(ids(net.neighbors(a))).toEqual([c.id]);
    expect(net.degree(a)).toBe(1);
    expect(net.isConnected(a, b)).toBe(false);
    expect(net.neighbors(b)).toEqual([]);
    expect(net.degree(d)).toBe(0);
    expect(net.edgeCount).toBe(1);
    expect([...net.edges()].flat().includes(b)).toBe(false);
    expect(net.distance(a, d)).toBe(Infinity);
    expect(net.within(a, 5)).toEqual([c]);
  });

  it('are pruned from inNeighbors, edges and paths in a directed network', () => {
    const { agents } = makeAgents(3);
    const [a, b, c] = agents as [Agent, Agent, Agent];
    const net = new Network({ directed: true });
    net.connect(a, b);
    net.connect(b, c);
    b.die();
    expect(net.inNeighbors(c)).toEqual([]);
    expect(net.shortestPath(a, c)).toBeUndefined();
    expect(net.edgeCount).toBe(0);
  });

  it('cannot be connected', () => {
    const { agents } = makeAgents(2);
    const [a, b] = agents as [Agent, Agent];
    b.die();
    const net = new Network();
    expect(net.connect(a, b)).toBe(false);
    expect(net.connect(new Agent(), a)).toBe(false);
  });
});

describe('paths', () => {
  // 0-1-2-3-4 with a shortcut 0-5-4, and an isolated node 6.
  const build = () => {
    const { agents } = makeAgents(7);
    const net = new Network();
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 5],
      [5, 4],
    ] as const) {
      net.connect(agents[i] as Agent, agents[j] as Agent);
    }
    return { net, n: agents };
  };

  it('finds agents within some hops in breadth-first order', () => {
    const { net, n } = build();
    expect(ids(net.within(n[0] as Agent, 0))).toEqual([]);
    expect(ids(net.within(n[0] as Agent, 1))).toEqual([1, 5]);
    expect(ids(net.within(n[0] as Agent, 2))).toEqual([1, 5, 2, 4]);
    expect(ids(net.within(n[0] as Agent, 10))).toEqual([1, 5, 2, 4, 3]);
    expect(ids(net.within(n[6] as Agent, 3))).toEqual([]);
  });

  it('measures hop distances', () => {
    const { net, n } = build();
    const d = (i: number, j: number) => net.distance(n[i] as Agent, n[j] as Agent);
    expect(d(0, 0)).toBe(0);
    expect(d(0, 1)).toBe(1);
    expect(d(0, 4)).toBe(2);
    expect(d(1, 4)).toBe(3);
    expect(d(2, 5)).toBe(3);
    expect(d(0, 6)).toBe(Infinity);
  });

  it('returns shortest paths including both ends', () => {
    const { net, n } = build();
    expect(ids(net.shortestPath(n[0] as Agent, n[4] as Agent))).toEqual([0, 5, 4]);
    expect(ids(net.shortestPath(n[1] as Agent, n[3] as Agent))).toEqual([1, 2, 3]);
    expect(ids(net.shortestPath(n[2] as Agent, n[2] as Agent))).toEqual([2]);
    expect(net.shortestPath(n[0] as Agent, n[6] as Agent)).toBeUndefined();
  });
});

describe('generators', () => {
  const edgeKeys = (net: Network) =>
    [...net.edges()].map(([a, b]) => `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`).sort();

  it('connectRing gives each agent k neighbors on each side', () => {
    const { agents } = makeAgents(10);
    const net = connectRing(new Network(), agents, 2);
    expect(net.edgeCount).toBe(20);
    for (const agent of agents) expect(net.degree(agent)).toBe(4);
    expect(net.isConnected(agents[0] as Agent, agents[8] as Agent)).toBe(true);
    expect(net.isConnected(agents[0] as Agent, agents[3] as Agent)).toBe(false);
    expect(() => connectRing(new Network(), agents, -1)).toThrow(RangeError);
  });

  it('connectRing handles small and directed cases', () => {
    const { agents } = makeAgents(3);
    expect(connectRing(new Network(), agents, 5).edgeCount).toBe(3);
    const directed = connectRing(new Network({ directed: true }), agents, 1);
    expect(directed.edgeCount).toBe(6);
    expect(connectRing(new Network(), [], 2).edgeCount).toBe(0);
  });

  it('connectRandom respects the extremes and gives plausible density', () => {
    const { agents } = makeAgents(30);
    expect(connectRandom(new Network(), agents, 0, new Random(1)).edgeCount).toBe(0);
    expect(connectRandom(new Network(), agents, 1, new Random(1)).edgeCount).toBe((30 * 29) / 2);
    expect(connectRandom(new Network({ directed: true }), agents, 1, new Random(1)).edgeCount).toBe(
      30 * 29,
    );
    const net = connectRandom(new Network(), agents, 0.3, new Random(2));
    expect(net.edgeCount).toBeGreaterThan(80);
    expect(net.edgeCount).toBeLessThan(180);
  });

  it('connectRandom is reproducible for a seed', () => {
    const { agents } = makeAgents(25);
    const make = (seed: number) =>
      edgeKeys(connectRandom(new Network(), agents, 0.2, new Random(seed)));
    expect(make(7)).toEqual(make(7));
    expect(make(7)).not.toEqual(make(8));
  });

  it('connectSmallWorld keeps the edge count with no self or duplicate links', () => {
    const { agents } = makeAgents(40);
    for (const p of [0, 0.1, 0.5, 1]) {
      const net = connectSmallWorld(new Network(), agents, 3, p, new Random(5));
      expect(net.edgeCount).toBe(120);
      const keys = edgeKeys(net);
      expect(new Set(keys).size).toBe(keys.length);
      for (const [a, b] of net.edges()) expect(a).not.toBe(b);
      let total = 0;
      for (const agent of agents) total += net.degree(agent);
      expect(total).toBe(240);
    }
    const ring = connectSmallWorld(new Network(), agents, 3, 0, new Random(5));
    expect(edgeKeys(ring)).toEqual(edgeKeys(connectRing(new Network(), agents, 3)));
  });

  it('connectSmallWorld rewires and shortens paths, reproducibly', () => {
    const { agents } = makeAgents(60);
    const ring = connectRing(new Network(), agents, 2);
    const small = connectSmallWorld(new Network(), agents, 2, 0.3, new Random(9));
    expect(edgeKeys(small)).not.toEqual(edgeKeys(ring));
    const a = agents[0] as Agent;
    const b = agents[30] as Agent;
    expect(small.distance(a, b)).toBeLessThanOrEqual(ring.distance(a, b));
    const again = connectSmallWorld(new Network(), agents, 2, 0.3, new Random(9));
    expect(edgeKeys(again)).toEqual(edgeKeys(small));
  });

  it('connectSmallWorld works on a directed network and when nothing can be rewired', () => {
    const { agents } = makeAgents(10);
    const net = connectSmallWorld(new Network({ directed: true }), agents, 2, 1, new Random(3));
    expect(net.edgeCount).toBe(40);
    for (const [a, b] of net.edges()) expect(a).not.toBe(b);
    const { agents: tiny } = makeAgents(3);
    expect(connectSmallWorld(new Network(), tiny, 1, 1, new Random(1)).edgeCount).toBe(3);
  });
});

describe('Network.neighbors caching', () => {
  it('returns the same array until links change, then a fresh one', () => {
    const { agents } = makeAgents(4);
    const [a, b, c, d] = agents as [Agent, Agent, Agent, Agent];
    const net = new Network();
    net.connect(a, b);
    const first = net.neighbors(a);
    expect(net.neighbors(a)).toBe(first);
    net.connect(a, c);
    const second = net.neighbors(a);
    expect(second).not.toBe(first);
    expect(ids(second)).toEqual(ids([b, c]));
    expect(net.neighbors(a)).toBe(second);
    // A link of `c` elsewhere does not disturb `a`'s cache.
    net.connect(c, d);
    expect(net.neighbors(a)).toBe(second);
    net.disconnect(a, b);
    expect(ids(net.neighbors(a))).toEqual(ids([c]));
    net.disconnectAll(c);
    expect(net.neighbors(a)).toEqual([]);
    net.clear();
    expect(net.neighbors(c)).toEqual([]);
  });

  it('drops a dead neighbor from the cached result', () => {
    const { agents, scape } = makeAgents(3);
    const [a, b, c] = agents as [Agent, Agent, Agent];
    const net = new Network();
    net.connect(a, b);
    net.connect(a, c);
    const before = net.neighbors(a);
    expect(ids(before)).toEqual(ids([b, c]));
    scape.remove(b);
    const after = net.neighbors(a);
    expect(ids(after)).toEqual(ids([c]));
    expect(net.neighbors(a)).toBe(after);
    expect(net.neighbors(b)).toEqual([]);
  });
});
