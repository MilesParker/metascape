// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { MAXIMUM_HAPPINESS, simple, type SimpleAgent } from './simple';

const make = (seed: number | string = 1, numberOfAgents = 2) =>
  new RootScape(simple, { seed, parameters: { numberOfAgents } });
const agents = (root: RootScape) => [...root.findScape('Agents')] as SimpleAgent[];

describe('Simple', () => {
  it('runs 50 periods', () => {
    const root = make();
    expect(root.run(50)).toBe(50);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed, 5);
      root.run(60);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('numbers behaviours from 0 in creation order, per run', () => {
    make();
    const root = make(1, 4);
    expect(agents(root).map((a) => a.behaviour)).toEqual([0, 1, 2, 3]);
  });

  it('doubles the first agent, capped, when it is alone', () => {
    const root = make(1, 1);
    const series = root.data.series.map((s) => s.id);
    expect(series).toContain('Happiness.max');
    root.run(12);
    expect(agents(root)[0]?.happiness).toBe(MAXIMUM_HAPPINESS);
    expect(root.data.latest('Happiness.max')).toBe(MAXIMUM_HAPPINESS);
  });

  it('keeps happiness within bounds and resets it when the environment breaks it', () => {
    const root = make(7, 2);
    let resets = 0;
    let previous = 3;
    for (let t = 0; t < 200; t++) {
      root.iterate();
      const h = agents(root)[0]?.happiness ?? 0;
      expect(h).toBeGreaterThanOrEqual(3);
      expect(h).toBeLessThanOrEqual(MAXIMUM_HAPPINESS);
      // Agent 0 acts first, so a reset shows as 3 instead of a doubling.
      if (h === 3 && previous !== 3) resets++;
      previous = h;
    }
    expect(resets).toBeGreaterThan(5);
  });

  it('reports 0 happiness for agents other than the first', () => {
    const root = make(1, 3);
    expect(agents(root).map((a) => a.reportedHappiness)).toEqual([3, 0, 0]);
  });

  it('has a lattice view and a chart over recorded series', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    expect(root.allViews.some((v) => v.type === 'grid')).toBe(true);
    for (const view of root.allViews) {
      if (view.type === 'timeSeries')
        for (const id of view.series) expect(known.has(id)).toBe(true);
    }
  });
});
