// SPDX-License-Identifier: EPL-2.0
import { type Array2D, ParameterError, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { MAX_RADIUS, norms, RING_SIZE, type NormCell } from './norms';

type Params = Partial<RootScape<typeof norms.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new RootScape(norms, { seed, parameters });
const cells = (root: RootScape) => [...root.findScape('Norm Model')] as NormCell[];

describe('Norms', () => {
  it('runs 100 periods with defaults', () => {
    const root = make();
    expect(root.run(100)).toBe(100);
    expect(cells(root)).toHaveLength(RING_SIZE);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(40);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('starts with radii in 1..initMaxRadius-1 and a roughly even split of norms', () => {
    const root = make(5, { initMaxRadius: 10 });
    for (const cell of cells(root)) {
      expect(cell.radius).toBeGreaterThanOrEqual(1);
      expect(cell.radius).toBeLessThanOrEqual(9);
    }
    const zeros = root.data.latest('strategy0');
    expect(zeros + root.data.latest('strategy1')).toBe(RING_SIZE);
    expect(zeros).toBeGreaterThan(60);
    expect(zeros).toBeLessThan(130);
  });

  it('keeps radii within 1..max and norms binary', () => {
    const root = make(4, { initMaxRadius: 95 });
    for (let t = 0; t < 60; t++) {
      root.iterate();
      for (const cell of cells(root)) {
        expect(cell.radius).toBeGreaterThanOrEqual(1);
        expect(cell.radius).toBeLessThanOrEqual(MAX_RADIUS);
        expect([0, 1]).toContain(cell.strategy);
      }
    }
  });

  it('samples a ring: radius r covers 2r+1 cells, wrapping at the ends', () => {
    const root = make(1, { initMaxRadius: 1 });
    const grid = root.findScape<NormCell>('Norm Model').space as Array2D<NormCell>;
    const first = cells(root)[0] as NormCell;
    const near = grid.findWithin(first, 2, { metric: 'chebyshev', includeSelf: true });
    expect(near).toHaveLength(5);
    expect(near.map((c) => c.x).sort((a, b) => a - b)).toEqual([
      0,
      1,
      2,
      RING_SIZE - 2,
      RING_SIZE - 1,
    ]);
  });

  it('keeps unanimous norms without noise (lock-in)', () => {
    const root = make(3, { lockIn: true, ambientNoise: 0 });
    expect(root.data.latest('strategy0')).toBe(RING_SIZE);
    root.run(80);
    expect(root.data.latest('strategy0')).toBe(RING_SIZE);
    expect(root.data.latest('strategy1')).toBe(0);
  });

  it('shrinks the sampling radius: agents learn to be thoughtless', () => {
    const root = make(1, { lockIn: true });
    const start = root.data.latest('radius.mean');
    root.run(100);
    expect(root.data.latest('radius.mean')).toBeLessThan(start / 2);
    expect(root.data.latest('strategy0')).toBeGreaterThan(150);
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { ambientNoise: 2 })).toThrow(ParameterError);
    expect(() => make(1, { initMaxRadius: 0 })).toThrow(ParameterError);
  });

  it('declares only series that its views use', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    expect(root.allViews.some((v) => v.type === 'grid')).toBe(true);
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
  });
});
