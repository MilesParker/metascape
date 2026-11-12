// SPDX-License-Identifier: EPL-2.0
import { Simulation } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { catalog, models } from './index';

const duplicates = (values: readonly string[]): string[] =>
  values.filter((value, i) => values.indexOf(value) !== i);

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

describe('model catalogue', () => {
  it('has unique family ids', () => {
    expect(duplicates(catalog.map((family) => family.id))).toEqual([]);
  });

  it('has unique model names, also once reduced to address form', () => {
    expect(duplicates(models.map((model) => model.name))).toEqual([]);
    expect(duplicates(models.map((model) => slug(model.name)))).toEqual([]);
  });

  it('states where every ported model comes from', () => {
    const ported = catalog.filter((family) => family.collection !== 'Metascape examples');
    for (const family of ported) {
      for (const model of family.models) {
        expect(model.provenance?.portedFrom, `${model.name}: portedFrom`).toBeTruthy();
        expect(model.provenance?.copyright, `${model.name}: copyright`).toBeTruthy();
      }
    }
  });

  it('gives every model a description', () => {
    for (const model of models) expect(model.description, model.name).toBeTruthy();
  });

  it('builds every model and gives it a view', () => {
    for (const model of models) {
      const sim = new Simulation(model, { seed: 1 });
      expect(sim.views.length + (model.views?.(sim).length ?? 0), model.name).toBeGreaterThan(0);
    }
  });
});
