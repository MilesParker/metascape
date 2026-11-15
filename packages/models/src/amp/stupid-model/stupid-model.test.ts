// SPDX-License-Identifier: EPL-2.0
import { type Array2D, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import type { Bug, Habitat } from './stupid-model';

const small = { width: 20, height: 20, bugCount: 30, bugVision: 3 };

describe('StupidModel family', () => {
  it.each(family.models.map((m) => [m.name, m] as const))('%s runs 30 periods', (_name, model) => {
    const root = new RootScape(model, { seed: 1, parameters: small });
    expect(root.run(30)).toBe(30);
    expect(root.data.latest('Bugs Population')).toBe(30);
  });

  it.each(family.models.map((m) => [m.name, m] as const))('%s is deterministic', (_n, model) => {
    const csv = (seed: number) => {
      const root = new RootScape(model, { seed, parameters: small });
      root.run(20);
      return root.data.toCSV() + root.scapes.flatMap((s) => [...s]).length;
    };
    expect(csv(3)).toBe(csv(3));
    const positions = (seed: number) => {
      const root = new RootScape(model, { seed, parameters: small });
      root.run(5);
      return [...root.findScape('Bugs')]
        .map((b) => `${(b as Bug).hostCell?.x},${(b as Bug).hostCell?.y}`)
        .join(';');
    };
    expect(positions(3)).not.toBe(positions(4));
  });

  it('keeps one bug per cell and moves at most bugVision cells', () => {
    const root = new RootScape(family.models[0]!, { seed: 2, parameters: small });
    const grid = root.findScape<Habitat>('Habitats').space as Array2D<Habitat>;
    const bugs = root.findScape('Bugs') as unknown as Iterable<Bug>;
    for (let t = 0; t < 20; t++) {
      const before = new Map([...bugs].map((b) => [b, b.hostCell!]));
      root.iterate();
      for (const b of bugs) {
        expect(grid.distance(before.get(b)!, b.hostCell!, 'chebyshev')).toBeLessThanOrEqual(3);
      }
      for (const cell of grid.members) expect(cell.occupants.length).toBeLessThanOrEqual(1);
    }
  });

  it('grows bugs by one per period in models 2 and 3', () => {
    for (const model of [family.models[1]!, family.models[2]!]) {
      const root = new RootScape(model, { seed: 1, parameters: small });
      root.run(12);
      expect(root.data.latest('Bug size.mean')).toBe(12);
    }
  });

  it('model 1 has no size and no food', () => {
    const root = new RootScape(family.models[0]!, { seed: 1, parameters: small });
    expect(() => root.data.get('Bug size.mean')).toThrow();
  });

  it('model 3 habitats accumulate food at about 0.005 per period', () => {
    const root = new RootScape(family.models[2]!, { seed: 1, parameters: small });
    root.run(100);
    expect(root.data.latest('Food.mean')).toBeGreaterThan(0.4);
    expect(root.data.latest('Food.mean')).toBeLessThan(0.6);
  });

  it('model 5 conserves food: produced = remaining + eaten', () => {
    const root = new RootScape(family.models[3]!, { seed: 5, parameters: small });
    root.run(40);
    const bugs = root.findScape('Bugs') as unknown as Iterable<Bug>;
    let eaten = 0;
    for (const b of bugs) {
      expect(b.size).toBeLessThanOrEqual(40 * 0.2 + 1e-9);
      eaten += b.size;
    }
    expect(eaten).toBeGreaterThan(0);
    const food = root.data.latest('Food.mean') * 400;
    // Expected production 0.25 per cell per period over 40 periods, give or take noise.
    expect(food + eaten).toBeGreaterThan(0.25 * 400 * 40 * 0.9);
    expect(food + eaten).toBeLessThan(0.25 * 400 * 40 * 1.1);
  });

  it('views refer to existing series', () => {
    for (const model of family.models) {
      const root = new RootScape(model, { seed: 1, parameters: small });
      for (const v of root.allViews) {
        if (v.type === 'timeSeries')
          for (const id of v.series) expect(() => root.data.get(id)).not.toThrow();
      }
    }
  });
});
