// SPDX-License-Identifier: EPL-2.0
import { Simulation, type GridScape, type ParameterValues } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { life, type LifeCell } from './life';

type Params = Partial<ParameterValues<typeof life.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new Simulation(life, { seed, parameters });

/** The live cells as a sorted list of "x,y" strings, so that sets compare exactly. */
const liveCells = (sim: Simulation<typeof life.parameters>): string[] =>
  (sim.scape('cells') as GridScape<LifeCell>).members
    .filter((cell) => cell.on)
    .map((cell) => `${cell.x},${cell.y}`)
    .sort();

const shifted = (cells: string[], dx: number, dy: number, size: number): string[] =>
  cells
    .map((text) => {
      const [x, y] = text.split(',').map(Number) as [number, number];
      return `${(x + dx + size) % size},${(y + dy + size) % size}`;
    })
    .sort();

describe('life', () => {
  it('runs 200 ticks with default parameters', () => {
    const sim = make();
    expect(sim.run(200)).toBe(200);
    expect(sim.data.latest('live')).toBeGreaterThan(0);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const sim = make({}, seed);
      sim.run(30);
      return sim.data.toCSV();
    };
    expect(csv(5)).toBe(csv(5));
    expect(csv(5)).not.toBe(csv(6));
  });

  it('only refers to existing series and distributions in its views', () => {
    const sim = make();
    for (const view of sim.views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(() => sim.data.get(id)).not.toThrow();
      }
      if (view.type === 'histogram') {
        expect(() => sim.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make({ density: 1.5 })).toThrow();
    expect(() => make({ width: 1 })).toThrow();
    expect(() => make({ pattern: 'nonsense' as 'glider' })).toThrow();
  });

  it('oscillates a blinker with period 2', () => {
    const sim = make({ pattern: 'blinker' });
    const start = liveCells(sim);
    expect(start).toEqual(['29,29', '30,29', '31,29']);
    sim.step();
    const middle = liveCells(sim);
    expect(middle).toEqual(['30,28', '30,29', '30,30']);
    sim.step();
    expect(liveCells(sim)).toEqual(start);
  });

  it('moves a glider by (1,1) every 4 ticks on a torus', () => {
    const sim = make({ pattern: 'glider', width: 20, height: 20 });
    const start = liveCells(sim);
    expect(start).toHaveLength(5);
    sim.run(4);
    expect(liveCells(sim)).toEqual(shifted(start, 1, 1, 20));
    sim.run(76);
    expect(liveCells(sim)).toEqual(start);
  });

  it('applies the rule synchronously on a bounded grid', () => {
    const sim = make({ pattern: 'blinker', wrap: false, width: 5, height: 5 });
    expect(liveCells(sim)).toEqual(['1,1', '2,1', '3,1']);
    sim.step();
    expect(liveCells(sim)).toEqual(['2,0', '2,1', '2,2']);
  });
});
