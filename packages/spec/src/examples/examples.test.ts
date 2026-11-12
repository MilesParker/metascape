// SPDX-License-Identifier: EPL-2.0
import { Simulation } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from '../check';
import { compileModel } from '../compile';
import { parseModel, type ModelSpec } from '../schema';
import { exampleSpecs } from './index';

const csv = (spec: ModelSpec, seed: number, ticks = 200): string => {
  const sim = new Simulation(compileModel(spec), { seed });
  sim.run(ticks);
  return sim.data.toCSV();
};

describe.each(Object.entries(exampleSpecs))('example %s', (_name, spec) => {
  it('parses and has no diagnostics', () => {
    expect(parseModel(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
    expect(checkModel(spec)).toEqual([]);
  });

  it('runs 200 ticks reproducibly, depending on the seed', () => {
    const first = csv(spec, 1);
    expect(first.split('\n').length).toBeGreaterThan(2);
    expect(csv(spec, 1)).toBe(first);
    expect(csv(spec, 2)).not.toBe(first);
  });

  it('gives identical results after a JSON round trip', () => {
    const copy = JSON.parse(JSON.stringify(spec)) as ModelSpec;
    expect(csv(copy, 7, 50)).toBe(csv(spec, 7, 50));
  });

  it('declares views whose chart series exist in sim.data', () => {
    const sim = new Simulation(compileModel(spec), { seed: 3 });
    const charts = sim.views.filter((view) => view.type === 'timeSeries' || view.type === 'bars');
    expect(charts).toHaveLength(spec.charts?.length ?? 0);
    for (const view of charts) {
      for (const id of view.series) expect(() => sim.data.get(id)).not.toThrow();
    }
    const spaces = Object.values(spec.spaces ?? {});
    expect(sim.views.length).toBeGreaterThanOrEqual(spaces.length + charts.length);
  });
});
