// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { demographicPd, type PlayCell, type Player } from './demographic-pd';

const make = (seed = 1, parameters: Record<string, number> = {}) =>
  new RootScape(demographicPd, { seed, parameters });
const players = (root: RootScape) => root.findScape('Players') as unknown as Iterable<Player>;

describe("Demographic Prisoner's Dilemma (AMP)", () => {
  it('starts with the configured population, wealth and strategies', () => {
    const root = make();
    const all = [...players(root)];
    expect(all).toHaveLength(100);
    for (const a of all) {
      expect(a.wealth).toBe(6);
      expect(a.age).toBeGreaterThanOrEqual(0);
      expect(a.age).toBeLessThan(100);
      expect(a.hostCell).toBeDefined();
    }
    const cooperators = all.filter((a) => a.cooperate).length;
    expect(cooperators).toBeGreaterThan(25);
    expect(cooperators).toBeLessThan(75);
  });

  it('runs 100 periods', () => {
    expect(make().run(100)).toBe(100);
  });

  it('is deterministic and seed dependent', () => {
    const csv = (seed: number) => {
      const root = make(seed);
      root.run(50);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('keeps one player per cell, and the counts add up', () => {
    const root = make(2);
    for (let t = 0; t < 60; t++) {
      root.iterate();
      for (const c of root.findScape<PlayCell>('Game Spaces')) {
        expect(c.occupants.length).toBeLessThanOrEqual(1);
      }
      expect(
        root.data.latest('Player is Cooperate') + root.data.latest('Player is not Cooperate'),
      ).toBe(root.data.latest('Players Population'));
    }
  });

  it('with no payoffs, no mutation and no births, nothing changes but age', () => {
    const root = make(1, {
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
      fissionWealth: 1000,
      mutationRate: 0,
      deathAge: 1000,
    });
    const before = [...players(root)].map((a) => a.cooperate);
    root.run(10);
    expect([...players(root)].map((a) => a.cooperate)).toEqual(before);
    for (const a of players(root)) expect(a.wealth).toBe(6);
  });

  it('players older than deathAge are removed', () => {
    const root = make(1, {
      deathAge: 5,
      maximumAge: 3,
      fissionWealth: 1000,
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
    });
    root.run(10);
    expect(root.data.latest('Players Population')).toBe(0);
  });

  it('children get inheritedWealth, age 0 and cost the parent the same', () => {
    const root = make(3, {
      playerCount: 1,
      payoffCC: 0,
      payoffCD: 0,
      payoffDC: 0,
      payoffDD: 0,
      initialWealth: 20,
      mutationRate: 0,
    });
    const parent = [...players(root)][0]!;
    root.iterate();
    const all = [...players(root)];
    expect(all).toHaveLength(2);
    const child = all.find((a) => a !== parent)!;
    expect(child.wealth).toBe(6);
    expect(child.age).toBe(0);
    expect(parent.wealth).toBe(14);
    expect(child.cooperate).toBe(parent.cooperate);
  });

  it('cooperators and defectors coexist after 150 periods (spatial cooperation zones)', () => {
    for (const seed of [1, 2, 3]) {
      const root = make(seed);
      root.run(150);
      expect(root.data.latest('Player is Cooperate')).toBeGreaterThan(0);
      expect(root.data.latest('Player is not Cooperate')).toBeGreaterThan(0);
    }
  });

  it('views refer to existing series', () => {
    const root = make();
    for (const v of root.allViews) {
      if (v.type === 'timeSeries')
        for (const id of v.series) expect(() => root.data.get(id)).not.toThrow();
    }
  });
});
