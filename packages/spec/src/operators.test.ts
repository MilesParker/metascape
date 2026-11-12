// SPDX-License-Identifier: EPL-2.0
import { Random, Simulation, type GridViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { checkModel } from './check';
import { compileModel } from './compile';
import { OPERATORS } from './operators';
import { readAttribute } from './runtime';
import { operators, type Expression, type ModelSpec, type Operator } from './schema';

type ValueType = 'int' | 'real' | 'boolean';

/** Evaluates an expression as the initial value of a lone agent's attribute. */
function evaluate(expression: Expression, type: ValueType, seed = 1): number | boolean | string {
  const spec: ModelSpec = {
    schemaVersion: 1,
    name: 'Probe',
    parameters: {
      n: { type: 'int', default: 3 },
      p: { type: 'real', default: 2.5 },
      flag: { type: 'boolean', default: true },
    },
    agents: {
      probe: {
        count: 1,
        attributes: {
          mood: { type: 'state', states: ['calm', 'angry'], initial: { state: 'angry' } },
          out: { type, initial: expression },
        },
      },
    },
  };
  expect(checkModel(spec)).toEqual([]);
  const sim = new Simulation(compileModel(spec), { seed });
  return readAttribute(sim.scape('probe').members[0]!, 'out');
}

const op = (name: Operator, ...args: Expression[]): Expression => ({ op: name, args });

/** The probe agent's random stream: the first scape's fork of the simulation's stream. */
const stream = (seed = 1): Random => new Random(seed).fork();

const cases: [string, Expression, ValueType, number | boolean][] = [
  ['add', op('add', 2, 3), 'int', 5],
  ['add', op('add', 1, 2, 3, 4), 'int', 10],
  ['add', op('add', 1.5, 'param.n'), 'real', 4.5],
  ['sub', op('sub', 5, 7), 'int', -2],
  ['mul', op('mul', 2, 3, 4), 'int', 24],
  ['div', op('div', 7, 2), 'real', 3.5],
  ['mod', op('mod', 7, 3), 'int', 1],
  ['mod', op('mod', -7, 3), 'int', 2],
  ['mod', op('mod', 7, -3), 'int', -2],
  ['mod', op('mod', 5.5, 2), 'real', 1.5],
  ['pow', op('pow', 2, 10), 'real', 1024],
  ['pow', op('pow', 4, 0.5), 'real', 2],
  ['neg', op('neg', 4), 'int', -4],
  ['abs', op('abs', -3.5), 'real', 3.5],
  ['min', op('min', 3, 1, 2), 'int', 1],
  ['max', op('max', 3, 9, 2), 'int', 9],
  ['clamp', op('clamp', 12, 0, 10), 'int', 10],
  ['clamp', op('clamp', -1, 0, 10), 'int', 0],
  ['clamp', op('clamp', 'param.p', 0, 10), 'real', 2.5],
  ['floor', op('floor', 2.7), 'int', 2],
  ['floor', op('floor', -2.5), 'int', -3],
  ['ceil', op('ceil', 2.1), 'int', 3],
  ['round', op('round', 2.5), 'int', 3],
  ['round', op('round', -2.5), 'int', -2],
  ['sqrt', op('sqrt', 16), 'real', 4],
  ['exp', op('exp', 0), 'real', 1],
  ['log', op('log', 1), 'real', 0],
  ['sin', op('sin', 0), 'real', 0],
  ['cos', op('cos', 0), 'real', 1],
  ['atan2', op('atan2', 1, 1), 'real', Math.PI / 4],
  ['atan2', op('atan2', 0, -1), 'real', Math.PI],
  ['eq', op('eq', 2, 2.0), 'boolean', true],
  ['eq', op('eq', 'param.flag', true), 'boolean', true],
  ['eq', op('eq', 'mood', { state: 'angry' }), 'boolean', true],
  ['eq', op('eq', { state: 'calm' }, 'mood'), 'boolean', false],
  ['eq', op('eq', { color: '#ff0000' }, op('rgb', 255, 0, 0)), 'boolean', true],
  ['ne', op('ne', 1, 2), 'boolean', true],
  ['ne', op('ne', 'mood', { state: 'angry' }), 'boolean', false],
  ['lt', op('lt', 1, 2), 'boolean', true],
  ['le', op('le', 2, 2), 'boolean', true],
  ['gt', op('gt', 1, 2), 'boolean', false],
  ['ge', op('ge', 2, 3), 'boolean', false],
  ['and', op('and', true, true, false), 'boolean', false],
  ['and', op('and', true, 'param.flag'), 'boolean', true],
  ['or', op('or', false, false, true), 'boolean', true],
  ['or', op('or', false, false), 'boolean', false],
  ['not', op('not', false), 'boolean', true],
  ['if', op('if', true, 1, 2), 'int', 1],
  ['if', op('if', false, 1, 2.5), 'real', 2.5],
  ['if', op('eq', op('if', false, { state: 'calm' }, 'mood'), { state: 'angry' }), 'boolean', true],
  ['rgb', op('eq', op('rgb', 300, -4, 16.4), { color: '#ff0010' }), 'boolean', true],
  [
    'mix',
    op('eq', op('mix', { color: '#000000' }, { color: '#ffffff' }, 0.5), op('rgb', 128, 128, 128)),
    'boolean',
    true,
  ],
  [
    'mix',
    op('eq', op('mix', { color: '#102030' }, { color: '#ffffff' }, -1), { color: '#102030' }),
    'boolean',
    true,
  ],
];

describe('operators', () => {
  it('has a signature for every operator of the format', () => {
    const all = Object.values(operators).flat();
    expect(Object.keys(OPERATORS).sort()).toEqual([...all].sort());
  });

  it.each(cases)('%s: %j', (_name, expression, type, expected) => {
    const value = evaluate(expression, type);
    if (typeof expected === 'number') expect(value).toBeCloseTo(expected, 12);
    else expect(value).toBe(expected);
  });

  it('covers every operator with hand-computed cases', () => {
    const covered = new Set([
      ...cases.map(([name]) => name),
      'random',
      'randomInt',
      'randomReal',
      'chance',
      'distance',
    ]);
    for (const name of Object.keys(OPERATORS)) expect(covered).toContain(name);
  });

  it('draws random numbers from the acting agent stream', () => {
    expect(evaluate(op('random'), 'real', 5)).toBe(stream(5).float());
    expect(evaluate(op('randomInt', 1, 6), 'int', 5)).toBe(1 + stream(5).int(0, 6));
    expect(evaluate(op('randomInt', 4, 4), 'int', 5)).toBe(4);
    expect(evaluate(op('randomInt', 4, 2), 'int', 5)).toBe(4);
    expect(evaluate(op('randomReal', 2, 4), 'real', 5)).toBe(2 + stream(5).float() * 2);
    expect(evaluate(op('chance', 0.5), 'boolean', 5)).toBe(stream(5).chance(0.5));
    expect(evaluate(op('chance', 0), 'boolean', 5)).toBe(false);
    expect(evaluate(op('chance', 1), 'boolean', 5)).toBe(true);
  });

  it('short-circuits and, or and if', () => {
    // A skipped random draw leaves the stream untouched for the next one.
    const first = stream(9).float();
    const skipAnd = op('if', op('and', false, op('chance', 0.5)), 0, op('random'));
    const skipOr = op('if', op('or', true, op('chance', 0.5)), op('random'), 0);
    const skipIf = op('if', true, op('random'), op('randomReal', 0, 1));
    expect(evaluate(skipAnd, 'real', 9)).toBe(first);
    expect(evaluate(skipOr, 'real', 9)).toBe(first);
    expect(evaluate(skipIf, 'real', 9)).toBe(first);
  });

  it('measures distance on grids and in continuous spaces', () => {
    const grid = (wrap: boolean, neighborhood: 'moore' | 'vonNeumann'): number => {
      const spec: ModelSpec = {
        schemaVersion: 1,
        name: 'Distances',
        spaces: { land: { kind: 'grid', width: 5, height: 5, wrap, neighborhood } },
        agents: {
          patch: {
            space: 'land',
            as: 'cell',
            attributes: {
              far: {
                type: 'real',
                initial: {
                  aggregate: 'max',
                  over: { type: 'patch', from: 'all' },
                  of: op('distance', 'self', 'other'),
                },
              },
            },
          },
        },
      };
      const sim = new Simulation(compileModel(spec), { seed: 1 });
      return readAttribute(sim.scape('patch').members[0]!, 'far') as number;
    };
    expect(grid(false, 'moore')).toBe(4);
    expect(grid(false, 'vonNeumann')).toBe(8);
    expect(grid(true, 'moore')).toBe(2);
    expect(grid(true, 'vonNeumann')).toBe(4);

    const continuous: ModelSpec = {
      schemaVersion: 1,
      name: 'Points',
      spaces: { room: { kind: 'continuous', width: 10, height: 10, wrap: false } },
      agents: {
        dot: {
          space: 'room',
          count: 2,
          attributes: {
            gap: { type: 'real' },
            dx: { type: 'real' },
          },
          rules: [
            {
              name: 'measure',
              do: [
                {
                  with: { type: 'dot', from: 'all' },
                  do: [
                    { set: 'gap', to: op('distance', 'self', 'other') },
                    { set: 'dx', to: op('sub', 'other.x', 'self.x') },
                  ],
                },
              ],
            },
          ],
        },
      },
    };
    const sim = new Simulation(compileModel(continuous), { seed: 4 });
    sim.step();
    const [a, b] = sim.scape('dot').members as unknown as { x: number; y: number }[];
    const expected = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    expect(readAttribute(sim.scape('dot').members[0]!, 'gap')).toBeCloseTo(expected, 12);
    expect(readAttribute(sim.scape('dot').members[0]!, 'dx')).toBeCloseTo(b!.x - a!.x, 12);
  });

  it('evaluates colours in views', () => {
    const spec: ModelSpec = {
      schemaVersion: 1,
      name: 'Colours',
      spaces: { land: { kind: 'grid', width: 3, height: 1, wrap: false } },
      agents: {
        patch: {
          space: 'land',
          as: 'cell',
          style: {
            color: op('mix', { color: '#000000' }, op('rgb', 200, 100, 0), op('div', 'self.x', 2)),
          },
        },
      },
    };
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    const view = sim.views[0] as GridViewSpec;
    const cells = sim.scape('patch').members as GridViewSpec['grid']['members'];
    expect(cells.map((cell) => view.cellColor!(cell))).toEqual([0x000000, 0x643200, 0xc86400]);
  });
});
