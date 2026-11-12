// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { demographicPd, type PlayCell, type Player } from './demographic-pd';

const make = (seed = 1, parameters: Record<string, number> = {}) =>
  new Simulation(demographicPd, { seed, parameters });
const players = (sim: Simulation) => sim.scape('Players') as unknown as Iterable<Player>;

describe("Demographic Prisoner's Dilemma (AMP)", () => {
  it('starts with the configured population, wealth and strategies', () => {
    const sim = make();
    const all = [...players(sim)];
    expect(all).toHaveLength(100);
    for (const a of all) {
      expect(a.wealth).toBe(6);
      expect(a.age).toBeGreaterThanOrEqual(0);
      expect(a.age).toBeLessThan(100);
      expect(a.cell).toBeDefined();
    }
    const cooperators = all.filter((a) => a.cooperate).length;
    expect(cooperators).toBeGreaterThan(25);
    expect(cooperators).toBeLessThan(75);
  });

  it('runs 100 ticks', () => {
    expect(make().run(100)).toBe(100);
  });

  it('is deterministic and seed dependent', () => {
    const csv = (seed: number) => {
      const sim = make(seed);
      sim.run(50);
      return sim.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('keeps one player per cell, and the counts add up', () => {
    const sim = make(2);
    for (let t = 0; t < 60; t++) {
      sim.step();
      for (const c of sim.scape('Game Spaces') as GridScape<PlayCell>) {
        expect(c.occupants.length).toBeLessThanOrEqual(1);
      }
      expect(
        sim.data.latest('Player is Cooperate') + sim.data.latest('Player is not Cooperate'),
      ).toBe(sim.data.latest('Players Population'));
    }
  });

  it('with no payoffs, no mutation and no births, nothing changes but age', () => {
    const sim = make(1, {
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
      fissionWealth: 1000,
      mutationRate: 0,
      deathAge: 1000,
    });
    const before = [...players(sim)].map((a) => a.cooperate);
    sim.run(10);
    expect([...players(sim)].map((a) => a.cooperate)).toEqual(before);
    for (const a of players(sim)) expect(a.wealth).toBe(6);
  });

  it('players older than deathAge are removed', () => {
    const sim = make(1, {
      deathAge: 5,
      maximumAge: 3,
      fissionWealth: 1000,
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
    });
    sim.run(10);
    expect(sim.data.latest('Players Population')).toBe(0);
  });

  it('children get inheritedWealth, age 0 and cost the parent the same', () => {
    const sim = make(3, {
      playerCount: 1,
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
      initialWealth: 20,
      mutationRate: 0,
    });
    const parent = [...players(sim)][0]!;
    sim.step();
    const all = [...players(sim)];
    expect(all).toHaveLength(2);
    const child = all.find((a) => a !== parent)!;
    expect(child.wealth).toBe(6);
    expect(child.age).toBe(0);
    expect(parent.wealth).toBe(14);
    expect(child.cooperate).toBe(parent.cooperate);
  });

  it('cooperators and defectors coexist after 150 ticks (spatial cooperation zones)', () => {
    for (const seed of [1, 2, 3]) {
      const sim = make(seed);
      sim.run(150);
      expect(sim.data.latest('Player is Cooperate')).toBeGreaterThan(0);
      expect(sim.data.latest('Player is not Cooperate')).toBeGreaterThan(0);
    }
  });

  it('views refer to existing series', () => {
    const sim = make();
    for (const v of sim.views) {
      if (v.type === 'timeSeries')
        for (const id of v.series) expect(() => sim.data.get(id)).not.toThrow();
    }
  });
});
