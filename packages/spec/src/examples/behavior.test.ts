// SPDX-License-Identifier: EPL-2.0
import { RootScape, type HostCell, type CellOccupant } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { compileModel } from '../compile';
import { readAttribute } from '../runtime';
import type { Expression, ModelSpec } from '../schema';
import { epidemic, forager, life, schelling } from './index';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('life', () => {
  /** True exactly on the given cells, written with self.x and self.y. */
  const pattern = (cells: readonly (readonly [number, number])[]): Expression => ({
    op: 'or',
    args: cells.map(([x, y]) => ({
      op: 'and',
      args: [
        { op: 'eq', args: ['self.x', x] },
        { op: 'eq', args: ['self.y', y] },
      ],
    })),
  });

  const start = (cells: readonly (readonly [number, number])[], size: number) => {
    const spec: ModelSpec = clone(life);
    spec.agents.cell!.attributes!.on!.initial = pattern(cells);
    return new RootScape(compileModel(spec), { seed: 1, parameters: { size } });
  };

  const live = (root: RootScape): string[] =>
    (root.findScape('cell').members as readonly HostCell[])
      .filter((cell) => readAttribute(cell, 'on') === true)
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
    const root = start(horizontal, 5);
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
    const root = start(glider, 8);
    root.run(4);
    expect(live(root)).toEqual(set(glider.map(([x, y]) => [x + 1, y + 1] as const)));
    root.run(28);
    expect(live(root)).toEqual(set(glider));
    expect(root.data.latest('cell.on')).toBe(5);
  });

  it('gives the same result whatever order cells act in', () => {
    const run = (randomExecution: boolean): string[] => {
      const spec: ModelSpec = clone(life);
      spec.agents.cell!.rules![0]!.randomExecution = randomExecution;
      const root = new RootScape(compileModel(spec), { seed: 11, parameters: { size: 24 } });
      root.run(30);
      return live(root);
    };
    const inOrder = run(false);
    expect(inOrder.length).toBeGreaterThan(0);
    expect(run(true)).toEqual(inOrder);
  });
});

describe('schelling', () => {
  it('conserves residents, keeps one per site and stops once everyone is happy', () => {
    const root = new RootScape(compileModel(schelling), { seed: 2 });
    const residents = root.findScape('resident');
    const sites = root.findScape('site').members as readonly HostCell[];
    const total = residents.size;
    expect(total).toBe(Math.floor(0.85 * 30 * 30));
    while (!root.stopped && root.period < 500) {
      root.iterate();
      expect(residents.size).toBe(total);
      expect(sites.every((site) => site.occupants.length <= 1)).toBe(true);
      expect(sites.filter((site) => !site.isAvailable)).toHaveLength(total);
    }
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toBe('Everyone is happy');
    expect(root.data.latest('resident.happy')).toBe(total);
    expect(root.data.values('resident.similar.mean')[0]).toBe(0);
    expect(root.data.latest('resident.similar.mean')).toBeGreaterThan(0.6);
  });
});

describe('epidemic', () => {
  it('conserves the population, one state per person', () => {
    const root = new RootScape(compileModel(epidemic), { seed: 4 });
    const people = root.findScape('person');
    root.run(200);
    for (const row of root.data.toRows()) {
      const s = row['person.health.susceptible']!;
      const i = row['person.health.infected']!;
      const r = row['person.health.recovered']!;
      expect(row['person.count']).toBe(300);
      expect(s + i + r).toBe(300);
    }
    expect(people.size).toBe(300);
    const states = new Set(people.members.map((person) => readAttribute(person, 'health')));
    for (const state of states) expect(['susceptible', 'infected', 'recovered']).toContain(state);
    expect(root.data.values('person.health.recovered').at(-1)).toBeGreaterThan(0);
    expect(root.stopReason).toBe('Nobody is infected');
  });

  it('stops on the last day with the stop action', () => {
    const root = new RootScape(compileModel(epidemic), {
      seed: 4,
      parameters: { lastDay: 5, transmission: 0.01, seeded: 0.5 },
    });
    root.run(50);
    expect(root.period).toBe(5);
    expect(root.stopReason).toBe('Reached the last day');
  });
});

describe('forager', () => {
  const check = (root: RootScape): void => {
    const patches = root.findScape('patch').members as readonly HostCell[];
    expect(patches.every((patch) => patch.occupants.length <= 1)).toBe(true);
    for (const agent of root.findScape('forager').members) {
      expect(readAttribute(agent, 'energy')).toBeGreaterThan(0);
      expect((agent as CellOccupant).hostCell).toBeDefined();
    }
  };

  it('never shares a cell and never survives at zero energy', () => {
    const root = new RootScape(compileModel(forager), {
      seed: 5,
      parameters: { birthEnergy: 8, immigration: 0.01 },
    });
    check(root);
    let births = 0;
    let deaths = 0;
    for (let period = 0; period < 200 && !root.stopped; period++) {
      const before = new Set(root.findScape('forager').members);
      root.iterate();
      const after = new Set(root.findScape('forager').members);
      for (const agent of after) if (!before.has(agent)) births++;
      for (const agent of before) if (!after.has(agent)) deaths++;
      check(root);
    }
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
  });

  it('creates nothing at a neighbour when no neighbouring cell is free', () => {
    const root = new RootScape(compileModel(forager), {
      seed: 1,
      parameters: { size: 5, foragers: 25, birthEnergy: 1, metabolism: 0, immigration: 0 },
    });
    root.run(5);
    expect(root.findScape('forager').size).toBe(25);
    check(root);
  });

  it('says clearly when the grid is too small for the population', () => {
    expect(
      () =>
        new RootScape(compileModel(forager), {
          seed: 1,
          parameters: { size: 5, foragers: 26 },
        }),
    ).toThrow(/Not enough free cells for "forager"/);
  });
});
