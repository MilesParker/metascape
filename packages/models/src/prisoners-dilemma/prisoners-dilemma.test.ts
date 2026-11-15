// SPDX-License-Identifier: EPL-2.0
import { ParameterError, RootScape, type HostCell, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { prisonersDilemma, type Player } from './prisoners-dilemma';

type Params = Partial<RootScape<typeof prisonersDilemma.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new RootScape(prisonersDilemma, { seed, parameters });
const players = (root: RootScape) => [...root.findScape('players')] as Player[];

describe("Demographic Prisoner's Dilemma", () => {
  it('runs 200 iterations with defaults', () => {
    const root = make();
    root.run(200);
    expect(root.period).toBeGreaterThan(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(60);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    const views: readonly ViewSpec[] = root.allViews;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { cooperatorShare: 1.5 })).toThrow(ParameterError);
    expect(() => make(1, { initialAgents: 0 })).toThrow(ParameterError);
    expect(() => make(1, { maxAge: -1 })).toThrow(ParameterError);
  });

  it('never puts two agents on one cell and never keeps a negative-wealth agent', () => {
    const root = make(4, { maxAge: 0 });
    const grid = root.findScape<HostCell>('grid');
    for (let t = 0; t < 150; t++) {
      root.iterate();
      for (const cell of grid.members) expect(cell.occupants.length).toBeLessThanOrEqual(1);
      for (const player of players(root)) {
        expect(player.wealth).toBeGreaterThanOrEqual(0);
        expect(player.hostCell).toBeDefined();
      }
      if (root.stopped) break;
    }
  });

  it('has no defectors with zero mutation and only cooperators', () => {
    const root = make(6, { cooperatorShare: 1, mutation: 0 });
    expect(root.data.latest('defectors')).toBe(0);
    root.run(150);
    for (const value of root.data.values('defectors')) expect(value).toBe(0);
  });

  it('kills agents that reach the maximum age', () => {
    const root = make(8, { maxAge: 3, birthThreshold: 1000 });
    root.run(4);
    expect(players(root)).toHaveLength(0);
    expect(root.stopReason).toBe('extinct');
  });
});
