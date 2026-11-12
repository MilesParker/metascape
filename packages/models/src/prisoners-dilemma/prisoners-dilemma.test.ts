// SPDX-License-Identifier: EPL-2.0
import { ParameterError, Simulation, type GridScape, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { prisonersDilemma, type Player } from './prisoners-dilemma';

type Params = Partial<Simulation<typeof prisonersDilemma.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new Simulation(prisonersDilemma, { seed, parameters });
const players = (sim: Simulation) => [...sim.scape('players')] as Player[];

describe("Demographic Prisoner's Dilemma", () => {
  it('runs 200 ticks with defaults', () => {
    const sim = make();
    sim.run(200);
    expect(sim.tick).toBeGreaterThan(0);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(60);
      return sim.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const sim = make();
    const known = new Set(sim.data.series.map((s) => s.id));
    const views: readonly ViewSpec[] = sim.views;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => sim.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { cooperatorShare: 1.5 })).toThrow(ParameterError);
    expect(() => make(1, { initialAgents: 0 })).toThrow(ParameterError);
    expect(() => make(1, { maxAge: -1 })).toThrow(ParameterError);
  });

  it('never puts two agents on one cell and never keeps a negative-wealth agent', () => {
    const sim = make(4, { maxAge: 0 });
    const grid = sim.scape('grid') as unknown as GridScape;
    for (let t = 0; t < 150; t++) {
      sim.step();
      for (const cell of grid.members) expect(cell.occupants.length).toBeLessThanOrEqual(1);
      for (const player of players(sim)) {
        expect(player.wealth).toBeGreaterThanOrEqual(0);
        expect(player.cell).toBeDefined();
      }
      if (sim.stopped) break;
    }
  });

  it('has no defectors with zero mutation and only cooperators', () => {
    const sim = make(6, { cooperatorShare: 1, mutation: 0 });
    expect(sim.data.latest('defectors')).toBe(0);
    sim.run(150);
    for (const value of sim.data.values('defectors')) expect(value).toBe(0);
  });

  it('kills agents that reach the maximum age', () => {
    const sim = make(8, { maxAge: 3, birthThreshold: 1000 });
    sim.run(4);
    expect(players(sim)).toHaveLength(0);
    expect(sim.stopReason).toBe('extinct');
  });
});
