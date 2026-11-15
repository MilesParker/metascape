// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from '../check';
import { compileModel } from '../compile';
import { parseModel, type ModelSpec } from '../schema';
import { exampleSpecs } from './index';

const csv = (spec: ModelSpec, seed: number, iterations = 200): string => {
  const root = new RootScape(compileModel(spec), { seed });
  root.run(iterations);
  return root.data.toCSV();
};

describe.each(Object.entries(exampleSpecs))('example %s', (_name, spec) => {
  it('parses and has no diagnostics', () => {
    expect(parseModel(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
    expect(checkModel(spec)).toEqual([]);
  });

  it('runs 200 iterations reproducibly, depending on the seed', () => {
    const first = csv(spec, 1);
    expect(first.split('\n').length).toBeGreaterThan(2);
    expect(csv(spec, 1)).toBe(first);
    expect(csv(spec, 2)).not.toBe(first);
  });

  it('gives identical results after a JSON round trip', () => {
    const copy = JSON.parse(JSON.stringify(spec)) as ModelSpec;
    expect(csv(copy, 7, 50)).toBe(csv(spec, 7, 50));
  });

  it('declares views whose chart series exist in the data of the model', () => {
    const root = new RootScape(compileModel(spec), { seed: 3 });
    const charts = root.allViews.filter(
      (view) => view.type === 'timeSeries' || view.type === 'bars',
    );
    expect(charts).toHaveLength(spec.charts?.length ?? 0);
    for (const view of charts) {
      for (const id of view.series) expect(() => root.data.get(id)).not.toThrow();
    }
    const spaces = Object.values(spec.spaces ?? {});
    expect(root.allViews.length).toBeGreaterThanOrEqual(spaces.length + charts.length);
  });
});
