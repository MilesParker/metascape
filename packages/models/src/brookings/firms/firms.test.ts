// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { UtilityFunction, output, type Employee, type Firm } from './firms';

const model = family.models[0]!;
const make = (seed: number | string = 1, employees = 100) =>
  new RootScape(model as never, { seed, parameters: { employees } as never });
const emps = (root: RootScape) => [...(root.findScape('employees') as Scape<Employee>)];
const firms = (root: RootScape) => [...(root.findScape('firms') as Scape<Firm>)];

describe('Emergence of Firms', () => {
  it('has the Brookings provenance', () => {
    expect(model.provenance?.authors).toBe('Robert L. Axtell');
    expect(model.provenance?.portedFrom).toBe('Ascape 5.6.1, edu.brook.firms.Model1');
  });

  it('starts with one firm per employee', () => {
    const root = make();
    expect(firms(root)).toHaveLength(100);
    expect(root.data.latest('firms')).toBe(100);
  });

  it('keeps every employee in exactly one firm and never keeps an empty firm', () => {
    const root = make(2);
    for (let t = 0; t < 120; t++) {
      root.iterate();
      let total = 0;
      for (const f of firms(root)) {
        expect(f.size).toBeGreaterThan(0);
        total += f.size;
        for (const e of f.employees) expect(e.firm).toBe(f);
      }
      expect(total).toBe(100);
      for (const e of emps(root)) {
        expect(e.firm.alive).toBe(true);
        expect(e.cpEffort).toBeGreaterThanOrEqual(0);
        expect(e.cpEffort).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic by seed', () => {
    const run = (seed: number) => {
      const root = make(seed, 60);
      root.run(40);
      return root.data.toCSV();
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('maximizes within [0, 1] and output has increasing returns', () => {
    const u = new UtilityFunction();
    u.theta = 0.6;
    const e = u.maximize();
    expect(e).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThanOrEqual(1);
    expect(output(0.5) / 0.5).toBeGreaterThan(output(0.25) / 0.25);
  });

  it('forms larger firms over time and a skewed size distribution', () => {
    const root = make(7, 500);
    root.run(300);
    expect(root.data.latest('firms')).toBeLessThan(500);
    expect(root.data.latest('firm size.max')).toBeGreaterThan(
      3 * root.data.latest('firm size.mean'),
    );
  });

  it('references only recorded series and distributions in its views', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    expect(root.allViews.some((v) => v.type === 'histogram')).toBe(true);
    for (const v of root.allViews) {
      if (v.type === 'timeSeries') for (const id of v.series) expect(known.has(id)).toBe(true);
      if (v.type === 'histogram')
        expect(() => root.data.distributionCounts(v.distribution)).not.toThrow();
    }
  });
});
