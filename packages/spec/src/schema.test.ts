// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { ModelFormatError, modelJsonSchema, parseModel, type ModelSpec } from './schema';

/** Conway's Life, written as data. Also checks that the types accept a realistic model. */
const life: ModelSpec = {
  schemaVersion: 1,
  name: 'Life',
  parameters: {
    size: { type: 'int', default: 40, min: 3, max: 200 },
    density: { type: 'real', default: 0.3, min: 0, max: 1 },
  },
  spaces: {
    world: { kind: 'grid', width: 'param.size', height: 'param.size', neighborhood: 'moore' },
  },
  agents: {
    cell: {
      space: 'world',
      as: 'cell',
      attributes: {
        on: { type: 'boolean', initial: { op: 'chance', args: ['param.density'] }, record: true },
      },
      rules: [
        {
          name: 'life',
          synchronous: true,
          do: [
            {
              let: 'live',
              value: {
                aggregate: 'count',
                over: { type: 'cell', from: 'neighbors', where: 'other.on' },
              },
            },
            {
              set: 'on',
              to: {
                op: 'or',
                args: [
                  { op: 'eq', args: ['live', 3] },
                  { op: 'and', args: ['on', { op: 'eq', args: ['live', 2] }] },
                ],
              },
            },
          ],
        },
      ],
      style: { color: { op: 'if', args: ['on', { color: '#3fa45b' }, { color: '#181c22' }] } },
    },
  },
  charts: [{ kind: 'timeSeries', title: 'Live cells', series: ['cell.on'] }],
};

describe('model format', () => {
  it('accepts a well-formed model and returns it unchanged', () => {
    expect(parseModel(JSON.parse(JSON.stringify(life)))).toEqual(life);
  });

  it('reports every structural problem with its path', () => {
    const broken = JSON.parse(JSON.stringify(life));
    broken.schemaVersion = 2;
    broken.agents.cell.attributes.on.type = 'bool';
    broken.agents.cell.rules[0].do[1].to.args[0].op = 'equals';
    broken.agents.Cell = {};
    broken.extra = true;
    let error: unknown;
    try {
      parseModel(broken);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ModelFormatError);
    const paths = (error as ModelFormatError).diagnostics.map((d) => d.path);
    expect(paths).toContain('schemaVersion');
    expect(paths.some((path) => path.startsWith('agents.cell.attributes.on'))).toBe(true);
    expect(paths.some((path) => path.startsWith('agents.cell.rules[0].do[1]'))).toBe(true);
    expect((error as Error).message).toMatch(/problems/);
  });

  it('rejects unknown keys, bad names and bad colours', () => {
    const withBad = (
      change: (model: ModelSpec & Record<string, unknown>) => void,
    ): (() => void) => {
      const copy = JSON.parse(JSON.stringify(life));
      change(copy);
      return () => parseModel(copy);
    };
    expect(withBad((model) => (model.typo = 1))).toThrow(ModelFormatError);
    expect(withBad((model) => (model.agents['Bad name'] = {}))).toThrow(ModelFormatError);
    expect(withBad((model) => (model.agents.cell!.style = { color: { color: 'red' } }))).toThrow(
      ModelFormatError,
    );
  });

  it('produces a JSON Schema for editors', () => {
    const schema = modelJsonSchema();
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties as object)).toEqual(
      expect.arrayContaining(['schemaVersion', 'name', 'parameters', 'spaces', 'agents']),
    );
  });
});
