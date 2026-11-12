// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { bool, choice, defineModel, int, real, text } from '..';
import { experimentRuns, range, rowsToCSV, runExperiment } from './index';

const model = defineModel({
  name: 'grid',
  parameters: {
    a: int(0),
    b: int(0),
    c: real(0.5),
    mode: choice(['x', 'y'], 'x'),
    flag: bool(false),
    label: text(''),
  },
  build(sim) {
    sim.observe({
      stepped(s) {
        if (s.tick === 3) s.stop('three');
      },
    });
  },
});

describe('range', () => {
  it('is inclusive and free of drift', () => {
    const r = range(0, 1, 0.1);
    expect(r).toHaveLength(11);
    expect(r[10]).toBe(1);
    expect(r[3]).toBe(0.3);
    expect(range(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('handles integers, single values and steps not hitting the end', () => {
    expect(range(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(range(3, 3, 1)).toEqual([3]);
    expect(range(0, 10, 4)).toEqual([0, 4, 8]);
  });

  it('supports negative steps', () => {
    expect(range(5, 1, -2)).toEqual([5, 3, 1]);
    expect(range(1, 0, -0.25)).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('is empty when the step points away from the end', () => {
    expect(range(0, 5, -1)).toEqual([]);
    expect(range(5, 0, 1)).toEqual([]);
  });

  it('rejects a zero step and non-finite arguments', () => {
    expect(() => range(0, 1, 0)).toThrow(RangeError);
    expect(() => range(0, Infinity, 1)).toThrow(RangeError);
    expect(() => range(NaN, 1, 1)).toThrow(RangeError);
  });
});

describe('experiments', () => {
  const measure = () => ({});

  it('crosses parameters with the first varying slowest', () => {
    const rows = runExperiment(model, {
      parameters: { a: [1, 2], b: [10, 20, 30] },
      maxTicks: 1,
      measure,
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => [r['a'], r['b']])).toEqual([
      [1, 10],
      [1, 20],
      [1, 30],
      [2, 10],
      [2, 20],
      [2, 30],
    ]);
    expect(rows.map((r) => r.run)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('repeats replicates consecutively', () => {
    const rows = runExperiment(model, {
      parameters: { a: [1, 2] },
      replicates: 3,
      maxTicks: 1,
      measure,
    });
    expect(rows.map((r) => [r['a'], r.replicate, r.run])).toEqual([
      [1, 0, 0],
      [1, 1, 1],
      [1, 2, 2],
      [2, 0, 3],
      [2, 1, 4],
      [2, 2, 5],
    ]);
  });

  it('advances linked parameters together and crosses groups with others', () => {
    const rows = runExperiment(model, {
      parameters: { a: [1, 2, 3], c: [0.1, 0.2], b: [7, 8, 9] },
      linked: [['a', 'b']],
      maxTicks: 1,
      measure,
    });
    // Factors in order: the group {a, b} (placed at a's position), then c.
    expect(rows.map((r) => [r['a'], r['b'], r['c']])).toEqual([
      [1, 7, 0.1],
      [1, 7, 0.2],
      [2, 8, 0.1],
      [2, 8, 0.2],
      [3, 9, 0.1],
      [3, 9, 0.2],
    ]);
  });

  it('validates linked groups', () => {
    const base = { maxTicks: 1, measure };
    expect(() =>
      experimentRuns(model, { ...base, parameters: { a: [1, 2], b: [1] }, linked: [['a', 'b']] }),
    ).toThrow(/equal/);
    expect(() =>
      experimentRuns(model, { ...base, parameters: { a: [1] }, linked: [['a', 'b']] }),
    ).toThrow(/no values/);
    expect(() =>
      experimentRuns(model, {
        ...base,
        parameters: { a: [1], b: [1], c: [1] },
        linked: [
          ['a', 'b'],
          ['b', 'c'],
        ],
      }),
    ).toThrow(/more than one/);
  });

  it('validates the design eagerly', () => {
    const base = { maxTicks: 1, measure };
    expect(() => experimentRuns(model, { ...base, replicates: 0 })).toThrow(RangeError);
    expect(() => experimentRuns(model, { ...base, maxTicks: -1 })).toThrow(RangeError);
    expect(() => experimentRuns(model, { ...base, parameters: { a: [] } })).toThrow(/no values/);
    expect(() =>
      experimentRuns(model, { ...base, parameters: { nope: [1] } as unknown as { a: number[] } }),
    ).toThrow(/Unknown/);
    const clash = defineModel({ name: 'c', parameters: { run: int(0) }, build() {} });
    expect(() => experimentRuns(clash, { ...base })).toThrow(/collides/);
  });

  it('runs one default run when no parameters are varied', () => {
    const rows = runExperiment(model, { maxTicks: 1, measure });
    expect(rows).toHaveLength(1);
    expect(rows[0]!['a']).toBe(0);
  });

  it('gives replicates different seeds and repeats identically', () => {
    const design = {
      parameters: { a: [1, 2] },
      replicates: 3,
      seed: 7,
      maxTicks: 2,
      measure: (sim: { random: { int(a: number, b: number): number } }) => ({
        draw: sim.random.int(0, 1_000_000),
      }),
    };
    const first = runExperiment(model, design);
    const again = runExperiment(model, design);
    expect(again).toEqual(first);
    expect(new Set(first.map((r) => r.seed)).size).toBe(6);
    expect(new Set(first.map((r) => r['draw'])).size).toBe(6);
    const other = runExperiment(model, { ...design, seed: 8 });
    expect(other.map((r) => r.seed)).not.toEqual(first.map((r) => r.seed));
  });

  it('reports ticks and stop reasons', () => {
    const rows = runExperiment(model, { parameters: { a: [1] }, maxTicks: 10, measure });
    expect(rows[0]).toMatchObject({ ticks: 3, stopReason: 'three' });
    const capped = runExperiment(model, { maxTicks: 2, measure });
    expect(capped[0]).toMatchObject({ ticks: 2, stopReason: 'maxTicks' });
  });

  it('passes typed parameter overrides to the simulation and measures it', () => {
    const rows = runExperiment(model, {
      parameters: { mode: ['x', 'y'], flag: [true], label: ['hi'] },
      maxTicks: 1,
      measure: (sim) => ({ seenMode: sim.parameters.mode, size: sim.scapes.length }),
    });
    expect(rows.map((r) => r['seenMode'])).toEqual(['x', 'y']);
    expect(rows[0]).toMatchObject({ flag: true, label: 'hi', a: 0, size: 0 });
    // Parameter columns precede measures; built-ins come first.
    expect(Object.keys(rows[0]!).slice(0, 5)).toEqual([
      'run',
      'replicate',
      'seed',
      'ticks',
      'stopReason',
    ]);
    expect(Object.keys(rows[0]!).at(-1)).toBe('size');
  });

  it('rejects wrongly typed values at compile time and invalid ones at run time', () => {
    const base = { maxTicks: 1, measure };
    // @ts-expect-error 'z' is not a choice option
    expect(() => runExperiment(model, { ...base, parameters: { mode: ['z'] } })).toThrow();
    // @ts-expect-error a is a number
    expect(() => runExperiment(model, { ...base, parameters: { a: ['s'] } })).toThrow();
  });

  it('calls setup on each fresh simulation before running', () => {
    const ticksAtSetup: number[] = [];
    runExperiment(model, {
      parameters: { a: [1, 2] },
      maxTicks: 1,
      setup: (sim) => ticksAtSetup.push(sim.tick),
      measure,
    });
    expect(ticksAtSetup).toEqual([0, 0]);
  });

  it('throws when a measure collides with a built-in or parameter column', () => {
    expect(() => runExperiment(model, { maxTicks: 1, measure: () => ({ ticks: 1 }) })).toThrow(
      /collides/,
    );
    expect(() => runExperiment(model, { maxTicks: 1, measure: () => ({ a: 1 }) })).toThrow(
      /collides/,
    );
  });

  it('yields rows lazily so the caller can abort', () => {
    let runs = 0;
    const gen = experimentRuns(model, {
      parameters: { a: range(1, 100, 1) },
      maxTicks: 1,
      setup: () => runs++,
      measure,
    });
    gen.next();
    gen.next();
    gen.return();
    expect(runs).toBe(2);
  });
});

describe('rowsToCSV', () => {
  it('formats a small example exactly', () => {
    const csv = rowsToCSV([
      { run: 0, name: 'plain', ok: true, score: 1.5 },
      { run: 1, name: 'a,b', ok: false, score: -2 },
      { run: 2, name: 'say "hi"', ok: true, score: 0 },
      { run: 3, name: 'two\nlines', ok: false, score: 1e21 },
    ]);
    expect(csv).toBe(
      [
        'run,name,ok,score',
        '0,plain,true,1.5',
        '1,"a,b",false,-2',
        '2,"say ""hi""",true,0',
        '3,"two\nlines",false,1e+21',
      ].join('\n'),
    );
  });

  it('handles no rows and missing keys', () => {
    expect(rowsToCSV([])).toBe('');
    expect(rowsToCSV([{ a: 1, b: 2 }, { a: 3 }])).toBe('a,b\n1,2\n3,');
  });

  it('works on experiment output', () => {
    const rows = runExperiment(model, {
      parameters: { a: [1, 2] },
      seed: 0,
      maxTicks: 1,
      measure: () => ({ m: true }),
    });
    const lines = rowsToCSV(rows).split('\n');
    expect(lines[0]).toBe('run,replicate,seed,ticks,stopReason,a,b,c,mode,flag,label,m');
    expect(lines).toHaveLength(3);
  });
});
