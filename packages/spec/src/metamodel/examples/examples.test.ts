// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Agent, type CellOccupant, type HostCell } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from '../check';
import { compileModel } from '../interpreter';
import { InterpScape, isHolder, type Holder } from '../runtime';
import { parseModel } from '../schema';
import type { Model } from '../types';
import { examples, forager, life, schelling } from './index';

type Parameters = Record<string, number | boolean | string>;

const start = (model: Model, seed: number, parameters: Parameters = {}) =>
  new RootScape(compileModel(model), { seed, parameters });

/** The value of an attribute of an agent, by the attribute's ID. */
function valueOf(agent: Agent, attribute: string): unknown {
  const holder = agent as unknown as Holder;
  return holder.context!.state.read(holder, holder.info.attribute.get(attribute)!);
}

/** Every agent of a type, across the model's scapes. */
function agentsOf(root: RootScape, type: string): Agent[] {
  const found = new Set<Agent>();
  for (const scape of root.scapes) {
    for (const member of scape.members) {
      if (member instanceof InterpScape) continue;
      if (isHolder(member) && member.info.id === type) found.add(member);
    }
  }
  return [...found];
}

describe.each(Object.entries(examples))('example %s', (_name, model) => {
  it('parses and has no diagnostics', () => {
    expect(parseModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
    expect(checkModel(model)).toEqual([]);
  });

  it('runs 200 periods reproducibly, depending on the seed', () => {
    const csv = (seed: number) => {
      const root = start(model, seed);
      root.run(200);
      return root.data.toCSV();
    };
    const first = csv(1);
    expect(first.split('\n').length).toBeGreaterThan(2);
    expect(csv(1)).toBe(first);
    expect(csv(2)).not.toBe(first);
  });
});

describe('life', () => {
  /** A run of Life with exactly the given cells alive at the start. */
  const begin = (
    cells: readonly (readonly [number, number])[],
    size: number,
    model: Model = life,
  ) => {
    const root = start(model, 1, { density: 0, 'world.width': size, 'world.height': size });
    for (const cell of agentsOf(root, 'cell') as HostCell[]) {
      const alive = cells.some(([x, y]) => cell.x === x && cell.y === y);
      const holder = cell as unknown as Holder;
      holder.context!.state.write(holder, holder.info.attribute.get('on')!, alive);
    }
    return root;
  };

  const live = (root: RootScape): string[] =>
    (agentsOf(root, 'cell') as HostCell[])
      .filter((cell) => valueOf(cell, 'on') === true)
      .map((cell) => `${cell.x},${cell.y}`)
      .sort();

  const set = (cells: readonly (readonly [number, number])[]): string[] =>
    cells.map(([x, y]) => `${x},${y}`).sort();

  it('oscillates a blinker', () => {
    const horizontal = [
      [1, 2],
      [2, 2],
      [3, 2],
    ] as const;
    const vertical = [
      [2, 1],
      [2, 2],
      [2, 3],
    ] as const;
    const root = begin(horizontal, 5);
    expect(live(root)).toEqual(set(horizontal));
    root.iterate();
    expect(live(root)).toEqual(set(vertical));
    root.iterate();
    expect(live(root)).toEqual(set(horizontal));
  });

  it('moves a glider one cell diagonally every four periods, around the torus', () => {
    const glider = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ] as const;
    const root = begin(glider, 8);
    root.run(4);
    expect(live(root)).toEqual(set(glider.map(([x, y]) => [x + 1, y + 1] as const)));
    root.run(28);
    expect(live(root)).toEqual(set(glider));
    expect(root.data.latest('cell.on')).toBe(5);
  });

  it('gives the same result whatever order cells act in', () => {
    const cells: [number, number][] = [];
    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 24; y++) if ((x * 7 + y * 13 + x * y) % 5 < 2) cells.push([x, y]);
    }
    const run = (randomOrder: boolean): string[] => {
      const model = structuredClone(life);
      model.agents!['cell']!.execution = { randomOrder };
      const root = begin(cells, 24, model);
      root.run(30);
      return live(root);
    };
    const inOrder = run(false);
    expect(inOrder.length).toBeGreaterThan(0);
    expect(run(true)).toEqual(inOrder);
  });
});

describe('schelling', () => {
  it('conserves residents, keeps one per site, and everyone ends up happy', () => {
    const root = start(schelling, 2);
    const sites = agentsOf(root, 'site') as HostCell[];
    const total = agentsOf(root, 'resident').length;
    expect(total).toBe(Math.floor(0.85 * 30 * 30));
    while (root.data.latest('resident.happy') < total && root.period < 500) {
      root.iterate();
      expect(agentsOf(root, 'resident')).toHaveLength(total);
      expect(sites.every((site) => site.occupants.length <= 1)).toBe(true);
      expect(sites.filter((site) => !site.isAvailable)).toHaveLength(total);
    }
    expect(root.data.latest('resident.happy')).toBe(total);
    expect(root.data.values('resident.similar.mean')[0]).toBe(0);
    expect(root.data.latest('resident.similar.mean')).toBeGreaterThan(0.6);
  });
});

describe('forager', () => {
  const check = (root: RootScape): void => {
    const patches = agentsOf(root, 'patch') as HostCell[];
    expect(patches.every((patch) => patch.occupants.length <= 1)).toBe(true);
    for (const agent of agentsOf(root, 'forager')) {
      expect(valueOf(agent, 'energy')).toBeGreaterThan(0);
      expect((agent as CellOccupant).hostCell).toBeDefined();
    }
  };

  it('never shares a patch and never survives at zero energy', () => {
    const root = start(forager, 5, { birthEnergy: 8, immigration: 0.01 });
    check(root);
    let births = 0;
    let deaths = 0;
    for (let period = 0; period < 200; period++) {
      const before = new Set(agentsOf(root, 'forager'));
      root.iterate();
      const after = new Set(agentsOf(root, 'forager'));
      for (const agent of after) if (!before.has(agent)) births++;
      for (const agent of before) if (!after.has(agent)) deaths++;
      check(root);
    }
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
  });

  it('has no child when no neighbouring patch is free', () => {
    const root = start(forager, 1, {
      'land.width': 5,
      'land.height': 5,
      foragers: 25,
      birthEnergy: 1,
      metabolism: 0,
      immigration: 0,
    });
    root.run(5);
    expect(agentsOf(root, 'forager')).toHaveLength(25);
    check(root);
  });
});

/*
 * The numbers each example gives, pinned. A change to the format or the
 * interpreter that changes how a model runs shows up here. The digests are
 * of every period's data, as CSV.
 */
describe('the numbers of the examples', () => {
  /** A 64-bit FNV-1a digest of a text, in hex. */
  const digest = (text: string): string => {
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, '0');
  };
  const pinned: Record<string, Record<number, string>> = {
    life: { 1: '26b1da13897c486c', 2: '73bc978bba28f432' },
    schelling: { 1: '717d468c06e4f7d4', 2: '8c379e50000d4a5d' },
    forager: { 1: 'c054b8ba373970fc', 2: 'd026be1126892e2b' },
  };

  describe.each(Object.entries(examples))('%s', (name, model) => {
    it.each([1, 2])('with seed %i', (seed) => {
      const root = start(model, seed);
      root.run(200);
      expect(digest(root.data.toCSV())).toBe(pinned[name]?.[seed]);
    });
  });
});
