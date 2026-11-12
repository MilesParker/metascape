// SPDX-License-Identifier: EPL-2.0
import { GridScape, Network, Random, Scape, Simulation, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { cellAway, cellToward, nearestMatch } from './lattice-space';
import { BionTile } from './lattice-model';
import { stepConfigs } from './steps';
import { GraphNode, nearestNode, nodeAway, nodeToward, pathLength } from './graph';

type Loose = Readonly<Record<string, unknown>>;

/** Everything that distinguishes one run from another: the series and where every agent is. */
function fingerprint(sim: Simulation): string {
  const agents = sim.scapes.map((scape) =>
    scape.members.map((m) => {
      const a = m as unknown as Loose;
      const cell = a['cell'] as { x: number; y: number } | undefined;
      const node = a['node'] as { id: number } | undefined;
      return [cell?.x, cell?.y, node?.id, a['x'], a['y'], a['storedEnergy']];
    }),
  );
  return sim.data.toCSV() + JSON.stringify(agents);
}

function run(model: Model, seed: number, ticks: number): Simulation {
  const sim = new Simulation(model, { seed });
  sim.run(ticks);
  return sim;
}

describe('every Bionland model', () => {
  for (const model of family.models) {
    it(`${model.name} builds, runs and is deterministic`, () => {
      const a = run(model, 7, 25);
      const b = run(model, 7, 25);
      const c = run(model, 8, 25);
      expect(a.tick).toBeGreaterThanOrEqual(20);
      expect(a.views.length).toBeGreaterThanOrEqual(2);
      expect(fingerprint(a)).toBe(fingerprint(b));
      expect(fingerprint(a)).not.toBe(fingerprint(c));
    });
  }

  it('has unique names, in the family and per legacy class', () => {
    const names = family.models.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const model of family.models) {
      expect(model.provenance?.portedFrom).toMatch(
        /^Ascape 5\.6\.1, org\.ascape\.examples\.bionland\./,
      );
      expect(model.description?.length).toBeGreaterThan(20);
    }
  });
});

function grid(sim: Simulation, name = 'Bionland'): GridScape<BionTile> {
  return sim.scape(name) as GridScape<BionTile>;
}

describe('initial conditions', () => {
  const count = (model: Model, scape: string): number =>
    new Simulation(model, { seed: 1 }).scape(scape).size;
  const byName = (name: string): Model => family.models.find((m) => m.name === name) as Model;

  it('places 100 bions in Step A and Step B', () => {
    expect(count(byName('Bionland: Step A'), 'Bions')).toBe(100);
    expect(count(byName('Bionland: Step B'), 'Bions')).toBe(100);
  });

  it('sizes the three species from the density', () => {
    // floor(625 * 0.28 / 3) = 58, floor(190 * 0.10 / 3) = 6, floor(190 * 0.28 / 3) = 17
    expect(count(byName('Bionland: Step C'), 'Red')).toBe(58);
    expect(count(byName('Bionland: Step M'), 'Blue')).toBe(58);
    expect(count(byName('Bionland: Step P'), 'Orange')).toBe(6);
    expect(count(byName('Bionland: Full Model'), 'Red')).toBe(17);
    expect(count(byName('Bionland: Data Run N'), 'Red')).toBe(9);
  });

  it('keeps single occupancy and places every bion', () => {
    for (const model of family.models) {
      const sim = run(model, 3, 15);
      const lattice = sim.scapes.find((s) => s instanceof GridScape) as
        GridScape<BionTile> | undefined;
      if (!lattice) continue;
      for (const tile of lattice.members) expect(tile.occupants.length).toBeLessThanOrEqual(1);
      for (const scape of sim.scapes) {
        if (scape === lattice) continue;
        for (const bion of scape.members) expect((bion as unknown as Loose)['cell']).toBeDefined();
      }
    }
  });
});

describe('energy', () => {
  it('keeps tile energy between 0 and 1', () => {
    for (const key of ['e', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'p', 'full'] as const) {
      const model = family.models.find((m) => m.name === stepConfigs[key].name) as Model;
      const sim = run(model, 5, 60);
      for (const tile of grid(sim, stepConfigs[key].territoryName).members) {
        for (const e of tile.energy) {
          expect(e).toBeGreaterThanOrEqual(-1e-12);
          expect(e).toBeLessThanOrEqual(1 + 1e-12);
        }
      }
    }
  });

  it('conserves tile energy under diffusion without evaporation or bions leaving any', () => {
    for (const name of ['Bionland: Step J', 'Bionland: Step K', 'Bionland: Step L']) {
      const model = family.models.find((m) => m.name === name) as Model;
      const sim = new Simulation(model, {
        seed: 2,
        parameters: { bionEnergyLeakage: 0, bionEnergyConsumption: 0 },
      });
      const lattice = grid(sim);
      for (const tile of lattice.members) tile.energy[0] = sim.random.float();
      const total = (): number => lattice.members.reduce((s, t) => s + (t.energy[0] as number), 0);
      const before = total();
      sim.run(10);
      expect(total()).toBeCloseTo(before, 8);
    }
  });

  it('evaporation drains Step K tile energy', () => {
    const model = family.models.find((m) => m.name === 'Bionland: Step K') as Model;
    const sim = new Simulation(model, {
      seed: 2,
      parameters: { bionEnergyLeakage: 0, bionEnergyConsumption: 0, evaporationRate: 0.1 },
    });
    const lattice = grid(sim);
    for (const tile of lattice.members) tile.energy[2] = 1;
    sim.run(5);
    for (const tile of lattice.members) expect(tile.energy[2]).toBeCloseTo(0.9 ** 5, 8);
  });

  it('lets bions in Step G split (here from a high start), bounded by the lattice', () => {
    const model = family.models.find((m) => m.name === 'Bionland: Step G') as Model;
    const sim = new Simulation(model, { seed: 4, parameters: { initialStoredEnergy: 2.5 } });
    const start = sim.scapes.slice(1).reduce((s, sc) => s + sc.size, 0);
    let changed = false;
    for (let i = 0; i < 20; i++) {
      sim.step();
      const total = sim.scapes.slice(1).reduce((s, sc) => s + sc.size, 0);
      expect(total).toBeLessThanOrEqual(625);
      if (total > start) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("lets the full model's population change by fission and death", () => {
    const sim = new Simulation(
      family.models.find((m) => m.name === 'Bionland: Full Model') as Model,
      { seed: 4 },
    );
    const total = (): number => sim.scapes.slice(1).reduce((n, sc) => n + sc.size, 0);
    const start = total();
    sim.run(100);
    expect(total()).not.toBe(start);
    expect(total()).toBeLessThanOrEqual(190);
  });

  it('stops the data runs at their legacy periods', () => {
    const model = family.models.find((m) => m.name === 'Bionland: Data Run (Full Model)') as Model;
    expect(new Simulation(model, { seed: 1 }).run(1000)).toBe(50);
    const o = family.models.find((m) => m.name === 'Bionland: Data Run O') as Model;
    expect(new Simulation(o, { seed: 1 }).run(1000)).toBe(500);
  });
});

describe('movement rules', () => {
  const world = (
    width: number,
    height: number,
    kind: 'moore' | 'vonNeumann' = 'moore',
  ): GridScape<BionTile> => {
    const sim = new Simulation(
      {
        name: 'T',
        parameters: {},
        build(s) {
          s.addScape(
            new GridScape<BionTile>({
              name: 'g',
              width,
              height,
              neighborhood: kind,
              create: () => new BionTile(),
            }),
          );
        },
      },
      { seed: 1 },
    );
    return sim.scape('g') as GridScape<BionTile>;
  };

  it('steps toward a target the short way round a torus', () => {
    const g = world(25, 25);
    const next = cellToward(g, g.at(1, 1) as BionTile, g.at(24, 1) as BionTile);
    expect([next.x, next.y]).toEqual([0, 1]);
    const next2 = cellToward(g, g.at(5, 5) as BionTile, g.at(8, 2) as BionTile);
    expect([next2.x, next2.y]).toEqual([6, 4]);
  });

  it('steps away from a target', () => {
    const g = world(25, 25);
    const random = new Random(1);
    const next = cellAway(g, g.at(5, 5) as BionTile, g.at(7, 5) as BionTile, false, random);
    expect(next.x).toBe(4);
  });

  it('finds the nearest match by Euclidean distance below the vision', () => {
    const g = world(25, 25);
    const random = new Random(1);
    const origin = g.at(10, 10) as BionTile;
    const near = g.at(12, 11) as BionTile;
    const far = g.at(10, 16) as BionTile;
    const is = (c: BionTile): boolean => c === near || c === far;
    expect(nearestMatch(g, origin, is, 8, false, random)).toBe(near);
    expect(nearestMatch(g, origin, (c) => c === far, 6, false, random)).toBeUndefined();
    expect(nearestMatch(g, origin, (c) => c === far, 7, false, random)).toBe(far);
  });

  it('uses ring distance on the ring', () => {
    const g = world(190, 1);
    const random = new Random(1);
    const origin = g.at(2, 0) as BionTile;
    const target = g.at(188, 0) as BionTile;
    expect(nearestMatch(g, origin, (c) => c === target, 4, true, random)).toBe(target);
    expect(nearestMatch(g, origin, (c) => c === target, 3, true, random)).toBeUndefined();
  });
});

describe('graph steps', () => {
  it('Step S starts with a ring, so every node has at least two links', () => {
    const model = family.models.find((m) => m.name === 'Bionland: Step S') as Model;
    const sim = new Simulation(model, { seed: 3 });
    expect(sim.data.latest('Links')).toBeGreaterThanOrEqual(100);
  });

  it('finds nearest, toward and away on a small path graph', () => {
    const network = new Network<GraphNode>({ directed: true });
    let nodes: GraphNode[] = [];
    const sim = new Simulation(
      {
        name: 'T',
        parameters: {},
        build(s) {
          const scape = s.addScape(
            new Scape<GraphNode>({ name: 'n', size: 5, create: () => new GraphNode() }),
          );
          s.setup(() => {
            nodes = [...scape.members];
            // 0 - 1 - 2 - 3, and 4 on its own.
            for (let i = 0; i < 3; i++) {
              network.connect(nodes[i] as GraphNode, nodes[i + 1] as GraphNode);
              network.connect(nodes[i + 1] as GraphNode, nodes[i] as GraphNode);
            }
          });
        },
      },
      { seed: 1 },
    );
    const random = sim.random;
    const [n0, n1, n2, n3, n4] = nodes as [GraphNode, GraphNode, GraphNode, GraphNode, GraphNode];
    expect(pathLength(network, n0, n3)).toBe(3);
    expect(pathLength(network, n0, n0)).toBe(0);
    expect(Number.isNaN(pathLength(network, n0, n4))).toBe(true);
    expect(nearestNode(network, n0, (n) => n === n3 || n === n2, 5, random)).toBe(n2);
    expect(nearestNode(network, n0, (n) => n === n3, 2, random)).toBeUndefined();
    expect(nodeToward(network, n0, n3, random)).toBe(n1);
    expect(nodeAway(network, n1, n0, random)).toBe(n2);
    expect(nodeToward(network, n0, n4, random)).toBe(n0);
  });
});
