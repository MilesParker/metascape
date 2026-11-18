// SPDX-License-Identifier: EPL-2.0
//
// Every model of the catalogue written in the format runs the same generated
// as interpreted (docs/codegen.md): the same statistics and the same state of
// every agent, period by period.
import { compileModel, generationReport, traceRun } from '@metascape/spec';
import { describe, expect, it } from 'vitest';
import { catalog } from '.';
import { formatSourceOf } from './format-model';

const formatModels = catalog
  .flatMap((family) => family.models)
  .flatMap((model) => {
    const source = formatSourceOf(model);
    return source ? [[model.name, source] as const] : [];
  });

describe('format models, generated and interpreted', () => {
  it('include the AMP models and the pilot models', () => {
    const names = formatModels.map(([name]) => name);
    expect(names.length).toBeGreaterThanOrEqual(17);
    expect(names).toContain('Heatbugs (AMP)');
    expect(names).toContain('Civil Violence: Model I (format)');
    expect(names).toContain('Sugarscape II-1: Immediate growback (format)');
    expect(names).toContain('Emergence of Classes: Model One (format)');
  });

  it.each(formatModels)('%s runs the same in both', (_, { model, options }) => {
    const generated = compileModel(model, { ...options, execution: 'generated' });
    expect(generationReport(generated)!.interpreted).toEqual([]);
    const interpreted = compileModel(model, { ...options, execution: 'interpreted' });
    for (const seed of [1, 2]) {
      const expected = traceRun(interpreted, { seed, periods: 25 });
      const actual = traceRun(generated, { seed, periods: 25 });
      const first = actual.findIndex((line, i) => line !== expected[i]);
      expect(first, `first difference, seed ${seed}`).toBe(-1);
      expect(actual.length).toBe(expected.length);
    }
  });
});
