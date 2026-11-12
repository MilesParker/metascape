// SPDX-License-Identifier: EPL-2.0
import { Simulation, type Cell, type Occupant } from '@metascape/engine';
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
    return new Simulation(compileModel(spec), { seed: 1, parameters: { size } });
  };

  const live = (sim: Simulation): string[] =>
    (sim.scape('cell').members as readonly Cell[])
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
    const sim = start(horizontal, 5);
    expect(live(sim)).toEqual(set(horizontal));
    sim.step();
    expect(live(sim)).toEqual(set(vertical));
    sim.step();
    expect(live(sim)).toEqual(set(horizontal));
  });

  it('moves a glider one cell diagonally every four ticks, around the torus', () => {
    const glider = [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ] as const;
    const sim = start(glider, 8);
    sim.run(4);
    expect(live(sim)).toEqual(set(glider.map(([x, y]) => [x + 1, y + 1] as const)));
    sim.run(28);
    expect(live(sim)).toEqual(set(glider));
    expect(sim.data.latest('cell.on')).toBe(5);
  });

  it('gives the same result whatever order cells act in', () => {
    const run = (order: 'sequential' | 'shuffled'): string[] => {
      const spec: ModelSpec = clone(life);
      spec.agents.cell!.order = order;
      const sim = new Simulation(compileModel(spec), { seed: 11, parameters: { size: 24 } });
      sim.run(30);
      return live(sim);
    };
    const sequential = run('sequential');
    expect(sequential.length).toBeGreaterThan(0);
    expect(run('shuffled')).toEqual(sequential);
  });
});

describe('schelling', () => {
  it('conserves residents, keeps one per site and reaches stopWhen', () => {
    const sim = new Simulation(compileModel(schelling), { seed: 2 });
    const residents = sim.scape('resident');
    const sites = sim.scape('site').members as readonly Cell[];
    const total = residents.size;
    expect(total).toBe(Math.floor(0.85 * 30 * 30));
    while (!sim.stopped && sim.tick < 500) {
      sim.step();
      expect(residents.size).toBe(total);
      expect(sites.every((site) => site.occupants.length <= 1)).toBe(true);
      expect(sites.filter((site) => !site.isAvailable)).toHaveLength(total);
    }
    expect(sim.stopped).toBe(true);
    expect(sim.stopReason).toMatch(/stopWhen/);
    expect(sim.data.latest('resident.happy')).toBe(total);
    expect(sim.data.values('resident.similar.mean')[0]).toBe(0);
    expect(sim.data.latest('resident.similar.mean')).toBeGreaterThan(0.6);
  });
});

describe('epidemic', () => {
  it('conserves the population, one state per person', () => {
    const sim = new Simulation(compileModel(epidemic), { seed: 4 });
    const people = sim.scape('person');
    sim.run(200);
    for (const row of sim.data.toRows()) {
      const s = row['person.health.susceptible']!;
      const i = row['person.health.infected']!;
      const r = row['person.health.recovered']!;
      expect(row['person.count']).toBe(300);
      expect(s + i + r).toBe(300);
    }
    expect(people.size).toBe(300);
    const states = new Set(people.members.map((person) => readAttribute(person, 'health')));
    for (const state of states) expect(['susceptible', 'infected', 'recovered']).toContain(state);
    expect(sim.data.values('person.health.recovered').at(-1)).toBeGreaterThan(0);
    expect(sim.stopReason).toMatch(/stopWhen/);
  });

  it('stops on the last day with the stop action', () => {
    const sim = new Simulation(compileModel(epidemic), {
      seed: 4,
      parameters: { lastDay: 5, transmission: 0.01, seeded: 0.5 },
    });
    sim.run(50);
    expect(sim.tick).toBe(5);
    expect(sim.stopReason).toBe('Reached the last day');
  });
});

describe('forager', () => {
  const check = (sim: Simulation): void => {
    const patches = sim.scape('patch').members as readonly Cell[];
    expect(patches.every((patch) => patch.occupants.length <= 1)).toBe(true);
    for (const agent of sim.scape('forager').members) {
      expect(readAttribute(agent, 'energy')).toBeGreaterThan(0);
      expect((agent as Occupant).cell).toBeDefined();
    }
  };

  it('never shares a cell and never survives at zero energy', () => {
    const sim = new Simulation(compileModel(forager), {
      seed: 5,
      parameters: { birthEnergy: 8, immigration: 0.01 },
    });
    check(sim);
    let births = 0;
    let deaths = 0;
    for (let tick = 0; tick < 200 && !sim.stopped; tick++) {
      const before = new Set(sim.scape('forager').members);
      sim.step();
      const after = new Set(sim.scape('forager').members);
      for (const agent of after) if (!before.has(agent)) births++;
      for (const agent of before) if (!after.has(agent)) deaths++;
      check(sim);
    }
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
  });

  it('creates nothing at a neighbour when no neighbouring cell is free', () => {
    const sim = new Simulation(compileModel(forager), {
      seed: 1,
      parameters: { size: 5, foragers: 25, birthEnergy: 1, metabolism: 0, immigration: 0 },
    });
    sim.run(5);
    expect(sim.scape('forager').size).toBe(25);
    check(sim);
  });

  it('says clearly when the grid is too small for the population', () => {
    expect(
      () =>
        new Simulation(compileModel(forager), {
          seed: 1,
          parameters: { size: 5, foragers: 26 },
        }),
    ).toThrow(/Not enough free cells for "forager"/);
  });
});
