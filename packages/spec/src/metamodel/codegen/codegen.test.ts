// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { examples, exampleRuns, stupidModel1 } from '../examples';
import { compileModel, generationReport, type CompileOptions } from '../interpreter';
import { traceRun } from '../trace';
import type { Model } from '../types';
import { code, Emitter, name, number, string, textOf, UnsafeNameError, type Code } from './emit';

/** Text that would change a program if it were put into one as code. */
const HOSTILE = [
  `"; globalThis.__metascapePwned = 1; "`,
  `'; globalThis.__metascapePwned = 1; '`,
  '`; globalThis.__metascapePwned = 1; `',
  '${globalThis.__metascapePwned = 1}',
  '*/ globalThis.__metascapePwned = 1; /*',
  '\u2028globalThis.__metascapePwned = 1;\u2029',
  '\n//# sourceURL=evil.js\nglobalThis.__metascapePwned = 1;',
  '</script><script>globalThis.__metascapePwned = 1</script>',
  '\\"); globalThis.__metascapePwned = 1; ("',
  '__proto__',
  'constructor',
];

const pwned = () => (globalThis as { __metascapePwned?: unknown }).__metascapePwned;

const compile = (
  model: Model,
  execution: 'interpreted' | 'generated',
  options: CompileOptions = {},
) => compileModel(model, { ...options, execution });

const sourcesOf = (model: Model) => generationReport(compile(model, 'generated'))!.sources;

/** A copy of a model with every label, plural label and description replaced. */
function relabelled(model: Model, text: string): Model {
  const copy = JSON.parse(JSON.stringify(model)) as Record<string, unknown>;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['label', 'pluralLabel', 'description']) {
        if (typeof record[key] === 'string') record[key] = text;
      }
      Object.values(record).forEach(visit);
    }
  };
  visit(copy);
  return copy as unknown as Model;
}

/** Life, with a rule that sets a symbol attribute to a literal and tests it. */
function withLiteral(literal: string): Model {
  const model = JSON.parse(JSON.stringify(examples.life)) as Model;
  const cell = model.agents!.cell! as {
    attributes: Record<string, unknown>;
    acts: Record<string, unknown>;
  };
  cell.attributes.note = { type: 'symbol', default: '' };
  cell.attributes.same = { type: 'boolean' };
  cell.acts.noteRule = { kind: 'rule', targets: ['writeNote'] };
  cell.acts.writeNote = {
    kind: 'set',
    selected: 'noteRule',
    attribute: 'cell.note',
    parameter: { literal },
    targets: ['sameNote'],
  };
  cell.acts.sameNote = {
    kind: 'query',
    selected: 'noteRule',
    function: 'identical',
    inputs: [{ attribute: 'cell.note' }, { literal }],
    targets: ['markSame'],
  };
  cell.acts.markSame = {
    kind: 'set',
    selected: 'noteRule',
    attribute: 'cell.same',
    parameter: { constant: 'true' },
  };
  return model;
}

describe('emitting generated code', () => {
  it('makes names only from IDs, behind a prefix', () => {
    expect(textOf(name('a', 'bug.energy'))).toBe('a_bug$energy');
    expect(textOf(name('r', 'moves.step', 3))).toBe('r_moves$step$3');
    expect(textOf(name('t', ''))).toBe('t_');
    expect(textOf(name('a', '__proto__'))).toBe('a___proto__');
    expect(textOf(name('a', 'constructor'))).toBe('a_constructor');
    for (const hostile of [
      ...HOSTILE.filter((h) => !/^[A-Za-z_]\w*$/.test(h)),
      'a b',
      'a-b',
      '1a',
      'a$b',
      'a.',
      '.a',
      'a..b',
    ]) {
      expect(() => name('a', hostile), hostile).toThrow(UnsafeNameError);
    }
    expect(() => name('z' as 'a', 'x')).toThrow(UnsafeNameError);
    expect(() => name('a', -1)).toThrow(UnsafeNameError);
    expect(() => name('a', 1.5)).toThrow(UnsafeNameError);
  });

  it('writes numbers only if they are finite', () => {
    expect(textOf(number(3))).toBe('3');
    expect(textOf(number(-2.5))).toBe('(-2.5)');
    expect(textOf(number(-0))).toBe('(-0)');
    expect(textOf(number(1e21))).toBe('1e+21');
    for (const bad of [NaN, Infinity, -Infinity, '1' as unknown as number]) {
      expect(() => number(bad)).toThrow();
    }
  });

  it('writes strings as JSON literals that evaluate to the same string', () => {
    for (const hostile of HOSTILE) {
      const literal = textOf(string(hostile));
      expect(literal).not.toMatch(/[\u2028\u2029\n]/);
      expect(new Function(`'use strict'; return ${literal};`)()).toBe(hostile);
    }
    expect(pwned()).toBeUndefined();
  });

  it('puts only code into code', () => {
    expect(() => code`x = ${'1; evil()' as unknown as Code}`).toThrow(TypeError);
    expect(() => code`x = ${{ toString: () => 'evil()' } as unknown as Code}`).toThrow(TypeError);
  });

  it('passes other values as constants', () => {
    const emitter = new Emitter();
    const value = { hostile: HOSTILE[0] };
    const named = emitter.constant(value, 'k', 'thing');
    expect(textOf(emitter.datum(NaN))).toMatch(/^k_\$?\d*$|^k_$/);
    const run = emitter.build<() => unknown>(code`return () => ${named};`, ['test'], {});
    expect(run()).toBe(value);
    expect(emitter.source(code``, ['test'])).toContain('//# sourceURL=metascape/test.js');
    expect(() => emitter.source(code``, ['../evil'])).toThrow(UnsafeNameError);
  });
});

describe('generated code from hostile models', () => {
  it('is the same program whatever the labels and descriptions say', () => {
    for (const model of [examples.life!, examples.schelling!, examples.forager!]) {
      const plain = sourcesOf(model);
      for (const hostile of HOSTILE) {
        expect(sourcesOf(relabelled(model, hostile))).toEqual(plain);
      }
    }
    expect(pwned()).toBeUndefined();
  });

  it('keeps literal strings as data', () => {
    for (const hostile of HOSTILE) {
      const model = compile(withLiteral(hostile), 'generated');
      expect(generationReport(model)!.interpreted).toEqual([]);
      const root = new RootScape(model, { seed: 1 });
      root.run(2);
      const isCell = (agent: unknown) => (agent as { info?: { id?: string } }).info?.id === 'cell';
      const cells = root.scapes.find((scape) => scape.members.some(isCell))!;
      const cell = cells.members[0] as unknown as { values: unknown[] };
      expect(cell.values).toContain(hostile);
      expect(cell.values).toContain(true);
      expect(traceRun(model, { seed: 1, periods: 3 })).toEqual(
        traceRun(compile(withLiteral(hostile), 'interpreted'), { seed: 1, periods: 3 }),
      );
    }
    expect(pwned()).toBeUndefined();
  });

  it('runs models whose IDs are names JavaScript gives meaning to', () => {
    const json = JSON.stringify(examples.life)
      .replaceAll('"live"', '"__proto__"')
      .replaceAll('cell.live', 'cell.__proto__')
      .replaceAll('"count"', '"constructor"')
      .replaceAll('"selected":"count"', '"selected":"constructor"');
    const model = JSON.parse(json) as Model;
    const generated = compile(model, 'generated');
    expect(generationReport(generated)!.interpreted).toEqual([]);
    expect(traceRun(generated, { seed: 3, periods: 5 })).toEqual(
      traceRun(compile(model, 'interpreted'), { seed: 3, periods: 5 }),
    );
  });

  it('is never made from a model whose IDs are not IDs', () => {
    const bad = 'a"]; globalThis.__metascapePwned = 1; //';
    const model = JSON.parse(
      JSON.stringify(examples.life)
        .replaceAll('"live"', JSON.stringify(bad))
        .replaceAll('cell.live', `cell.${bad.replaceAll('"', '\\"')}`),
    ) as Model;
    // The checker rejects it; were it not to, the emitter checks each ID again (see above).
    expect(() => compile(model, 'generated')).toThrow(/Invalid key/);
    expect(pwned()).toBeUndefined();
  });
});

describe('generated execution of the examples', () => {
  const cases: [string, Model, CompileOptions][] = [
    ...Object.entries(examples).map(([key, model]): [string, Model, CompileOptions] => [
      key,
      model,
      exampleRuns[key] ? { runSpec: exampleRuns[key] } : {},
    ]),
    ['stupidModel1', stupidModel1, {}],
  ];

  it.each(cases)('%s runs as the interpreter runs it, period by period', (_, model, options) => {
    const generated = compile(model, 'generated', options);
    expect(generationReport(generated)!.interpreted).toEqual([]);
    for (const seed of [1, 2]) {
      expect(traceRun(generated, { seed, periods: 20 })).toEqual(
        traceRun(compile(model, 'interpreted', options), { seed, periods: 20 }),
      );
    }
  });

  it('names each source as a file and keeps model text out of it', () => {
    const sources = sourcesOf(examples.forager!);
    expect([...sources.keys()]).toContain('foragers/forager');
    for (const [file, source] of sources) {
      expect(source.trimEnd().endsWith(`//# sourceURL=metascape/${file}.js`)).toBe(true);
      expect(source).not.toMatch(/\/\*|(^|[^:])\/\/(?!# sourceURL)/m);
    }
  });
});
