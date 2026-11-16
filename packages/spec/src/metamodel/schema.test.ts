// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { stupidModel1 } from './examples/stupid-model-1';
import { ModelFormatError, modelJsonSchema, parseModel } from './schema';
import type { Act, Model } from './types';

/** One act of every kind, with every optional field, to show the schema accepts all the types allow. */
const everyAct: Record<string, Act> = {
  rule: {
    kind: 'rule',
    label: 'Rule',
    pluralLabel: 'Rules',
    description: 'd',
    space: 'grid',
    targets: ['select'],
  },
  schedule: { kind: 'schedule', start: 1, interval: 2, priority: 3, pick: 4 },
  build: { kind: 'build' },
  initialize: { kind: 'initialize' },
  watch: { kind: 'watch', attribute: 'cell.heat' },
  derive: { kind: 'derive', attribute: 'cell.heat' },
  diffuse: {
    kind: 'diffuse',
    diffused: 'cell.heat',
    diffusionRate: 'rate',
    evaporationRate: 'rate',
  },
  perform: { kind: 'perform' },
  select: { kind: 'select', selected: 'rule', agent: 'cell', space: 'grid' },
  create: {
    kind: 'create',
    selected: 'build',
    agent: 'cell',
    space: 'grid',
    agentCount: { literal: 3 },
    shape: 'point',
  },
  load: {
    kind: 'load',
    selected: 'build',
    agent: 'cell',
    sourceURL: 'cells.csv',
    shape: 'polygon',
    agentCount: { evaluate: 'evaluate' },
  },
  query: {
    kind: 'query',
    selected: 'select',
    function: 'within',
    inputs: [{ attribute: 'rate', selected: 'rule' }, { constant: 'unit' }],
  },
  evaluate: {
    kind: 'evaluate',
    selected: 'rule',
    function: 'crossDistribution',
    inputs: [{ multiValue: ['cell.state'] }, { multiValue: [] }],
  },
  all: { kind: 'all', selected: 'select' },
  any: { kind: 'any', selected: 'select' },
  none: { kind: 'none', selected: 'select' },
  set: {
    kind: 'set',
    selected: 'rule',
    attribute: 'cell.state',
    parameter: { option: 'cell.state.on' },
  },
  move: { kind: 'move', selected: 'rule', destination: 'select' },
  leave: { kind: 'leave', selected: 'rule' },
  die: { kind: 'die', selected: 'rule' },
  connect: {
    kind: 'connect',
    selected: 'rule',
    destination: 'select',
    within: 'links',
    directed: false,
  },
  disconnect: { kind: 'disconnect', selected: 'rule', within: 'links' },
  replace: {
    kind: 'replace',
    selected: 'rule',
    destination: 'select',
    within: 'links',
    directed: true,
  },
  cause: { kind: 'cause', selected: 'rule', result: 'perform' },
  method: { kind: 'method', selected: 'rule', body: 'return;' },
  buildGrid: {
    kind: 'buildGrid',
    selected: 'build',
    agents: ['cell'],
    space: 'grid',
    attributes: ['cell.heat'],
    fillAgent: 'cell',
  },
  buildSpace: { kind: 'buildSpace', selected: 'build', space: 'plane' },
  buildNetwork: { kind: 'buildNetwork', selected: 'build', space: 'links' },
  buildGeography: { kind: 'buildGeography', selected: 'build', space: 'world' },
  group: { kind: 'group', label: 'Group', members: { inner: { kind: 'group', members: {} } } },
};

const everything: Model = {
  schemaVersion: 2,
  id: 'm',
  language: 'typescript',
  label: 'M',
  pluralLabel: 'Ms',
  description: 'Every part of the format.',
  attributes: {
    rate: {
      type: 'real',
      default: 0.5,
      min: 0,
      max: 1,
      gatherData: true,
      units: 'per period',
      immutable: false,
      derived: false,
    },
    on: { type: 'boolean', default: true, extensions: [{ kind: 'x', anything: [1] }] },
  },
  acts: everyAct,
  agents: {
    cell: {
      kind: 'agent',
      attributes: {
        heat: { type: 'real' },
        state: { type: 'state', options: { on: { label: 'On' }, off: {} }, defaultOption: 'off' },
      },
      styles: {
        flat: { kind: '2d', acts: {} },
        solid: { kind: '3d' },
        outline: { kind: 'shape', shape: 'line' },
      },
      extensions: [{ kind: 'x' }],
    },
    region: { kind: 'scape', agents: { farmer: { kind: 'agent' } } },
  },
  spaces: {
    grid: {
      kind: 'grid',
      dimensions: ['w'],
      neighborhood: 'vonNeumann',
      borderRule: 'periodic',
      multiOccupant: true,
      attributes: { w: { type: 'integer' } },
    },
    plane: {
      kind: 'continuous',
      dimensions: ['w'],
      borderRule: 'sticky',
      attributes: { w: { type: 'real' } },
    },
    links: { kind: 'network', directed: true },
    world: { kind: 'geography' },
  },
  valueLayers: { layer: { label: 'Layer' } },
};

describe('parseModel', () => {
  it('accepts StupidModel 1', () => {
    expect(parseModel(stupidModel1)).toEqual(stupidModel1);
  });

  it('accepts every element and field the types allow', () => {
    expect(parseModel(everything)).toEqual(everything);
  });

  it('rejects unknown fields', () => {
    expect(() => parseModel({ ...stupidModel1, parameters: {} })).toThrow(ModelFormatError);
  });

  it('does not let a root act name a selection: it is its own', () => {
    const model = JSON.parse(JSON.stringify(stupidModel1)) as Model;
    Object.assign(model.agents!.bug!.acts!.bugRule!, { selected: 'bugRule' });
    expect(() => parseModel(model)).toThrow(/agents\.bug\.acts\.bugRule/);
  });

  it('requires the format version and implementation language', () => {
    const error = (() => {
      try {
        parseModel({ ...stupidModel1, schemaVersion: 1, language: 'java' });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ModelFormatError);
    expect((error as ModelFormatError).diagnostics.map((d) => d.path).sort()).toEqual([
      'language',
      'schemaVersion',
    ]);
  });

  it('requires a state attribute to have options', () => {
    expect(() =>
      parseModel({ ...stupidModel1, attributes: { s: { type: 'state', options: {} } } }),
    ).toThrow(/at least one option/);
  });

  it('reads a literal type only from the attribute types', () => {
    const model = JSON.parse(JSON.stringify(stupidModel1)) as Model;
    Object.assign(model.agents!.bug!.acts!.habitatWItin!, {
      inputs: [{ literal: 1, type: 'numeric' }],
    });
    expect(() => parseModel(model)).toThrow(ModelFormatError);
  });
});

describe('modelJsonSchema', () => {
  it('describes the format', () => {
    const schema = modelJsonSchema();
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(expect.arrayContaining(['schemaVersion', 'id', 'language']));
    expect(JSON.stringify(schema)).toContain('buildGrid');
  });
});
