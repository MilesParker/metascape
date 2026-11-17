// SPDX-License-Identifier: EPL-2.0
import { Random } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { coreLibrary } from './core-library';
import {
  coreFunctions,
  StyleAccumulator,
  type Argument,
  type CallContext,
  type InputInfo,
  type ValueType,
} from './functions';
import type { Library } from './types';

function ids(library: Library): string[] {
  return [
    ...Object.keys(library.functions ?? {}),
    ...Object.values(library.subs ?? {}).flatMap(ids),
  ];
}

const context = (seed = 1, style?: StyleAccumulator): CallContext => ({
  random: new Random(seed),
  period: 7,
  style,
});

/** Calls a value function with inputs of the given types. */
function call(
  id: string,
  args: readonly Argument[],
  types: readonly ValueType[] = args.map((a) =>
    typeof a === 'number' ? (Number.isInteger(a) ? 'integer' : 'real') : 'generic',
  ),
  options?: InputInfo['options'],
  ctx: CallContext = context(),
) {
  const impl = coreFunctions[id];
  if (impl?.kind !== 'value') throw new Error(`${id} is not a value function`);
  const inputs = types.map((type, i): InputInfo =>
    i === 0 && options ? { type, options } : { type },
  );
  return impl.compile({
    inputs,
    optionsOf: (type) => (type === 'state:person.status' ? ['well', 'ill', 'dead'] : undefined),
  })(args, ctx);
}

describe('the core functions', () => {
  it('implement every function of the core library', () => {
    expect(ids(coreLibrary).filter((id) => !(id in coreFunctions))).toEqual([]);
  });

  it('compare and combine as the generators do', () => {
    expect(call('identical', ['a', 'a'])).toBe(true);
    expect(call('different', [1, 2])).toBe(true);
    expect(call('greaterorEqual', [2, 2])).toBe(true);
    expect(call('lesser', [2, 2])).toBe(false);
    expect(call('not', [true])).toBe(false);
    expect(call('identity', [true])).toBe(true);
    expect(call('increment', [4])).toBe(5);
    expect(call('neg', [4])).toBe(-4);
  });

  it('divide integers as Java does, and reals as reals', () => {
    expect(call('div', [7, 2])).toBe(3);
    expect(call('div', [-7, 2])).toBe(-3);
    expect(call('div', [7, 2], ['real', 'integer'])).toBe(3.5);
    expect(call('mod', [-7, 2])).toBe(-1);
    expect(() => call('div', [1, 0])).toThrow(/division by zero/);
    expect(call('div', [1, 0], ['real', 'real'])).toBe(Infinity);
    // A numeric constant beside an integer works in integers.
    expect(call('div', [7, 2], ['integer', 'numeric'])).toBe(3);
  });

  it('draw random numbers as Ascape does, from the stream they are given', () => {
    const ints = new Set<number>();
    const reals: number[] = [];
    const ctx = context(3);
    for (let i = 0; i < 400; i++) {
      ints.add(call('randomInRange', [2, 4], undefined, undefined, ctx) as number);
      reals.push(call('randomInRange', [2, 4], ['real', 'real'], undefined, ctx) as number);
    }
    // Integers: both ends inclusive. Reals: the upper end exclusive.
    expect([...ints].sort()).toEqual([2, 3, 4]);
    expect(reals.every((r) => r >= 2 && r < 4)).toBe(true);
    const limits = new Set<number>();
    for (let i = 0; i < 200; i++)
      limits.add(call('randomToLimit', [3], undefined, undefined, ctx) as number);
    expect([...limits].sort()).toEqual([0, 1, 2]);
    expect(call('randomUnit', [], [], undefined, context(5))).toBe(
      call('randomUnit', [], [], undefined, context(5)),
    );
    const states = new Set<unknown>();
    for (let i = 0; i < 100; i++) {
      states.add(call('randomState', ['well'], ['state:person.status'], undefined, ctx));
    }
    expect([...states].sort()).toEqual(['dead', 'ill', 'well']);
  });

  it('work out distributions from the attributes listed for each option (R22)', () => {
    const options = [['well', 'ill']];
    // Additive: the base, plus the attribute for the agent's option.
    expect(call('additiveDistribution', [['ill'], [10, 1, 2]], ['generic', 'real'], options)).toBe(
      12,
    );
    // Cross: the attribute for the combination of options.
    expect(call('crossDistribution', [['ill'], [5, 6]], ['generic', 'real'], options)).toBe(6);
    // A parameter given as one attribute does not vary.
    expect(call('crossDistribution', [[], [5]], ['generic', 'real'])).toBe(5);
    const drawn = call(
      'uniformAdditiveDistribution',
      [[], [10], [20]],
      ['generic', 'real', 'real'],
    ) as number;
    expect(drawn).toBeGreaterThanOrEqual(10);
    expect(drawn).toBeLessThan(20);
  });

  it('declare how an agent looks, into the style being worked out', () => {
    const style = new StyleAccumulator();
    const ctx = context(1, style);
    call('colorRGB', [1, 0.5, 0], ['real', 'real', 'real'], undefined, ctx);
    call('shapeOval', [], [], undefined, ctx);
    call('graphicFill', [], [], undefined, ctx);
    call('colorBlack', [], [], undefined, ctx);
    call('graphicOutline', [], [], undefined, ctx);
    expect(style.marks).toEqual([
      { shape: 'oval', color: 0xff8000, fill: true, inset: 0 },
      { shape: 'oval', color: 0x000000, fill: false, inset: 0 },
    ]);
    // Outside a style, drawing does nothing.
    expect(call('graphicFill', [], [])).toBeUndefined();
  });

  it('follow java.lang.Math', () => {
    expect(call('rint', [2.5], ['real'])).toBe(2);
    expect(call('rint', [3.5], ['real'])).toBe(4);
    expect(call('IEEEremainder', [5, 2], ['real', 'real'])).toBe(1);
    expect(call('ulp', [1], ['real'])).toBe(Number.EPSILON);
    expect(call('signum', [-3], ['real'])).toBe(-1);
    expect(call('hypotuneuse', [3, 4], ['real', 'real'])).toBe(5);
    expect(call('timeNow', [], [])).toBe(7);
  });

  it('leave spatial terms to selections', () => {
    for (const id of ['nearest', 'within', 'neighbor', 'here', 'available', 'all', 'minimize']) {
      expect(coreFunctions[id]?.kind).toBe('spatial');
    }
  });
});
