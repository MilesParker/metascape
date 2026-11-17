// SPDX-License-Identifier: EPL-2.0
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Model } from '../metamodel/types';
import { checkRunSpec, checkRunTest } from '../runspec/check';
import { lookupIn, resolveRunSpec } from '../runspec/runs';
import type { RunSpec } from '../runspec/types';
import { runFileId, translateApar, translateAtest } from './apar';
import { translateMetaabm } from './translate';

const examples = new URL('../../examples/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, examples), 'utf8');

/**
 * The tests of AMP's parameters plug-in (`org.eclipse.amp.amf.parameters.test`,
 * `ParameterInterpreterTest.testFileAccess`): each file's settings, with what it
 * incorporates, as the interpreter's arguments (`Label=value`, the label
 * without spaces). The test said their order is not significant.
 */
describe('the APar tests of AMP', () => {
  const translated = translateMetaabm(read('parameters/TestModel.metaabm')).model!;
  // "Test Boolean" has no sType. The file was saved when the ecore default was
  // BOOLEAN, which the translation of .metaabm files cannot tell (see the
  // review document); these files set it to false, so it is a boolean here.
  const model: Model = structuredClone(translated);
  model.attributes!['testBoolean']!.type = 'boolean';
  const files = [
    'Test',
    'TestSub',
    'TestSubLevel2',
    'TestIncorporateOrder',
    'relative/RelTest',
    'relative/TestProjDir',
  ];
  const specs: RunSpec[] = files.map((file) => {
    const translation = translateApar(read(`parameters/${file}.apar`), {
      id: runFileId(file),
      models: (uri) => (runFileId(uri) === 'TestModel' ? model : undefined),
    });
    expect(translation.diagnostics.filter((d) => d.severity !== 'note')).toEqual([]);
    return translation.value!;
  });
  const lookup = lookupIn(specs);
  const args = (id: string): string[] => {
    const resolved = resolveRunSpec(lookup(id)!, lookup);
    const label = (ref: string) => model.attributes![ref]!.label!.replaceAll(' ', '');
    return [
      ...(resolved.stopPeriod !== undefined ? [`StopPeriod=${resolved.stopPeriod}`] : []),
      ...resolved.parameters.map((p) =>
        p.kind === 'single' ? `${label(p.attribute)}=${String(p.value)}` : '',
      ),
    ].sort();
  };

  it('translate and check without errors', () => {
    for (const spec of specs) expect(checkRunSpec(spec, model, lookup)).toEqual([]);
  });

  it.each([
    [
      'Test',
      [
        'StopPeriod=100',
        'TestSymbol=Hello',
        'TestFloat=1.234',
        'Testint=1234',
        'TestBoolean=false',
      ],
    ],
    [
      'TestSub',
      [
        'TestSymbol=Goodbye',
        'Testint=111',
        'StopPeriod=100',
        'TestFloat=1.234',
        'TestBoolean=false',
      ],
    ],
    [
      'TestSubLevel2',
      [
        'Testint=4321',
        'TestSymbol=Goodbye',
        'StopPeriod=100',
        'TestFloat=1.234',
        'TestBoolean=false',
      ],
    ],
    [
      'TestIncorporateOrder',
      [
        'TestSymbol=Goodbye',
        'Testint=111',
        'StopPeriod=100',
        'TestFloat=1.234',
        'TestBoolean=false',
      ],
    ],
    [
      'RelTest',
      ['TestSymbol=Ola', 'StopPeriod=100', 'TestFloat=1.234', 'Testint=1234', 'TestBoolean=false'],
    ],
  ])('%s', (id, expected) => {
    expect(args(id)).toEqual([...expected].sort());
  });

  it('names attributes by their labels in these older files, and keeps a project path as written', () => {
    const test = translateApar(read('parameters/Test.apar'), { models: () => model });
    expect(test.diagnostics.map((d) => `${d.path} ${d.kind}`)).toEqual([
      'line 2 moved',
      'line 3 moved',
      'line 4 moved',
      'line 5 moved',
      'line 6 moved',
    ]);
    const projectPath = translateApar(read('parameters/relative/TestProjDir.apar'), {
      models: () => model,
    });
    expect(projectPath.value!.parameters).toEqual([
      { kind: 'single', attribute: 'testSymbol', value: '|Blah' },
    ]);
    expect(projectPath.diagnostics.map((d) => d.kind)).toContain('dropped');
  });
});

describe('translating APar', () => {
  const model: Model = {
    schemaVersion: 2,
    id: 'world',
    language: 'typescript',
    attributes: {
      count: { type: 'integer', label: 'Count', default: 10 },
      rate: { type: 'real', label: 'Rate', default: 0.5 },
      fixed: { type: 'integer', immutable: true },
      mode: { type: 'state', options: { calm: {}, wild: {} } },
    },
    spaces: {
      grid: {
        kind: 'grid',
        label: 'Grid',
        neighborhood: 'moore',
        dimensions: ['width'],
        attributes: { width: { type: 'integer', label: 'Width', default: 5 } },
      },
    },
  };
  const translate = (text: string) => translateApar(text, { id: 'spec', models: () => model });

  it('reads names by capitalized ID, sweeps, links and comments', () => {
    const { value, diagnostics } = translate(`"A run" model "World.metaabm"
      // a comment
      Count = 3 /* another */ Rate [0.1, .3, 0.1]
      [ GridWidth [1, 3, 1] Rate = 1 ]
      Mode = "wild"
      StopPeriod = 20 PausePeriod = 5`);
    expect(value).toEqual({
      schemaVersion: 1,
      id: 'spec',
      label: 'A run',
      model: 'world',
      stopPeriod: 20,
      parameters: [
        { kind: 'single', attribute: 'count', value: 3 },
        { kind: 'sweep', attribute: 'rate', start: 0.1, end: 0.3, increment: 0.1 },
        {
          kind: 'link',
          parameters: [
            { kind: 'sweep', attribute: 'grid.width', start: 1, end: 3, increment: 1 },
            { kind: 'single', attribute: 'rate', value: 1 },
          ],
        },
        { kind: 'single', attribute: 'mode', value: 'wild' },
      ],
    });
    expect(diagnostics.map((d) => `${d.path} ${d.severity} ${d.kind}`)).toEqual([
      'line 6 note dropped',
    ]);
  });

  it('reports what it cannot translate, and leaves it out', () => {
    const { value, diagnostics } = translate(`model "World.metaabm"
      Count = 1.5
      Fixed = 1
      Nothing = 1
      Mode = "stormy"
      Mode [1, 2, 1]
      StopPeriod [1, 2, 1]
      Rate = 2`);
    expect(value!.parameters).toEqual([{ kind: 'single', attribute: 'rate', value: 2 }]);
    expect(diagnostics.map((d) => `${d.path} ${d.severity}`)).toEqual([
      'line 2 error',
      'line 3 error',
      'line 4 error',
      'line 5 error',
      'line 6 error',
      'line 7 error',
    ]);
  });

  it('gives a syntax error with its line, and no run spec', () => {
    expect(translate('model "World.metaabm"\nCount 3')).toEqual({
      value: undefined,
      diagnostics: [
        { path: 'line 2', severity: 'error', kind: 'invalid', message: 'Expected `=`, found `3`' },
      ],
    });
    expect(
      translateApar('model "Other.metaabm"', { models: () => undefined }).diagnostics[0]!.message,
    ).toBe('There is no model `Other.metaabm`');
    expect(translate('model "World.metaabm" Count = "open').value).toBeUndefined();
  });

  it('names a run file by its file name', () => {
    expect(runFileId('|params/EpiBase.apar')).toBe('EpiBase');
    expect(runFileId('../Test.apar')).toBe('Test');
    expect(runFileId('EpiBase.apar')).toBe('EpiBase');
  });
});

describe('translating ATest', () => {
  const model: Model = {
    schemaVersion: 2,
    id: 'world',
    language: 'typescript',
    agents: {
      town: {
        kind: 'scape',
        agents: {
          person: {
            kind: 'agent',
            attributes: {
              status: { type: 'state', options: { well: {}, ill: {} } },
              wealth: { type: 'real' },
            },
          },
        },
      },
    },
  };
  const spec: RunSpec = { schemaVersion: 1, id: 'Base', model: 'world' };
  const translate = (text: string, id = 'test') =>
    translateAtest(text, {
      id,
      runSpecs: (uri) => (runFileId(uri) === 'Base' ? spec : undefined),
      models: (modelId) => (modelId === 'world' ? model : undefined),
    });

  it('reads constraints, finding agents at any depth', () => {
    const { value, diagnostics } = translate(`"Name" «About it»
      tests "Base.apar"
      Count(Person.Status=Ill) = [0, 3]
      Average(Person.Wealth)=[1.5,2]`);
    expect(diagnostics).toEqual([]);
    expect(value).toEqual({
      schemaVersion: 1,
      id: 'test',
      label: 'Name',
      description: 'About it',
      runSpec: 'Base',
      constraints: [
        {
          measure: 'count',
          agent: 'town.person',
          attribute: 'status',
          qualifier: 'ill',
          min: 0,
          max: 3,
        },
        { measure: 'average', agent: 'town.person', attribute: 'wealth', min: 1.5, max: 2 },
      ],
    });
    expect(checkRunTest(value!, model, lookupIn([spec]))).toEqual([
      {
        path: 'constraints[0]',
        severity: 'warning',
        message: 'Not recorded: statistics are collected for the agents of the root scape only',
      },
      {
        path: 'constraints[1]',
        severity: 'warning',
        message: 'Not recorded: statistics are collected for the agents of the root scape only',
      },
    ]);
  });

  it('runs the run spec with its own name when it names none', () => {
    const { value, diagnostics } = translate('Count(Person.Status=Well) = [1, 1]', 'Base');
    expect(value!.runSpec).toBe('Base');
    expect(diagnostics.map((d) => d.kind)).toEqual(['defaulted']);
  });

  it('reads a suite', () => {
    expect(translate('"All" contains "A.atest" "B.atest"').value).toEqual({
      schemaVersion: 1,
      id: 'test',
      label: 'All',
      contains: ['A', 'B'],
    });
  });

  it('reports names it cannot resolve', () => {
    const { value, diagnostics } = translate(`tests "Base.apar"
      Count(Animal.Status=Ill) = [0, 1]
      Count(Person.Mood=Ill) = [0, 1]
      Count(Person.Status=Dead) = [0, 1]`);
    expect(value!.constraints).toEqual([]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'The model has no agent `Animal`',
      '`Person` has no attribute `Mood`',
      '`Status` has no option `Dead`',
    ]);
  });
});

describe('the run files of the Escape examples', () => {
  const folder = new URL('escape/', examples);
  const models = new Map(
    readdirSync(folder)
      .filter((name) => name.endsWith('.model.json'))
      .map((name) => [
        name.slice(0, -'.model.json'.length),
        JSON.parse(read(`escape/${name}`)) as Model,
      ]),
  );
  const aparFiles = readdirSync(new URL('params/', folder)).filter((name) =>
    name.endsWith('.apar'),
  );
  const specs = aparFiles.map((file) => {
    const id = runFileId(file);
    return {
      id,
      translation: translateApar(read(`escape/params/${file}`), {
        id,
        models: (uri) => models.get(runFileId(uri)),
      }),
    };
  });
  const lookup = lookupIn(specs.map(({ translation }) => translation.value!));
  const modelOf = (id: string) => [...models.values()].find((model) => model.id === id)!;

  it('are the five run specs and one test there are', () => {
    expect(aparFiles.sort()).toEqual([
      'EpiBase.apar',
      'EpiHighTransmission.apar',
      'EpiLowTransmission.apar',
      'EpiZeroTransmission.apar',
      'EpidemicRegional.apar',
    ]);
    expect(
      readdirSync(new URL('tests/', folder)).filter((name) => name.endsWith('.atest')),
    ).toEqual(['ZeroTransmission.atest']);
  });

  it.each(specs.map(({ id }) => id))('%s translates, checks and is the one committed', (id) => {
    const { translation } = specs.find((spec) => spec.id === id)!;
    expect(translation.diagnostics).toEqual([]);
    expect(checkRunSpec(translation.value!, modelOf(translation.value!.model), lookup)).toEqual([]);
    expect(read(`escape/params/${id}.run.json`)).toBe(
      `${JSON.stringify(translation.value, null, 2)}\n`,
    );
  });

  it('ZeroTransmission translates, checks and is the one committed', () => {
    const translation = translateAtest(read('escape/tests/ZeroTransmission.atest'), {
      id: 'ZeroTransmission',
      runSpecs: (uri) => lookup(runFileId(uri)),
      models: modelOf,
    });
    expect(translation.diagnostics).toEqual([]);
    expect(checkRunTest(translation.value!, modelOf('epidemic'), lookup)).toEqual([]);
    expect(read('escape/tests/ZeroTransmission.test.json')).toBe(
      `${JSON.stringify(translation.value, null, 2)}\n`,
    );
  });
});
