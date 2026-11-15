// SPDX-License-Identifier: EPL-2.0
import { resolveParameters, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { catalog, familyLoaders, models } from './index';

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
      const root = new RootScape(model, { seed: 1 });
      expect(root.allViews.length + (model.views?.(root).length ?? 0), model.name).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('family loaders', () => {
  it('load every family of the catalogue by id, and nothing else', async () => {
    expect(Object.keys(familyLoaders)).toEqual(catalog.map((family) => family.id));
    for (const family of catalog) {
      expect(await familyLoaders[family.id]!()).toBe(family);
    }
  });
});

describe('live parameters', () => {
  /** Values of a parameter away from its default, to try in turn. */
  const others = (p: { type: string; default: unknown; min?: number; max?: number }): unknown[] => {
    if (p.type === 'boolean') return [!p.default];
    const d = p.default as number;
    const step = p.type === 'int' ? 1 : Math.max(Math.abs(d) * 0.5, 0.01);
    // Half the default too: a period such as a season length may only show within the run at half.
    const half = p.type === 'int' ? Math.round(d / 2) : d / 2;
    return [p.max, p.min, d * 2 + step, d + step, d - step, half].filter(
      (v) =>
        v !== undefined &&
        v !== d &&
        (p.min === undefined || (v as number) >= p.min) &&
        (p.max === undefined || (v as number) <= p.max),
    );
  };

  // Runs every live parameter of every model a few times.
  it('take effect when changed in a running model', () => {
    for (const model of models) {
      for (const [name, parameter] of Object.entries(model.parameters)) {
        if (!parameter.live) continue;
        const baseline = new RootScape(model, { seed: 7 });
        baseline.run(45);
        const effective = others(parameter).some((value) => {
          const changed = new RootScape(model, { seed: 7 });
          changed.run(5);
          changed.setParameter(name, value as number | boolean);
          changed.run(40);
          return changed.data.toCSV() !== baseline.data.toCSV();
        });
        expect(effective, `${model.name}: ${name} has no effect`).toBe(true);
      }
    }
  }, 120_000);
});

describe('period scales', () => {
  it('match the year a model records, where it records one', () => {
    for (const model of models) {
      if (!model.period) continue;
      const root = new RootScape(model, { seed: 3 });
      root.run(4);
      if (!root.data.series.some((s) => s.id === 'year')) continue;
      const years = root.data.values('year');
      for (let i = 0; i < root.data.sampleCount; i++) {
        expect(root.data.periods[i], model.name).toBe(years[i]);
      }
    }
  });
});

describe('things to try', () => {
  it('name parameters, values, scapes and rules the model has', () => {
    for (const model of models) {
      for (const exploration of model.explorations ?? []) {
        const label = `${model.name}: ${exploration.title}`;
        expect(
          () => resolveParameters(model.parameters, exploration.parameters),
          label,
        ).not.toThrow();
        const root = new RootScape(model, { seed: 1 });
        for (const change of exploration.rules ?? []) {
          const names = root.findScape(change.scape).rules.map((r) => r.rule.name);
          for (const rule of [...(change.enable ?? []), ...(change.disable ?? [])]) {
            expect(names, label).toContain(rule);
          }
        }
      }
    }
  });
});
