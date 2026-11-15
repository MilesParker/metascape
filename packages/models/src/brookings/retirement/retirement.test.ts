// SPDX-License-Identifier: EPL-2.0
import { type Model, ParameterError, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family, population, populationCoupled, populationSmallWorld } from './index';
import {
  AGE_SPAN,
  COHORT_SIZE,
  DEAD,
  OLDEST_AGE,
  RATIONAL,
  RETIRED,
  WORKING,
  YOUNGEST_AGE,
  type Person,
} from './person';

const make = (model: Model, seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new RootScape(model as Model, { seed, parameters } as never);
const people = (root: RootScape) => [...root.findScape('Population')] as Person[];

describe.each(family.models.map((m) => [m.name, m] as const))('%s', (_name, model) => {
  it('builds a 100 x 51 population and runs 40 periods', () => {
    const root = make(model);
    expect(people(root)).toHaveLength(COHORT_SIZE * AGE_SPAN);
    expect(root.run(40)).toBe(40);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(model, seed);
      root.run(30);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('keeps ages in range, statuses valid, and has no working rational person who is eligible after a period', () => {
    const root = make(model, 3);
    let violations = 0;
    for (let t = 0; t < 30; t++) {
      root.iterate();
      for (const p of people(root)) {
        if (p.age < YOUNGEST_AGE || p.age > OLDEST_AGE) violations++;
        if (![WORKING, RETIRED, DEAD].includes(p.status)) violations++;
        if (p.strategy === RATIONAL && p.eligible && p.status === WORKING) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('never retires anyone when nobody can start a cascade', () => {
    const root = make(model, 4, { fractionRational: 0, fractionRandom: 0 });
    root.run(60);
    expect(root.data.latest('retired')).toBe(0);
  });

  it('lets imitators retire in a cascade once rational agents start it', () => {
    const root = make(model, 1);
    root.run(80);
    expect(root.data.latest('retiredShareOfEligible')).toBeGreaterThan(0.3);
    expect(root.data.latest('imitatorRetired')).toBeGreaterThan(
      root.data.latest('rationalRetired'),
    );
  });

  it('only references recorded series in its views', () => {
    const root = make(model);
    const known = new Set(root.data.series.map((s) => s.id));
    expect(root.allViews.some((v) => v.type === 'grid')).toBe(true);
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects impossible parameters', () => {
    expect(() => make(model, 1, { fractionRational: 0.8, fractionRandom: 0.5 })).toThrow(Error);
    expect(() => make(model, 1, { fractionRandom: 2 })).toThrow(ParameterError);
  });
});

describe('networks', () => {
  it('draws 10 to 25 other people from rows within five of the own row', () => {
    const root = make(population, 5);
    let violations = 0;
    for (const p of people(root)) {
      if (p.network.length < 10 || p.network.length > 25) violations++;
      for (const other of p.network) {
        const d = Math.abs(other.y - p.y);
        if (other === p || Math.min(d, AGE_SPAN - d) > 5) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('honors the network size parameters', () => {
    const root = make(population, 5, { minNetworkSize: 3, maxNetworkSize: 3 });
    for (const p of people(root)) expect(p.network).toHaveLength(3);
    expect(() => make(population, 1, { minNetworkSize: 8, maxNetworkSize: 4 })).toThrow(Error);
  });

  it('gives the small-world version the 24 cells within two steps, wrapping', () => {
    const root = make(populationSmallWorld, 5);
    let violations = 0;
    for (const p of people(root)) {
      if (p.network.length !== 24 || p.network.includes(p)) violations++;
      for (const other of p.network) {
        const dx = Math.abs(other.x - p.x);
        const dy = Math.abs(other.y - p.y);
        if (Math.min(dx, COHORT_SIZE - dx) > 2 || Math.min(dy, AGE_SPAN - dy) > 2) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('behaves in the coupled variant exactly as in the plain population (legacy quirk)', () => {
    const csv = (model: Model) => {
      const root = make(model, 9);
      root.run(25);
      return root.data.toCSV();
    };
    expect(csv(populationCoupled)).toBe(csv(population));
  });
});
