// SPDX-License-Identifier: EPL-2.0
import { type HostCell, type Model, ParameterError, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family, step1, step2, step3, step4, step5 } from './index';
import { FRIENDS_SIZE, type Player } from './coordination-game';

const make = (model: Model, seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new RootScape(model, { seed, parameters } as never);
const players = (root: RootScape) => [...root.findScape('Players')] as Player[];

describe.each(family.models.map((m) => [m.name, m] as const))('%s', (_name, model) => {
  it('runs 100 periods', () => {
    const root = make(model);
    expect(root.run(100)).toBe(100);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(model, seed);
      root.run(60);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('keeps one player per cell, all players placed, and scores as sums of recent plays', () => {
    const root = make(model, 4);
    const lattice = root.findScape<HostCell>('Lattice');
    for (let t = 0; t < 60; t++) {
      root.iterate();
      for (const cell of lattice.members) expect(cell.occupants.length).toBeLessThanOrEqual(1);
      for (const p of players(root)) {
        expect(p.hostCell).toBeDefined();
        // In step 4 the legacy code leaves totalScore stale after reproduction (see the README).
        if (model !== step4) expect(p.recentPlays.reduce((a, b) => a + b, 0)).toBe(p.totalScore);
        expect(['red', 'blue']).toContain(p.color);
      }
    }
    expect(root.data.latest('reds') + root.data.latest('blues')).toBe(players(root).length);
  });

  it('only references recorded series in its views, and has a lattice view', () => {
    const root = make(model);
    const known = new Set(root.data.series.map((s) => s.id));
    expect(root.allViews.some((v) => v.type === 'grid')).toBe(true);
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
  });

  it('rejects out-of-range parameters', () => {
    expect(() => make(model, 1, { nPlayers: 0 })).toThrow(ParameterError);
  });
});

describe('the five steps', () => {
  it('start from the same 100 players with random colours', () => {
    for (const model of family.models) {
      const root = make(model, 1);
      expect(players(root)).toHaveLength(100);
      expect(root.data.latest('reds')).toBeGreaterThan(25);
      expect(root.data.latest('blues')).toBeGreaterThan(25);
    }
  });

  it('record average payoff from step 2 on, not in step 1', () => {
    expect(make(step1).data.series.map((s) => s.id)).not.toContain('payoff.mean');
    for (const model of [step2, step3, step4, step5]) {
      expect(make(model).data.series.map((s) => s.id)).toContain('payoff.mean');
    }
  });

  it('settle on the better convention when one colour pays more (steps 1, 2, 3, 5)', () => {
    for (const model of [step1, step2, step3, step5]) {
      const root = make(model, 2, { blueScore: 2 });
      root.run(100);
      expect(root.data.latest('blues')).toBeGreaterThanOrEqual(95);
    }
  });

  it('lets errors keep a few players off the convention (step 2)', () => {
    const root = make(step2, 2, { blueScore: 2, error: 20 });
    root.run(100);
    expect(root.data.latest('reds')).toBeGreaterThan(0);
  });

  it('gives each player four friends (step 5) and none elsewhere', () => {
    const root = make(step5);
    for (const p of players(root)) expect(p.friends).toHaveLength(FRIENDS_SIZE);
    for (const p of players(make(step2))) expect(p.friends).toHaveLength(0);
  });

  it('reaches a single colour through friends even when both pay the same (step 5)', () => {
    const root = make(step5, 2);
    root.run(100);
    expect(Math.min(root.data.latest('reds'), root.data.latest('blues'))).toBeLessThanOrEqual(5);
  });

  it('grows the population by reproduction within the lattice (step 4)', () => {
    const root = make(step4, 1);
    root.run(60);
    const n = players(root).length;
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThanOrEqual(900);
  });

  it('keeps colours fixed in step 4: offspring inherit, nobody revises', () => {
    const root = make(step4, 3, { nPlayers: 1, repScore: 1 });
    root.run(40);
    const colours = new Set(players(root).map((p) => p.color));
    expect(colours.size).toBe(1);
  });

  it('lets low scorers die in step 4 when reproduction is impossible', () => {
    const root = make(step4, 3, { repScore: 100, minDieScore: 100, turnsToDie: 0 });
    root.run(5);
    expect(players(root)).toHaveLength(0);
  });
});
