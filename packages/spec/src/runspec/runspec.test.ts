// SPDX-License-Identifier: EPL-2.0
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import type { Curation } from '../curation/types';
import { compileModel } from '../metamodel/interpreter';
import { parseModel } from '../metamodel/schema';
import type { Model } from '../metamodel/types';
import { checkCuration, checkRunSpec, checkRunTest } from './check';
import { describeConstraint, measurementLabel } from './measure';
import { checkConstraints, lookupIn, resolveRunSpec, runsOf } from './runs';
import { parseRunSpec, parseRunTest } from './schema';
import type { RunSpec, RunTest } from './types';

const model: Model = {
  schemaVersion: 2,
  id: 'world',
  language: 'typescript',
  attributes: {
    count: { type: 'integer', default: 10 },
    rate: { type: 'real', default: 0.5 },
    name: { type: 'symbol' },
    open: { type: 'boolean' },
    fixed: { type: 'integer', immutable: true },
    mode: { type: 'state', options: { calm: {}, wild: {} } },
  },
  agents: {
    walker: {
      kind: 'agent',
      label: 'Walker',
      pluralLabel: 'Walkers',
      attributes: {
        energy: { type: 'real', label: 'Energy' },
        awake: { type: 'boolean', label: 'Awake' },
        status: { type: 'state', options: { well: { label: 'Well' }, ill: { label: 'Ill' } } },
      },
    },
  },
  spaces: {
    grid: {
      kind: 'grid',
      neighborhood: 'moore',
      dimensions: ['width'],
      attributes: { width: { type: 'integer', default: 5 } },
    },
  },
};

const spec = (fields: Partial<RunSpec>): RunSpec => ({
  schemaVersion: 1,
  id: 'spec',
  model: 'world',
  ...fields,
});

describe('runs of a run spec', () => {
  it('is one run without sweeps, named by its label', () => {
    expect(
      runsOf(
        spec({
          label: 'Base',
          stopPeriod: 9,
          parameters: [{ kind: 'single', attribute: 'count', value: 3 }],
        }),
      ),
    ).toEqual([{ name: 'Base', parameters: { count: 3 }, stopPeriod: 9, stopWhen: [] }]);
  });

  it('crosses sweeps, the first slowest, without drift', () => {
    const runs = runsOf(
      spec({
        parameters: [
          { kind: 'sweep', attribute: 'count', start: 1, end: 2, increment: 1 },
          { kind: 'single', attribute: 'name', value: 'x' },
          { kind: 'sweep', attribute: 'rate', start: 0.1, end: 0.3, increment: 0.1 },
        ],
      }),
    );
    expect(runs.map((run) => run.parameters)).toEqual([
      { count: 1, name: 'x', rate: 0.1 },
      { count: 1, name: 'x', rate: 0.2 },
      { count: 1, name: 'x', rate: 0.3 },
      { count: 2, name: 'x', rate: 0.1 },
      { count: 2, name: 'x', rate: 0.2 },
      { count: 2, name: 'x', rate: 0.3 },
    ]);
    expect(runs.map((run) => run.name)).toEqual([
      'spec 1',
      'spec 2',
      'spec 3',
      'spec 4',
      'spec 5',
      'spec 6',
    ]);
  });

  it('advances a link together, a member that has run out keeping its last value', () => {
    const runs = runsOf(
      spec({
        parameters: [
          {
            kind: 'link',
            parameters: [
              { kind: 'sweep', attribute: 'count', start: 1, end: 3, increment: 1 },
              { kind: 'sweep', attribute: 'rate', start: 1, end: 0.5, increment: -0.5 },
            ],
          },
        ],
      }),
    );
    expect(runs.map((run) => run.parameters)).toEqual([
      { count: 1, rate: 1 },
      { count: 2, rate: 0.5 },
      { count: 3, rate: 0.5 },
    ]);
  });

  it('is none when a sweep has no values', () => {
    expect(
      runsOf(
        spec({
          parameters: [{ kind: 'sweep', attribute: 'count', start: 1, end: 3, increment: -1 }],
        }),
      ),
    ).toEqual([]);
  });

  it('takes in what it incorporates: its own settings first, then the later incorporated', () => {
    const specs = [
      spec({
        id: 'a',
        stopPeriod: 5,
        parameters: [{ kind: 'single', attribute: 'count', value: 1 }],
      }),
      spec({
        id: 'b',
        stopWhen: [{ measure: 'count', agent: 'walker', min: 0, max: 0 }],
        parameters: [
          { kind: 'single', attribute: 'count', value: 2 },
          { kind: 'single', attribute: 'rate', value: 0.2 },
        ],
      }),
      spec({
        id: 'c',
        incorporates: ['a', 'b'],
        parameters: [
          {
            kind: 'link',
            parameters: [
              { kind: 'single', attribute: 'rate', value: 0.9 },
              { kind: 'single', attribute: 'name', value: 'c' },
            ],
          },
        ],
      }),
    ];
    const resolved = resolveRunSpec(specs[2]!, lookupIn(specs));
    expect(resolved).toEqual({
      stopPeriod: 5,
      stopWhen: [{ measure: 'count', agent: 'walker', min: 0, max: 0 }],
      parameters: [
        {
          kind: 'link',
          parameters: [
            { kind: 'single', attribute: 'rate', value: 0.9 },
            { kind: 'single', attribute: 'name', value: 'c' },
          ],
        },
        { kind: 'single', attribute: 'count', value: 2 },
      ],
    });
    expect(() => resolveRunSpec(spec({ incorporates: ['spec'] }), lookupIn([]))).toThrow(
      'incorporates spec',
    );
    expect(() => resolveRunSpec(spec({ incorporates: ['x'] }))).toThrow('missing');
  });
});

describe('checking', () => {
  it('accepts what fits the model', () => {
    const fine = spec({
      stopPeriod: 10,
      stopWhen: [
        { measure: 'count', agent: 'walker', attribute: 'awake', qualifier: false, min: 0, max: 0 },
      ],
      parameters: [
        { kind: 'single', attribute: 'count', value: 3 },
        { kind: 'single', attribute: 'rate', value: 1 },
        { kind: 'single', attribute: 'name', value: 'x' },
        { kind: 'single', attribute: 'open', value: true },
        { kind: 'single', attribute: 'mode', value: 'wild' },
        { kind: 'sweep', attribute: 'grid.width', start: 2, end: 4, increment: 2 },
      ],
    });
    expect(checkRunSpec(fine, model)).toEqual([]);
    expect(parseRunSpec(JSON.parse(JSON.stringify(fine)))).toEqual(fine);
  });

  it('reports what does not', () => {
    const bad = spec({
      model: 'other',
      incorporates: ['missing'],
      stopWhen: [
        { measure: 'average', agent: 'walker', attribute: 'status', min: 0, max: 1 },
        {
          measure: 'count',
          agent: 'walker',
          attribute: 'status',
          qualifier: 'dead',
          min: 0,
          max: 1,
        },
        { measure: 'count', agent: 'nobody', min: 1, max: 0 },
        { measure: 'count', agent: 'walker', attribute: 'energy', qualifier: true, min: 0, max: 1 },
      ],
      parameters: [
        { kind: 'single', attribute: 'count', value: 1.5 },
        { kind: 'single', attribute: 'fixed', value: 1 },
        { kind: 'single', attribute: 'walker.energy', value: 1 },
        { kind: 'single', attribute: 'mode', value: 'stormy' },
        { kind: 'sweep', attribute: 'count', start: 1, end: 2, increment: 0.5 },
        { kind: 'sweep', attribute: 'name', start: 1, end: 2, increment: 1 },
        { kind: 'sweep', attribute: 'rate', start: 1, end: 2, increment: -1 },
      ],
    });
    expect(checkRunSpec(bad, model, lookupIn([])).map((d) => `${d.path}: ${d.message}`)).toEqual([
      'model: Is about the model `other`, not `world`',
      'incorporates[0]: There is no run spec `missing`',
      'parameters[0].value: `count` takes an integer',
      'parameters[1].attribute: `fixed` is immutable',
      'parameters[2].attribute: `walker.energy` is not a parameter: an attribute of the root scape or of one of its spaces',
      'parameters[3].value: `mode` takes one of calm, wild',
      'parameters[4].attribute: `count` is set more than once; the first is used',
      'parameters[4].increment: `count` takes an integer',
      'parameters[5].attribute: `name` is not numeric, so it cannot be swept',
      'parameters[6]: The sweep has no values: its increment points away from its end',
      'stopWhen[0].measure: average needs a numeric attribute',
      'stopWhen[1].qualifier: `status` has no option `dead`',
      'stopWhen[2].agent: The model has no agent `nobody`',
      'stopWhen[2]: Its minimum is above its maximum, so it never holds',
      'stopWhen[3].qualifier: Only a state or boolean attribute takes a qualifier',
    ]);
    expect(checkRunSpec({ ...bad, stopPeriod: 1.5 }, model)[0]!.message).toBe(
      'A stop period is a whole number',
    );
  });

  it('checks run tests and curation', () => {
    const test: RunTest = {
      schemaVersion: 1,
      id: 'test',
      constraints: [
        {
          measure: 'count',
          agent: 'walker',
          attribute: 'status',
          qualifier: 'ill',
          min: 0,
          max: 0,
        },
      ],
    };
    expect(checkRunTest(test, model).map((d) => d.message)).toEqual([
      'A test with constraints names the run spec it runs',
    ]);
    expect(checkRunTest({ ...test, runSpec: 'spec' }, model, lookupIn([spec({})]))).toEqual([]);
    expect(parseRunTest(test)).toEqual(test);
    const curation: Curation = {
      schemaVersion: 1,
      model: 'world',
      measures: [{ measure: 'maximum', agent: 'walker', attribute: 'energy' }],
      charts: [
        {
          title: 'Walkers',
          series: [
            { measure: 'count', agent: 'walker' },
            { measure: 'count', agent: 'walker', attribute: 'awake', qualifier: false },
          ],
        },
      ],
    };
    expect(checkCuration(curation, model).map((d) => `${d.path}: ${d.message}`)).toEqual([
      'charts[0].series[1].qualifier: A chart can show only the count of true values',
    ]);
  });
});

describe('measurements', () => {
  it('are named from the labels of the model', () => {
    const label = (m: Parameters<typeof measurementLabel>[1]) => measurementLabel(model, m);
    expect(label({ measure: 'count', agent: 'walker' })).toBe('Walkers');
    expect(
      label({ measure: 'count', agent: 'walker', attribute: 'status', qualifier: 'ill' }),
    ).toBe('Ill');
    expect(label({ measure: 'count', agent: 'walker', attribute: 'awake' })).toBe('Awake');
    expect(label({ measure: 'count', agent: 'walker', attribute: 'awake', qualifier: false })).toBe(
      'Walkers not awake',
    );
    expect(label({ measure: 'average', agent: 'walker', attribute: 'energy' })).toBe('Mean Energy');
    expect(describeConstraint(model, { measure: 'count', agent: 'walker', min: 0, max: 0 })).toBe(
      'Walkers = 0',
    );
    expect(
      describeConstraint(model, {
        measure: 'sum',
        agent: 'walker',
        attribute: 'energy',
        min: 1,
        max: 2,
      }),
    ).toBe('Total Energy from 1 to 2');
  });
});

describe('the Escape run files, run', () => {
  const folder = new URL('../../examples/escape/', import.meta.url);
  const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, folder), 'utf8'));
  const epidemic = parseModel(json('Epidemic.model.json'));
  const specs = readdirSync(new URL('params/', folder))
    .filter((name) => name.endsWith('.run.json'))
    .map((name) => parseRunSpec(json(`params/${name}`)));
  const lookup = lookupIn(specs);
  const zero = parseRunTest(json('tests/ZeroTransmission.test.json'));
  const curation: Curation = {
    schemaVersion: 1,
    model: 'epidemic',
    charts: [
      {
        title: 'Status',
        series: [
          { measure: 'count', agent: 'individual', attribute: 'status', qualifier: 'dead' },
          {
            measure: 'count',
            agent: 'individual',
            attribute: 'status',
            qualifier: 'recovered',
            label: 'Well again',
          },
        ],
      },
    ],
  };
  const compiled = compileModel(epidemic, {
    curation,
    runSpecs: specs.filter((s) => s.model === 'epidemic'),
    runSpecLookup: lookup,
  });

  it('are offered as the runs of the model', () => {
    expect(compiled.runs?.map((run) => [run.name, run.parameters, run.stopPeriod])).toEqual([
      ['EpiBase', {}, 500],
      [
        'EpiHighTransmission',
        { minContactTransmissionProbability: 0.05, maxContactTransmissionProbability: 0.2 },
        500,
      ],
      [
        'EpiLowTransmission',
        { minContactTransmissionProbability: 0, maxContactTransmissionProbability: 0.15 },
        500,
      ],
      [
        'EpiZeroTransmission',
        { minContactTransmissionProbability: 0, maxContactTransmissionProbability: 0 },
        500,
      ],
    ]);
  });

  it('draws the curation’s charts', () => {
    const root = new RootScape(compiled, { seed: 1 });
    expect(root.allViews.filter((view) => view.type === 'timeSeries')).toContainEqual({
      type: 'timeSeries',
      title: 'Status',
      series: ['individual.status.dead', 'individual.status.recovered'],
      labels: { 'individual.status.dead': 'Dead', 'individual.status.recovered': 'Well again' },
    });
  });

  it('pass ZeroTransmission with no transmission, and fail it with high transmission', () => {
    const run = (name: string, periods: number) => {
      const setup = compiled.runs!.find((r) => r.name === name)!;
      const root = new RootScape(compiled, {
        // AMP's bound on deaths (0 to 5) is not met on some seeds: those infected at the
        // start die at the case mortality rate, whatever the transmission.
        seed: 1,
        parameters: setup.parameters!,
        stopPeriod: Math.min(setup.stopPeriod!, periods),
      });
      root.run(periods);
      return checkConstraints(root, epidemic, zero.constraints!);
    };
    expect(zero.runSpec).toBe('EpiZeroTransmission');
    const passed = run('EpiZeroTransmission', 500);
    expect(passed.map((result) => result.issue)).toEqual(['none', 'none', 'none']);
    expect(passed[2]!.value).toBe(0);
    const failed = run('EpiHighTransmission', 150);
    expect(failed.map((result) => result.issue)).toContain('aboveRange');
  });

  it('report a measure the run does not collect as not found', () => {
    const root = new RootScape(compileModel(epidemic), { seed: 1 });
    expect(
      checkConstraints(root, epidemic, [
        {
          measure: 'average',
          agent: 'individual',
          attribute: 'outcomePeriod',
          min: 0,
          max: 1,
        },
      ]).map((result) => result.issue),
    ).toEqual(['notFound']);
  });
});
