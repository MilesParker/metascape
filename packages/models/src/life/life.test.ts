// SPDX-License-Identifier: EPL-2.0
import { RootScape, type ParameterValues } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { life, type LifeCell } from './life';

type Params = Partial<ParameterValues<typeof life.parameters>>;

const make = (parameters: Params = {}, seed = 1) => new RootScape(life, { seed, parameters });

/** The live cells as a sorted list of "x,y" strings, so that sets compare exactly. */
const liveCells = (root: RootScape<typeof life.parameters>): string[] =>
  root
    .findScape<LifeCell>('cells')
    .members.filter((cell) => cell.on)
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
  it('runs 200 iterations with default parameters', () => {
    const root = make();
    expect(root.run(200)).toBe(200);
    expect(root.data.latest('live')).toBeGreaterThan(0);
  });

  it('is reproducible and depends on the seed', () => {
    const csv = (seed: number) => {
      const root = make({}, seed);
      root.run(30);
      return root.data.toCSV();
    };
    expect(csv(5)).toBe(csv(5));
    expect(csv(5)).not.toBe(csv(6));
  });

  it('only refers to existing series and distributions in its views', () => {
    const root = make();
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(() => root.data.get(id)).not.toThrow();
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make({ density: 1.5 })).toThrow();
    expect(() => make({ width: 1 })).toThrow();
    expect(() => make({ pattern: 'nonsense' as 'glider' })).toThrow();
  });

  it('oscillates a blinker with period 2', () => {
    const root = make({ pattern: 'blinker' });
    const start = liveCells(root);
    expect(start).toEqual(['29,29', '30,29', '31,29']);
    root.iterate();
    const middle = liveCells(root);
    expect(middle).toEqual(['30,28', '30,29', '30,30']);
    root.iterate();
    expect(liveCells(root)).toEqual(start);
  });

  it('moves a glider by (1,1) every 4 periods on a torus', () => {
    const root = make({ pattern: 'glider', width: 20, height: 20 });
    const start = liveCells(root);
    expect(start).toHaveLength(5);
    root.run(4);
    expect(liveCells(root)).toEqual(shifted(start, 1, 1, 20));
    root.run(76);
    expect(liveCells(root)).toEqual(start);
  });

  it('applies the rule synchronously on a bounded grid', () => {
    const root = make({ pattern: 'blinker', wrap: false, width: 5, height: 5 });
    expect(liveCells(root)).toEqual(['1,1', '2,1', '3,1']);
    root.iterate();
    expect(liveCells(root)).toEqual(['2,0', '2,1', '2,2']);
  });
});
