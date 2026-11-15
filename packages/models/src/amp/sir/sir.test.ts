// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family, sir } from './index';

const make = (seed: number | string = 1, parameters = {}) =>
  new RootScape(sir, { seed, parameters });
const series = (root: RootScape, id: string) => Array.from(root.data.values(id));

describe('sir', () => {
  it('has the AMP defaults and the stated provenance', () => {
    expect(sir.parameters.contactRate.default).toBe(0.333);
    expect(sir.parameters.infectivity.default).toBe(0.2);
    expect(sir.parameters.illnessDuration.default).toBe(84);
    expect(sir.parameters.population.default).toBe(10000);
    expect(sir.provenance?.authors).toBe('W. O. Kermack and A. G. McKendrick');
    expect(sir.provenance?.citation).toContain(
      'Proceedings of the Royal Society A, 115(772), 700-721',
    );
    expect(family.id).toBe('amp-sir');
  });

  it('holds the initial stocks at periods 0 and 1 and steps with Euler from period 2', () => {
    const root = make();
    root.run(3);
    const s = series(root, 'SucseptiblePopulation');
    const i = series(root, 'InfectedPopulation');
    const r = series(root, 'RecoveredPopulation');
    expect([s[0], s[1]]).toEqual([9999, 9999]);
    expect([i[0], i[1]]).toEqual([1, 1]);
    expect([r[0], r[1]]).toEqual([0, 0]);
    const infection = (9999 * 0.333 * 0.2 * 1) / 10000;
    const recovery = 1 / 84;
    expect(s[2]).toBeCloseTo(9999 - infection, 12);
    expect(i[2]).toBeCloseTo(1 + infection - recovery, 12);
    expect(r[2]).toBeCloseTo(recovery, 12);
    // The flow recorded at period t uses the stocks of period t.
    expect(series(root, 'InfectionRate')[1]).toBeCloseTo(infection, 12);
  });

  it('conserves the population and rises and falls like an epidemic', () => {
    const root = make();
    root.run(600);
    const s = series(root, 'SucseptiblePopulation');
    const i = series(root, 'InfectedPopulation');
    const r = series(root, 'RecoveredPopulation');
    for (let t = 0; t < s.length; t++) expect(s[t]! + i[t]! + r[t]!).toBeCloseTo(10000, 6);
    const peak = Math.max(...i);
    expect(peak).toBeGreaterThan(1000);
    expect(i[i.length - 1]!).toBeLessThan(peak / 10);
    expect(r[r.length - 1]!).toBeGreaterThan(5000);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0);
  });

  it('does not take off when the infection rate is below the recovery rate', () => {
    const root = make(1, { contactRate: 0.1, illnessDuration: 20 });
    root.run(200);
    const i = series(root, 'InfectedPopulation');
    expect(Math.max(...i)).toBeLessThanOrEqual(1.0001);
  });

  it('is fully deterministic and ignores the seed', () => {
    const csv = (seed: number) => {
      const root = make(seed);
      root.run(100);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).toBe(csv(2));
  });

  it('has views over recorded series and stops at the stop period', () => {
    const root = make(1, { periods: 50 });
    root.run(1000);
    expect(root.iteration).toBe(50);
    const known = new Set(root.data.series.map((x) => x.id));
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
  });
});
